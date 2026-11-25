"""
AETIS Central Engine — Authenticated Real-Time WebSocket Router
Enforces JWT authentication (4401), role/room authorization (4403), short-lived
scoped DB sessions per message (avoiding DB pool exhaustion), and dead-socket cleanup.
"""

import asyncio
from contextlib import contextmanager
from datetime import datetime, timezone
import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.core.database import get_db
from app.core.dependencies import authenticate_access_token, require_role
from app.models.user import User
from app.models.vehicle import Vehicle
from app.schemas.telemetry import LocationUpdatePayload
from app.services.telemetry_service import process_location_update
from app.services.websocket_manager import manager

logger = logging.getLogger("aetis.websocket")

router = APIRouter(tags=["WebSockets"])

CLOSE_UNAUTHORIZED = 4401
CLOSE_FORBIDDEN = 4403
HEARTBEAT_IDLE_TIMEOUT_SECONDS = 90.0


@contextmanager
def _scoped_db(websocket: WebSocket):
    """Acquire a short-lived DB session respecting app.dependency_overrides[get_db]."""
    provider = websocket.app.dependency_overrides.get(get_db, get_db)
    gen = provider()
    db = next(gen)
    try:
        yield db
    finally:
        try:
            next(gen, None)
        except Exception:
            pass


def _extract_ws_token(websocket: WebSocket, query_token: Optional[str]) -> Optional[str]:
    if query_token and query_token.strip():
        return query_token.strip()
    auth_header = websocket.headers.get("Authorization") or websocket.headers.get("authorization")
    if auth_header:
        if auth_header.startswith("Bearer "):
            return auth_header[7:].strip()
        return auth_header.strip()
    cookie_token = websocket.cookies.get("access_token") or websocket.cookies.get("token")
    if cookie_token:
        return cookie_token.strip()
    return None


def _is_room_allowed(user: User, room: str) -> bool:
    role = (user.role or "").strip().upper()
    if role in {"ADMIN", "DISPATCHER"}:
        return True
    if role == "DRIVER":
        return room == "signals" or room.startswith("emergency:") or room.startswith("custom:")
    if role == "HOSPITAL":
        return bool(user.hospital_id) and room == f"hospital:{user.hospital_id}"
    return False


def resolve_rooms(
    user: User,
    emergency_id: Optional[str] = None,
    hospital_id: Optional[str] = None,
) -> List[str]:
    """Compute initial authorized rooms from the authenticated user's verified role."""
    role = (user.role or "").strip().upper()
    rooms: List[str] = []

    if role in {"ADMIN", "DISPATCHER"}:
        rooms.extend(["dispatchers", "signals"])
        if emergency_id:
            rooms.append(f"emergency:{emergency_id}")
        if hospital_id:
            rooms.append(f"hospital:{hospital_id}")
    elif role == "DRIVER":
        rooms.append("signals")
        if emergency_id:
            rooms.append(f"emergency:{emergency_id}")
    elif role == "HOSPITAL":
        if user.hospital_id:
            rooms.append(f"hospital:{user.hospital_id}")

    # Preserve insertion order while deduplicating
    return list(dict.fromkeys(rooms))


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(default=None, description="Optional JWT access token (or use HttpOnly cookie)"),
    client_type: Optional[str] = Query(default=None, description="Hint only; authoritative role comes from verified JWT"),
    emergency_id: Optional[str] = Query(default=None, description="Active emergency incident ID"),
    hospital_id: Optional[str] = Query(default=None, description="Hospital identifier"),
):
    """
    Authenticated WebSocket endpoint with role-validated room subscription,
    heartbeat timeout management, and short-lived scoped DB sessions per message.
    """
    await websocket.accept()

    raw_token = _extract_ws_token(websocket, token)
    if not raw_token:
        await websocket.close(code=CLOSE_UNAUTHORIZED, reason="Missing authentication token")
        return

    try:
        with _scoped_db(websocket) as db:
            user = authenticate_access_token(raw_token, db)
            user_id = user.id
            user_role = (user.role or "").strip().upper()
            user_hospital_id = user.hospital_id
            user_obj = User(
                id=user.id,
                email=user.email,
                role=user_role,
                hospital_id=user_hospital_id,
                is_active=user.is_active,
            )
    except HTTPException as exc:
        close_code = CLOSE_FORBIDDEN if exc.status_code == 403 else CLOSE_UNAUTHORIZED
        await websocket.close(code=close_code, reason=str(exc.detail))
        return
    except Exception:
        await websocket.close(code=CLOSE_UNAUTHORIZED, reason="Authentication failed")
        return

    # Validate explicit hospital room request matches hospital user's own facility
    if user_role == "HOSPITAL" and (
        not user_hospital_id or (hospital_id and hospital_id != user_hospital_id)
    ):
        await websocket.close(code=CLOSE_FORBIDDEN, reason="Hospital room forbidden")
        return

    rooms = resolve_rooms(user_obj, emergency_id=emergency_id, hospital_id=hospital_id)
    for room in rooms:
        await manager.connect(websocket, room)

    try:
        await websocket.send_json(
            {
                "type": "connection.established",
                "data": {
                    "client_type": user_role.lower(),
                    "role": user_role,
                    "rooms": rooms,
                    "connected_at": datetime.now(timezone.utc).isoformat(),
                },
            }
        )
    except Exception as exc:
        logger.error("Failed to send initial acknowledgment: %s", exc)
        manager.disconnect_client(websocket)
        return

    try:
        while True:
            raw_text = await asyncio.wait_for(
                websocket.receive_text(),
                timeout=HEARTBEAT_IDLE_TIMEOUT_SECONDS,
            )
            try:
                message = json.loads(raw_text)
            except Exception:
                message = {"type": raw_text}

            msg_type = message.get("type") if isinstance(message, dict) else str(message)

            if msg_type == "ping":
                await websocket.send_json(
                    {
                        "type": "pong",
                        "data": {"timestamp": datetime.now(timezone.utc).isoformat()},
                    }
                )

            elif msg_type == "pong":
                pass

            elif msg_type == "tracking:update_location":
                if user_role not in {"DRIVER", "DISPATCHER", "ADMIN"}:
                    await websocket.send_json(
                        {"type": "error", "data": {"message": "Insufficient role for telemetry"}}
                    )
                    continue

                payload_raw = message.get("data")
                if not isinstance(payload_raw, dict):
                    await websocket.send_json(
                        {
                            "type": "error",
                            "data": {"message": "Missing 'data' dictionary for tracking:update_location"},
                        }
                    )
                    continue

                try:
                    payload = LocationUpdatePayload(**payload_raw)
                    with _scoped_db(websocket) as db:
                        if user_role == "DRIVER":
                            veh = db.query(Vehicle).filter(Vehicle.id == payload.vehicle_id).first()
                            if not veh or veh.current_driver_id != user_id:
                                await websocket.send_json(
                                    {
                                        "type": "error",
                                        "data": {
                                            "code": "FORBIDDEN",
                                            "message": "Forbidden: vehicle is not assigned to this driver",
                                        },
                                    }
                                )
                                continue
                        await process_location_update(payload, db)
                except (ValidationError, ValueError) as err:
                    await websocket.send_json(
                        {"type": "error", "data": {"message": f"Invalid telemetry payload: {err}"}}
                    )
                except Exception:
                    logger.exception("Unhandled WebSocket telemetry error")
                    await websocket.send_json(
                        {"type": "error", "data": {"message": "Failed to process telemetry"}}
                    )

            elif msg_type == "subscribe":
                target_room = (
                    message.get("room")
                    or (message.get("data", {}).get("room") if isinstance(message.get("data"), dict) else None)
                )
                if target_room:
                    if not _is_room_allowed(user_obj, target_room):
                        await websocket.send_json(
                            {
                                "type": "error",
                                "data": {"code": "FORBIDDEN", "message": f"Access denied for room '{target_room}'"},
                            }
                        )
                        continue
                    await manager.connect(websocket, target_room)
                    await websocket.send_json(
                        {"type": "room.subscribed", "data": {"room": target_room}}
                    )

            elif msg_type == "unsubscribe":
                target_room = (
                    message.get("room")
                    or (message.get("data", {}).get("room") if isinstance(message.get("data"), dict) else None)
                )
                if target_room:
                    manager.disconnect(websocket, target_room)
                    await websocket.send_json(
                        {"type": "room.unsubscribed", "data": {"room": target_room}}
                    )

    except asyncio.TimeoutError:
        logger.info("WebSocket idle timeout closed for user %s", user_id)
        try:
            await websocket.close(code=4000, reason="Heartbeat timeout")
        except Exception:
            pass
        manager.disconnect_client(websocket)
    except WebSocketDisconnect:
        manager.disconnect_client(websocket)
    except Exception as exc:
        logger.warning("WebSocket connection encountered exception: %s", exc)
        manager.disconnect_client(websocket)


@router.get(
    "/api/v1/ws/stats",
    summary="Get real-time WebSocket connection statistics",
)
def get_websocket_stats(
    current_user: User = Depends(require_role(["ADMIN", "DISPATCHER"])),
) -> Dict[str, Any]:
    """Returns active WebSocket rooms and connection counts (Dispatcher/Admin only)."""
    stats = {room: len(sockets) for room, sockets in manager.active_rooms.items()}
    return {
        "total_active_subscriptions": sum(stats.values()),
        "rooms": stats,
    }
