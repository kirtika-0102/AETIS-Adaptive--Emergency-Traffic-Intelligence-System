import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.services.websocket_manager import manager

logger = logging.getLogger("aetis.websocket")

router = APIRouter(tags=["WebSockets"])


def resolve_rooms(
    client_type: str,
    emergency_id: Optional[str] = None,
    hospital_id: Optional[str] = None,
) -> List[str]:
    """
    Computes initial rooms to join based on client role and query parameters.
    """
    rooms: List[str] = []
    c_type = client_type.lower().strip()

    if c_type in ["dispatcher", "admin"]:
        rooms.append("dispatchers")
        rooms.append("signals")
    elif c_type == "driver":
        rooms.append("signals")
        if emergency_id:
            rooms.append(f"emergency:{emergency_id}")
    elif c_type == "hospital":
        if hospital_id:
            rooms.append(f"hospital:{hospital_id}")
    elif c_type == "signal":
        rooms.append("signals")
    else:
        # Default fallback
        rooms.append("dispatchers")

    # Dynamic overrides based on explicit query params
    if emergency_id and f"emergency:{emergency_id}" not in rooms:
        rooms.append(f"emergency:{emergency_id}")

    if hospital_id and f"hospital:{hospital_id}" not in rooms:
        rooms.append(f"hospital:{hospital_id}")

    return rooms


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    client_type: str = Query(default="dispatcher", description="Client role: dispatcher, driver, hospital, signal"),
    emergency_id: Optional[str] = Query(default=None, description="Active emergency incident ID"),
    hospital_id: Optional[str] = Query(default=None, description="Hospital identifier"),
):
    """
    Real-time WebSocket endpoint with automatic room assignment and heartbeat ping/pong.
    """
    await websocket.accept()

    # Determine rooms based on client query
    rooms = resolve_rooms(client_type, emergency_id, hospital_id)

    # Join the client to resolved rooms
    for room in rooms:
        await manager.connect(websocket, room)

    # Send initial connection acknowledgment with assigned rooms
    try:
        await websocket.send_json({
            "type": "connection.established",
            "data": {
                "client_type": client_type,
                "rooms": rooms,
                "connected_at": datetime.now(timezone.utc).isoformat(),
            },
        })
    except Exception as e:
        logger.error(f"Failed to send initial acknowledgment: {e}")
        manager.disconnect_client(websocket)
        return

    # Continuous listening loop with heartbeat ping/pong
    try:
        while True:
            raw_text = await websocket.receive_text()
            try:
                message = json.loads(raw_text)
            except Exception:
                message = {"type": raw_text}

            msg_type = message.get("type") if isinstance(message, dict) else str(message)

            if msg_type == "ping":
                # Respond with pong heartbeat
                await websocket.send_json({
                    "type": "pong",
                    "data": {"timestamp": datetime.now(timezone.utc).isoformat()},
                })

            elif msg_type == "pong":
                # Heartbeat acknowledgment from client
                pass

            elif msg_type == "subscribe":
                # Dynamic runtime room subscription
                target_room = (
                    message.get("room")
                    or (message.get("data", {}).get("room") if isinstance(message.get("data"), dict) else None)
                )
                if target_room:
                    await manager.connect(websocket, target_room)
                    await websocket.send_json({
                        "type": "room.subscribed",
                        "data": {"room": target_room},
                    })

            elif msg_type == "unsubscribe":
                # Dynamic runtime room unsubscription
                target_room = (
                    message.get("room")
                    or (message.get("data", {}).get("room") if isinstance(message.get("data"), dict) else None)
                )
                if target_room:
                    manager.disconnect(websocket, target_room)
                    await websocket.send_json({
                        "type": "room.unsubscribed",
                        "data": {"room": target_room},
                    })

            elif msg_type == "broadcast":
                # Broadcast message to a room (e.g., from test clients or dispatch tools)
                target_room = message.get("room")
                event_type = message.get("event", "message")
                event_data = message.get("data", {})
                if target_room:
                    await manager.broadcast_to_room(target_room, event_type, event_data)

    except WebSocketDisconnect:
        manager.disconnect_client(websocket)
    except Exception as e:
        logger.warning(f"WebSocket connection encountered exception: {e}")
        manager.disconnect_client(websocket)


@router.get("/api/v1/ws/stats", summary="Get real-time WebSocket connection statistics")
def get_websocket_stats() -> Dict[str, Any]:
    """
    Returns active WebSocket rooms and connection counts.
    """
    stats = {
        room: len(sockets)
        for room, sockets in manager.active_rooms.items()
    }
    total_connections = sum(stats.values())
    return {
        "total_active_subscriptions": total_connections,
        "rooms": stats,
    }
