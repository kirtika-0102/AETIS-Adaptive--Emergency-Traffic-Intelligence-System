import logging
from typing import Any, Dict, List, Optional, Set
from fastapi import WebSocket
from starlette.websockets import WebSocketState

logger = logging.getLogger("aetis.websocket")


class ConnectionManager:
    """
    Manages active WebSocket connections grouped into dynamic Pub/Sub rooms.

    Supported standard dynamic rooms:
    - "dispatchers": Broadcasts to all active dispatch screens
    - "signals": Traffic light phase changes & preemption status
    - "hospital:{hospital_id}": Inbound alerts & ETA for a specific hospital
    - "emergency:{emergency_id}": Incident vehicle telemetry & route preemption tracking
    """

    def __init__(self):
        # Room name -> Set of active WebSockets
        self.active_rooms: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room: str):
        """
        Accepts socket connection (if not already accepted) and adds socket to room set.
        """
        try:
            if websocket.client_state == WebSocketState.CONNECTING:
                await websocket.accept()
        except RuntimeError:
            # Socket already accepted
            pass

        if room not in self.active_rooms:
            self.active_rooms[room] = set()

        self.active_rooms[room].add(websocket)
        logger.debug(f"WebSocket {websocket.client} joined room '{room}'. Total in room: {len(self.active_rooms[room])}")

    def disconnect(self, websocket: WebSocket, room: str):
        """
        Removes socket from room set cleanly without throwing exceptions if already disconnected.
        """
        if room in self.active_rooms:
            self.active_rooms[room].discard(websocket)
            if not self.active_rooms[room]:
                del self.active_rooms[room]
            logger.debug(f"WebSocket {websocket.client} removed from room '{room}'.")

    def disconnect_client(self, websocket: WebSocket):
        """
        Removes socket from all active rooms it currently belongs to.
        """
        empty_rooms: List[str] = []
        for room, sockets in self.active_rooms.items():
            if websocket in sockets:
                sockets.discard(websocket)
                if not sockets:
                    empty_rooms.append(room)

        for room in empty_rooms:
            self.active_rooms.pop(room, None)

        logger.debug(f"WebSocket {websocket.client} disconnected from all rooms.")

    async def broadcast_to_room(self, room: str, event_type: str, data: Any):
        """
        Iterates through all sockets in self.active_rooms[room], transmitting JSON:
        {"type": event_type, "data": data}.
        Gracefully catches and cleans up any dead or broken sockets.
        """
        if room not in self.active_rooms:
            return

        payload = {"type": event_type, "data": data}
        dead_sockets: List[WebSocket] = []

        # Iterate over a shallow copy of the sockets set to handle concurrent modification
        sockets = list(self.active_rooms[room])
        for socket in sockets:
            try:
                if socket.client_state == WebSocketState.CONNECTED:
                    await socket.send_json(payload)
                else:
                    dead_sockets.append(socket)
            except Exception as e:
                logger.warning(f"Failed to transmit to WebSocket in room '{room}': {e}")
                dead_sockets.append(socket)

        # Clean up dead sockets
        for dead_socket in dead_sockets:
            self.disconnect(dead_socket, room)

    def get_room_clients_count(self, room: str) -> int:
        """Returns the number of active connections in a specific room."""
        return len(self.active_rooms.get(room, set()))

    def get_rooms_for_client(self, websocket: WebSocket) -> List[str]:
        """Returns the list of room names the client is currently joined to."""
        return [room for room, sockets in self.active_rooms.items() if websocket in sockets]


# Singleton instance shared across routers and background services
manager = ConnectionManager()
