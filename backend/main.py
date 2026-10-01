"""
FastAPI Server for RTK Base & Rover Monitoring Application
- Reads Base Station GNSS chip on USB COM3
- Ingests Rover telemetry over local network via HTTP POST and WebSockets
- Automatically marks Rover as DISCONNECTED if no packets received within 10s
"""

import asyncio
import math
import time
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uvicorn
import json

from gnss_reader import GNSSReader

app = FastAPI(
    title="RTK Base & Rover GNSS Telemetry Server",
    description="Python backend interfacing with hardware Base Station (COM3) and Network-connected Rover",
    version="2.1.0"
)

# Enable CORS for the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global GNSS Reader instance (defaults to COM3, 115200)
gnss_reader = GNSSReader(port="COM3", baudrate=115200)

# In-memory Rover State (Strictly disconnected by default)
rover_state = {
    "connected": False,
    "device_id": "ROVER-RS-01",
    "latitude": None,
    "longitude": None,
    "altitude": None,
    "speed_kmh": 0.0,
    "heading": 0.0,
    "battery_percent": None,
    "fix_quality": 0,
    "fix_status_text": "NOT CONNECTED",
    "distance_to_base_meters": 0.0,
    "last_seen_timestamp": 0,
    "is_simulated": False
}

def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate distance between two GPS coordinates in meters"""
    if lat1 is None or lon1 is None or lat2 is None or lon2 is None:
        return 0.0
    R = 6371000  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 2)

class ConnectRequest(BaseModel):
    port: str
    baudrate: int = 115200

class RoverTelemetryInput(BaseModel):
    device_id: Optional[str] = "ROVER-RS-01"
    latitude: float
    longitude: float
    altitude: Optional[float] = None
    speed_kmh: Optional[float] = 0.0
    heading: Optional[float] = 0.0
    battery_percent: Optional[int] = None
    fix_quality: Optional[int] = 4
    fix_status_text: Optional[str] = "RTK FIXED"

@app.on_event("startup")
async def startup_event():
    print("[BACKEND] Starting GNSS Hardware Reader on COM3 (115200 baud)...")
    gnss_reader.start()

@app.on_event("shutdown")
async def shutdown_event():
    print("[BACKEND] Stopping GNSS Hardware Reader...")
    gnss_reader.stop()

@app.get("/api/health")
def get_health():
    return {"status": "ok", "service": "RTK Base & Rover GNSS Server"}

@app.get("/api/ports")
def get_ports():
    return {
        "ports": GNSSReader.list_available_ports(),
        "active_port": gnss_reader.port,
        "active_baud": gnss_reader.baudrate,
        "is_connected": gnss_reader.state["connected"]
    }

@app.get("/api/telemetry")
def get_telemetry():
    """Return the combined Base & Rover snapshot"""
    global rover_state
    base_snap = gnss_reader.get_snapshot()

    # Heartbeat timeout check: If no data received in 10s, mark disconnected
    if not rover_state.get("is_simulated"):
        if time.time() - rover_state.get("last_seen_timestamp", 0) > 10:
            rover_state["connected"] = False
            rover_state["latitude"] = None
            rover_state["longitude"] = None
            rover_state["fix_status_text"] = "NOT CONNECTED"

    dist = 0.0
    if rover_state.get("connected") and rover_state.get("latitude"):
        dist = haversine_distance(
            base_snap["latitude"], base_snap["longitude"],
            rover_state["latitude"], rover_state["longitude"]
        )
    rover_state["distance_to_base_meters"] = dist

    return {
        "base": base_snap,
        "rover": rover_state
    }

@app.post("/api/connect")
def connect_port(req: ConnectRequest):
    global gnss_reader
    gnss_reader.stop()
    gnss_reader = GNSSReader(port=req.port, baudrate=req.baudrate)
    gnss_reader.start()
    return {"status": "reconnecting", "port": req.port, "baudrate": req.baudrate}

# --- ROVER NETWORK ENDPOINTS ---

@app.post("/api/rover/telemetry")
def update_rover_telemetry(payload: RoverTelemetryInput):
    """
    Network endpoint for remote Rover / vehicle to post real-time coordinates.
    """
    global rover_state
    base_snap = gnss_reader.get_snapshot()
    dist = haversine_distance(
        base_snap["latitude"], base_snap["longitude"],
        payload.latitude, payload.longitude
    )

    rover_state = {
        "connected": True,
        "device_id": payload.device_id or "ROVER-RS-01",
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "altitude": payload.altitude,
        "speed_kmh": payload.speed_kmh or 0.0,
        "heading": payload.heading or 0.0,
        "battery_percent": payload.battery_percent,
        "fix_quality": payload.fix_quality or 4,
        "fix_status_text": payload.fix_status_text or "RTK FIXED",
        "distance_to_base_meters": dist,
        "last_seen_timestamp": time.time(),
        "is_simulated": False
    }
    return {"status": "ok", "distance_to_base_meters": dist}

@app.post("/api/rover/disconnect")
def disconnect_rover():
    """Explicitly reset/disconnect rover"""
    global rover_state
    rover_state = {
        "connected": False,
        "device_id": "ROVER-RS-01",
        "latitude": None,
        "longitude": None,
        "altitude": None,
        "speed_kmh": 0.0,
        "heading": 0.0,
        "battery_percent": None,
        "fix_quality": 0,
        "fix_status_text": "NOT CONNECTED",
        "distance_to_base_meters": 0.0,
        "last_seen_timestamp": 0,
        "is_simulated": False
    }
    return {"status": "disconnected"}

@app.post("/api/rover/simulate")
def toggle_simulation(enable: bool = True):
    """Allow user to explicitly toggle a simulated Rover moving near the Base Station"""
    global rover_state
    base_snap = gnss_reader.get_snapshot()
    base_lat = base_snap.get("latitude", 18.90387)
    base_lng = base_snap.get("longitude", 73.04675)

    if enable:
        rover_state["connected"] = True
        rover_state["is_simulated"] = True
        rover_state["latitude"] = base_lat + 0.00012
        rover_state["longitude"] = base_lng + 0.00015
        rover_state["altitude"] = base_snap.get("altitude", 13.0) + 1.2
        rover_state["speed_kmh"] = 8.5
        rover_state["heading"] = 62.0
        rover_state["fix_status_text"] = "SIMULATED RTK"
        rover_state["distance_to_base_meters"] = haversine_distance(
            base_lat, base_lng, rover_state["latitude"], rover_state["longitude"]
        )
    else:
        rover_state["connected"] = False
        rover_state["is_simulated"] = False
        rover_state["latitude"] = None
        rover_state["longitude"] = None
        rover_state["fix_status_text"] = "NOT CONNECTED"

    return {"status": "ok", "simulated": enable, "rover": rover_state}

@app.websocket("/ws/telemetry")
async def websocket_telemetry(websocket: WebSocket):
    """
    Combined real-time WebSocket broadcasting Base and Rover coordinates at 10 Hz.
    """
    await websocket.accept()
    sim_step = 0
    try:
        while True:
            base_snap = gnss_reader.get_snapshot()
            
            # Check timeout: if real rover stops sending, disconnect it after 10s
            if not rover_state.get("is_simulated"):
                if time.time() - rover_state.get("last_seen_timestamp", 0) > 10:
                    rover_state["connected"] = False
                    rover_state["latitude"] = None
                    rover_state["longitude"] = None
                    rover_state["fix_status_text"] = "NOT CONNECTED"
            else:
                # If user explicitly turned ON simulation, micro-advance rover in a circle
                if rover_state.get("connected"):
                    sim_step += 0.04
                    base_lat = base_snap.get("latitude", 18.90387)
                    base_lng = base_snap.get("longitude", 73.04675)
                    radius_deg = 0.00018  # ~20 meters
                    rover_state["latitude"] = base_lat + radius_deg * math.cos(sim_step)
                    rover_state["longitude"] = base_lng + radius_deg * math.sin(sim_step)
                    rover_state["heading"] = round((math.degrees(-sim_step) + 360) % 360, 1)

            # Update real-time distance
            dist = 0.0
            if rover_state.get("connected") and rover_state.get("latitude"):
                dist = haversine_distance(
                    base_snap["latitude"], base_snap["longitude"],
                    rover_state["latitude"], rover_state["longitude"]
                )
            rover_state["distance_to_base_meters"] = dist

            payload = {
                "base": base_snap,
                "rover": rover_state
            }
            await websocket.send_text(json.dumps(payload))
            await asyncio.sleep(0.1) # 10 Hz
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print("[WS ERROR]:", e)

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, log_level="info")
