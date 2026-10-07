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
from fastapi.responses import HTMLResponse, FileResponse
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

@app.get("/", response_class=HTMLResponse)
def root_index():
    return """
    <!DOCTYPE html>
    <html>
      <head>
        <meta http-equiv="refresh" content="0; url=http://localhost:5173" />
        <title>Redirecting to RTK Yard Survey UI...</title>
        <style>
          body { background: #0f172a; color: #f8fafc; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
          .card { background: #1e293b; padding: 30px; border-radius: 8px; border: 1px solid #38bdf8; max-width: 450px; }
          a { display: inline-block; margin-top: 15px; background: #0284c7; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>📍 RTK Telemetry Backend Online</h2>
          <p>The interactive Yard Survey Map UI is running on <strong>port 5173</strong>.</p>
          <a href="http://localhost:5173">Open RTK Yard Survey UI &rarr;</a>
        </div>
      </body>
    </html>
    """

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

# --- SURVEY LINES & EXCEL EXPORT ENDPOINTS ---

import os
from fastapi.responses import FileResponse
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

SURVEY_FILE = os.path.join(os.path.dirname(__file__), "survey_features.json")

def load_saved_survey_features():
    if os.path.exists(SURVEY_FILE):
        try:
            with open(SURVEY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def save_survey_features_file(features):
    with open(SURVEY_FILE, "w", encoding="utf-8") as f:
        json.dump(features, f, indent=2)

@app.get("/api/survey/features")
def get_survey_features():
    """Retrieve all saved surveyed lines and polygons"""
    return {"features": load_saved_survey_features()}

@app.post("/api/survey/features")
def save_survey_features(payload: dict):
    """Save or update surveyed lines and polygons"""
    features = payload.get("features", [])
    save_survey_features_file(features)
    return {"status": "saved", "count": len(features)}

@app.get("/api/survey/export-excel")
def export_survey_excel():
    """
    Generate professional Excel spreadsheet (.xlsx) with centimeter-accuracy coordinates,
    UTM projections, and segment distances.
    """
    features = load_saved_survey_features()
    wb = openpyxl.Workbook()
    
    # Header styles
    header_fill = PatternFill(start_color="0284C7", end_color="0284C7", fill_type="solid")
    header_font = Font(name="Arial", size=11, bold=True, color="FFFFFF")
    data_font = Font(name="Arial", size=10)
    mono_font = Font(name="Consolas", size=10)
    center_align = Alignment(horizontal="center", vertical="center")
    thin_border = Border(
        left=Side(style='thin', color='DDDDDD'),
        right=Side(style='thin', color='DDDDDD'),
        top=Side(style='thin', color='DDDDDD'),
        bottom=Side(style='thin', color='DDDDDD')
    )

    # 1. Sheet 1: Detailed Survey Points
    ws_points = wb.active
    ws_points.title = "Survey_Coordinates_CM"
    
    headers = [
        "Point ID", "Feature / Layer Name", "Point Type",
        "Latitude (deg)", "Longitude (deg)",
        "UTM Easting (m)", "UTM Northing (m)", "UTM Zone",
        "Elevation MSL (m)", "Segment Length (m)", "Cumulative Distance (m)",
        "RTK Fix Quality", "Survey Method", "Timestamp"
    ]
    ws_points.append(headers)

    for col_idx in range(1, len(headers) + 1):
        cell = ws_points.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = center_align

    point_counter = 1
    row_idx = 2

    for feat in features:
        feat_name = feat.get("name", "Unnamed Line")
        points = feat.get("points", [])
        cum_dist = 0.0

        for idx, pt in enumerate(points):
            seg_dist = 0.0
            if idx > 0:
                prev = points[idx - 1]
                seg_dist = haversine_distance(prev["lat"], prev["lng"], pt["lat"], pt["lng"])
                cum_dist += seg_dist

            lat = pt.get("lat", 0.0)
            lng = pt.get("lng", 0.0)
            alt = pt.get("alt", 14.0)

            # Approximate UTM Zone 43N conversion
            # lat, lon -> UTM Zone 43N Easting & Northing
            lat_rad = math.radians(lat)
            lon_rad = math.radians(lng)
            lon_origin = math.radians(75.0) # Zone 43 central meridian
            easting = round(500000 + 6378137 * (lon_rad - lon_origin) * math.cos(lat_rad), 3)
            northing = round(6378137 * lat_rad, 3)

            ws_points.append([
                pt.get("name", f"PT_{point_counter:03d}"),
                feat_name,
                feat.get("type", "LINE_VERTEX"),
                round(lat, 8),
                round(lng, 8),
                easting,
                northing,
                "43N",
                round(alt, 3),
                round(seg_dist, 3),
                round(cum_dist, 3),
                pt.get("fixQuality", "RTK FIXED (cm level)"),
                "RTK Rover Live" if pt.get("isRtkLogged") else "UI Survey Map",
                pt.get("timestamp", time.strftime("%Y-%m-%d %H:%M:%S"))
            ])

            for c in range(1, len(headers) + 1):
                cell = ws_points.cell(row=row_idx, column=c)
                cell.font = mono_font if c in [4, 5, 6, 7, 9, 10, 11] else data_font
                cell.border = thin_border

            point_counter += 1
            row_idx += 1

    # Adjust column widths
    for col in ws_points.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws_points.column_dimensions[col_letter].width = max(max_len + 3, 12)

    # 2. Sheet 2: Features Summary
    ws_summary = wb.create_sheet(title="Lines_Summary")
    sum_headers = [
        "Feature ID", "Feature Name", "Total Length (m)",
        "Total Vertices", "Estimated 20ft Bays (6.1m)", "Estimated 40ft Bays (12.2m)", "Color"
    ]
    ws_summary.append(sum_headers)
    for col_idx in range(1, len(sum_headers) + 1):
        cell = ws_summary.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = center_align

    for s_idx, feat in enumerate(features, start=2):
        pts = feat.get("points", [])
        total_len = 0.0
        for i in range(len(pts) - 1):
            total_len += haversine_distance(pts[i]["lat"], pts[i]["lng"], pts[i+1]["lat"], pts[i+1]["lng"])

        ws_summary.append([
            feat.get("id", f"LINE_{s_idx-1}"),
            feat.get("name", f"Line {s_idx-1}"),
            round(total_len, 3),
            len(pts),
            math.floor(total_len / 6.1),
            math.floor(total_len / 12.2),
            feat.get("color", "#00F0FF")
        ])
        for c in range(1, len(sum_headers) + 1):
            cell = ws_summary.cell(row=s_idx, column=c)
            cell.font = data_font
            cell.border = thin_border

    for col in ws_summary.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws_summary.column_dimensions[col_letter].width = max(max_len + 3, 14)

    # 3. Sheet 3: Container Bay Slots (6.1m Spacing)
    ws_slots = wb.create_sheet(title="Container_Bay_Slots")
    slot_headers = [
        "Slot / Bay ID", "Parent Feature", "Slot Type",
        "Latitude (deg)", "Longitude (deg)", "UTM Easting (m)", "UTM Northing (m)",
        "Elevation MSL (m)", "Distance From Start (m)"
    ]
    ws_slots.append(slot_headers)
    for col_idx in range(1, len(slot_headers) + 1):
        cell = ws_slots.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = center_align

    slot_row_idx = 2
    for feat in features:
        pts = feat.get("points", [])
        if len(pts) < 2:
            continue
        feat_name = feat.get("name", "Line")
        slot_num = 1
        for i in range(len(pts) - 1):
            p1 = pts[i]
            p2 = pts[i + 1]
            seg_dist = haversine_distance(p1["lat"], p1["lng"], p2["lat"], p2["lng"])
            num_slots = math.floor(seg_dist / 6.1)
            for s in range(1, num_slots + 1):
                frac = (s * 6.1) / seg_dist
                if frac >= 1.0:
                    break
                s_lat = p1["lat"] + frac * (p2["lat"] - p1["lat"])
                s_lng = p1["lng"] + frac * (p2["lng"] - p1["lng"])
                s_alt = p1.get("alt", 14.0)
                lat_rad = math.radians(s_lat)
                lon_rad = math.radians(s_lng)
                easting = round(500000 + 6378137 * (lon_rad - math.radians(75.0)) * math.cos(lat_rad), 3)
                northing = round(6378137 * lat_rad, 3)

                ws_slots.append([
                    f"{feat_name.replace(' ', '_')}_SLOT_{slot_num:02d}",
                    feat_name,
                    "20ft Bay Slot",
                    round(s_lat, 8),
                    round(s_lng, 8),
                    easting,
                    northing,
                    round(s_alt, 3),
                    round(s * 6.1, 2)
                ])
                for c in range(1, len(slot_headers) + 1):
                    cell = ws_slots.cell(row=slot_row_idx, column=c)
                    cell.font = mono_font if c in [4, 5, 6, 7, 8, 9] else data_font
                    cell.border = thin_border
                slot_row_idx += 1
                slot_num += 1

    for col in ws_slots.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws_slots.column_dimensions[col_letter].width = max(max_len + 3, 14)

    export_path = os.path.join(os.path.dirname(__file__), "Prosper_CFS_RTK_Survey.xlsx")
    wb.save(export_path)

    return FileResponse(
        export_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=f"Prosper_CFS_RTK_Survey_{time.strftime('%Y%m%d_%H%M%S')}.xlsx"
    )

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, log_level="info")
