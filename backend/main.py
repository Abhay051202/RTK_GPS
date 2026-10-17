"""Prosper CFS RTK Base + multi-Rover telemetry/dashboard backend.

Run this process only on the dedicated Base computer.  Reach Stacker EdgeBoxes
run ntrip_rover_client.py and post telemetry here; they never run the Base
publisher.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
import asyncio
import json
import math
from pathlib import Path
import time
from typing import Optional

import uvicorn
from fastapi import Depends, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from auth import require_api_key, require_telemetry_key, websocket_token_ok
from gnss_reader import GNSSReader
from rover_log import append_reading, router as recording_router
from settings import CASTER_HOST, CASTER_PORT, GNSS_BAUD, MOUNTPOINT, env, env_bool, env_csv, required
from single_instance import SingleInstanceLock

VERSION = "4.0.0"
DEVICE_ROLE = (env("DEVICE_ROLE", "BASE") or "BASE").upper()
if DEVICE_ROLE != "BASE":
    raise RuntimeError("backend/main.py is BASE-only. Reach Stacker EdgeBoxes must run ntrip_rover_client.py")


def detect_base_port(default: str | None = None) -> str:
    explicit = env("GNSS_PORT")
    if explicit:
        return explicit
    try:
        for port in GNSSReader.list_available_ports():
            if port.get("is_ublox"):
                return str(port["device"])
    except Exception as exc:
        print(f"[BASE] Port auto-detect failed: {exc}")
    if default:
        return default
    import os
    return "COM3" if os.name == "nt" else "/dev/ttyACM0"


gnss_reader: GNSSReader | None = None
base_lock: SingleInstanceLock | None = None
rover_states: dict[str, dict] = {}


def haversine_distance(lat1, lon1, lat2, lon2) -> float:
    if None in (lat1, lon1, lat2, lon2):
        return 0.0
    radius = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return round(radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)), 3)


def empty_rover_state(device_id: str = "RS-01") -> dict:
    return {
        "connected": False,
        "device_id": device_id,
        "latitude": None,
        "longitude": None,
        "altitude": None,
        "height_ellipsoid_m": None,
        "speed_kmh": 0.0,
        "heading": 0.0,
        "battery_percent": None,
        "fix_quality": 0,
        "fix_status_text": "NOT CONNECTED",
        "fix_type": None,
        "fix_type_text": None,
        "satellites_used": 0,
        "hdop": None,
        "pdop": None,
        "horizontal_accuracy_m": None,
        "vertical_accuracy_m": None,
        "accuracy_source": None,
        "carrier_solution": 0,
        "carrier_solution_text": "NO RTK",
        "differential_solution": False,
        "ntrip_connected": False,
        "ntrip_status_text": "DISCONNECTED",
        "ntrip_last_error": None,
        "rtcm_bytes_injected": 0,
        "rtcm_frames_injected": 0,
        "correction_age_s": None,
        "last_rtcm_utc": None,
        "last_position_utc": None,
        "precision_ready": False,
        "precision_block_reason": "NOT_CONNECTED",
        "distance_to_base_meters": 0.0,
        "last_seen_timestamp": 0.0,
    }


class ConnectRequest(BaseModel):
    port: str
    baudrate: int = 115200


class RoverTelemetryInput(BaseModel):
    device_id: str = "RS-01"
    latitude: float
    longitude: float
    altitude: Optional[float] = None
    height_ellipsoid_m: Optional[float] = None
    speed_kmh: Optional[float] = 0.0
    heading: Optional[float] = 0.0
    battery_percent: Optional[int] = None
    fix_quality: Optional[int] = 0
    fix_status_text: Optional[str] = "UNKNOWN"
    fix_type: Optional[int] = None
    fix_type_text: Optional[str] = None
    satellites_used: Optional[int] = 0
    hdop: Optional[float] = None
    pdop: Optional[float] = None
    horizontal_accuracy_m: Optional[float] = None
    vertical_accuracy_m: Optional[float] = None
    accuracy_source: Optional[str] = None
    carrier_solution: Optional[int] = 0
    carrier_solution_text: Optional[str] = "NO RTK"
    differential_solution: Optional[bool] = False
    ntrip_connected: Optional[bool] = False
    ntrip_status_text: Optional[str] = None
    ntrip_last_error: Optional[str] = None
    rtcm_bytes_injected: Optional[int] = 0
    rtcm_frames_injected: Optional[int] = 0
    correction_age_s: Optional[float] = None
    last_rtcm_utc: Optional[str] = None
    last_position_utc: Optional[str] = None
    precision_ready: Optional[bool] = False
    precision_block_reason: Optional[str] = None


def _make_base_reader(port: str | None = None, baudrate: int | None = None) -> GNSSReader:
    publish = env_bool("BASE_PUBLISH_TO_NTRIP", True)
    return GNSSReader(
        port=port or detect_base_port(),
        baudrate=baudrate or GNSS_BAUD,
        enable_azure_caster=publish,
        source_password=required("NTRIP_SOURCE_PASSWORD") if publish else None,
        caster_host=CASTER_HOST,
        caster_port=CASTER_PORT,
        mountpoint=MOUNTPOINT,
        use_tls=env_bool("NTRIP_TLS", True),
    )


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global gnss_reader, base_lock
    base_lock = SingleInstanceLock("prosper_rtk_base_publisher").acquire()
    gnss_reader = _make_base_reader()
    print(f"[BASE] ZED-F9P: {gnss_reader.port} @ {gnss_reader.baudrate}")
    print(f"[BASE] Mode: {gnss_reader.base_cfg.mode.upper()}")
    print(f"[BASE] Caster: {CASTER_HOST}:{CASTER_PORT}/{MOUNTPOINT}")
    gnss_reader.start()
    try:
        yield
    finally:
        if gnss_reader:
            gnss_reader.stop()
        if base_lock:
            base_lock.release()
            base_lock = None


app = FastAPI(
    title="Prosper CFS RTK Control Center",
    description="Dedicated Base monitoring and multi-Reach-Stacker RTK telemetry",
    version=VERSION,
    lifespan=lifespan,
)
app.include_router(recording_router)

cors_origins = env_csv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key"],
)


def _refresh_rovers() -> list[dict]:
    now = time.time()
    timeout_s = float(env("ROVER_OFFLINE_TIMEOUT_S", "10") or "10")
    assert gnss_reader is not None
    base = gnss_reader.get_snapshot()
    results: list[dict] = []
    for device_id, state in list(rover_states.items()):
        state["connected"] = now - float(state.get("last_seen_timestamp", 0)) <= timeout_s
        if state.get("latitude") is not None and base.get("latitude") is not None:
            state["distance_to_base_meters"] = haversine_distance(
                base.get("latitude"), base.get("longitude"), state.get("latitude"), state.get("longitude")
            )
        results.append(dict(state))
    return sorted(results, key=lambda item: item.get("device_id", ""))


def _latest_rover(rovers: list[dict]) -> dict:
    if not rovers:
        return empty_rover_state()
    connected = [r for r in rovers if r.get("connected")]
    source = connected or rovers
    return dict(max(source, key=lambda r: float(r.get("last_seen_timestamp", 0))))


def _telemetry_snapshot() -> dict:
    assert gnss_reader is not None
    rovers = _refresh_rovers()
    return {"base": gnss_reader.get_snapshot(), "rover": _latest_rover(rovers), "rovers": rovers}


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "Prosper CFS RTK Control Center", "version": VERSION, "device_role": "BASE"}


@app.get("/health/live")
def health_live():
    return {"status": "ok"}


@app.get("/health/ready")
def health_ready():
    assert gnss_reader is not None
    base = gnss_reader.get_snapshot()
    ready = bool(base.get("connected"))
    return {"status": "ready" if ready else "not_ready", "serial_connected": ready, "caster_connected": bool(base.get("azure_caster", {}).get("connected"))}


@app.get("/api/v1/position", dependencies=[Depends(require_api_key)])
def compatibility_position():
    assert gnss_reader is not None
    b = gnss_reader.get_snapshot()
    return {
        "latitude_deg": b.get("latitude"),
        "longitude_deg": b.get("longitude"),
        "height_ellipsoid_m": b.get("height_ellipsoid_m"),
        "height_msl_m": b.get("altitude"),
        "horizontal_accuracy_m": b.get("horizontal_accuracy_m"),
        "vertical_accuracy_m": b.get("vertical_accuracy_m"),
        "num_satellites": b.get("satellites_used"),
        "fix_type": b.get("fix_type"),
        "fix_type_text": b.get("fix_type_text"),
        "carrier_solution": b.get("carrier_solution"),
        "carrier_solution_text": b.get("carrier_solution_text"),
        "differential_solution": b.get("differential_solution"),
        "ground_speed_mps": (b.get("speed_kmh") / 3.6) if isinstance(b.get("speed_kmh"), (int, float)) else None,
        "heading_deg": b.get("heading"),
        "last_rtcm_utc": b.get("last_rtcm_utc"),
    }


@app.get("/api/v1/base", dependencies=[Depends(require_api_key)])
def compatibility_base():
    assert gnss_reader is not None
    b = gnss_reader.get_snapshot()
    return {
        "mode": b.get("base_mode"),
        "survey_active": b.get("survey_active"),
        "survey_valid": b.get("survey_valid"),
        "survey_duration_s": b.get("survey_duration_s"),
        "mean_accuracy_m": b.get("survey_mean_accuracy_m"),
        "rtcm_messages": b.get("rtcm_frames_seen"),
        "rtcm_bytes": b.get("rtcm_bytes_seen"),
        "last_rtcm_utc": b.get("last_rtcm_utc"),
        "rtcm_message_counts": b.get("rtcm_message_counts"),
        "azure_caster": b.get("azure_caster"),
        "reference": b.get("reference"),
    }


@app.get("/api/v1/status", dependencies=[Depends(require_api_key)])
def compatibility_status():
    return _telemetry_snapshot()


@app.get("/api/config", dependencies=[Depends(require_api_key)])
def public_config():
    assert gnss_reader is not None
    return {
        "version": VERSION,
        "base_mode": gnss_reader.base_cfg.mode,
        "caster_host": CASTER_HOST,
        "caster_port": CASTER_PORT,
        "mountpoint": MOUNTPOINT,
        "tls": env_bool("NTRIP_TLS", True),
        "base_publish_enabled": env_bool("BASE_PUBLISH_TO_NTRIP", True),
    }


@app.get("/api/ports", dependencies=[Depends(require_api_key)])
def ports():
    assert gnss_reader is not None
    return {
        "ports": GNSSReader.list_available_ports(),
        "active_port": gnss_reader.port,
        "active_baud": gnss_reader.baudrate,
        "is_connected": gnss_reader.state["connected"],
    }


@app.get("/api/telemetry", dependencies=[Depends(require_api_key)])
def telemetry():
    return _telemetry_snapshot()


@app.get("/api/rovers", dependencies=[Depends(require_api_key)])
def rovers():
    return {"rovers": _refresh_rovers()}


@app.post("/api/connect", dependencies=[Depends(require_api_key)])
def connect_port(req: ConnectRequest):
    global gnss_reader
    assert gnss_reader is not None
    gnss_reader.stop()
    gnss_reader = _make_base_reader(req.port, req.baudrate)
    gnss_reader.start()
    return {"status": "reconnecting", "port": req.port, "baudrate": req.baudrate}


@app.post("/api/rover/telemetry", dependencies=[Depends(require_telemetry_key)])
def update_rover(payload: RoverTelemetryInput):
    assert gnss_reader is not None
    device_id = payload.device_id.upper().strip()
    base = gnss_reader.get_snapshot()
    state = {
        "connected": True,
        **payload.model_dump(),
        "device_id": device_id,
        "distance_to_base_meters": haversine_distance(
            base.get("latitude"), base.get("longitude"), payload.latitude, payload.longitude
        ),
        "last_seen_timestamp": time.time(),
    }
    rover_states[device_id] = state
    append_reading(state)
    return {"status": "ok", "device_id": device_id, "distance_to_base_meters": state["distance_to_base_meters"]}


@app.post("/api/rover/disconnect/{device_id}", dependencies=[Depends(require_api_key)])
def disconnect_rover(device_id: str):
    device_id = device_id.upper().strip()
    if device_id in rover_states:
        rover_states[device_id]["connected"] = False
    return {"status": "disconnected", "device_id": device_id}


@app.websocket("/ws/telemetry")
async def websocket_telemetry(websocket: WebSocket):
    if not websocket_token_ok(websocket.query_params.get("token")):
        await websocket.close(code=4401)
        return
    await websocket.accept()
    try:
        while True:
            await websocket.send_text(json.dumps(_telemetry_snapshot()))
            await asyncio.sleep(0.25)
    except WebSocketDisconnect:
        pass


# Serve the production React build from the Base backend when `npm run build`
# has created /dist. API routes above take precedence.
DIST_DIR = Path(__file__).resolve().parent.parent / "dist"
if DIST_DIR.exists():
    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="frontend")
else:
    @app.get("/", response_class=HTMLResponse)
    def root_index():
        return """
        <!doctype html><html><head><title>Prosper RTK</title></head>
        <body style='font-family:Arial;background:#0f172a;color:#f8fafc;padding:40px'>
        <h2>Prosper CFS RTK Backend Online</h2>
        <p>Build/start the React dashboard with <code>npm run dev</code> or <code>npm run build</code>.</p>
        </body></html>
        """


if __name__ == "__main__":
    uvicorn.run("main:app", host=env("BACKEND_HOST", "0.0.0.0"), port=int(env("BACKEND_PORT", "8000") or "8000"), log_level="info")
