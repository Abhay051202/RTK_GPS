# RTK Base & Rover Monitoring Application
### Industrial Command Center for Reach Stacker & Container Yard Automation

Modern, high-precision industrial robotics command interface for monitoring an RTK GNSS Base Station, real-time yard operations, and future autonomous Reach Stacker Rover fleets.

---

## 🚀 Key Features

### 1. High-Precision Tactical Yard Map (~80% Viewport)
* **Real-time Map Visualization**: Dark vector tactical basemap and high-resolution satellite imagery toggle.
* **Yard Layout & Infrastructure**:
  * Container Blocks A (Inbound Dry Cargo) & B (Export Outbound) with individual bay slots.
  * Block R: Temperature-monitored Reefer power racks.
  * Zone H: Hazardous Materials (Hazmat Class 3) restricted exclusion zone.
  * Fleet Depot: Reach Stacker charging bays and maintenance stalls.
  * Main OCR Gate & Weighbridge scales.
* **Driving Corridors & Lanes**: Heavy transit runways, automated work aisles, quayside haul routes with speed limit guidelines.
* **Safety Geofencing**: Real-time operational perimeter boundaries and automated stacker corridors.
* **Animated Industrial Base Marker**:
  * Custom multi-stage pulsing radio beacon.
  * 360° rotating radar sweep cone.
  * Live status badge (`● BASE // ONLINE`).
  * 850m RTK centimeter-accuracy broadcast range ring.
* **HUD Map Controls**:
  * Smooth zoom controls, fullscreen toggle, North-reset compass rose, and tactical 50m scale bar.
  * Dynamic crosshair coordinates tracking under cursor (Lat/Lng and UTM Zone 42N).

### 2. Base Station Monitoring & RTCM Telemetry
* **Positioning**: Multi-band GNSS L1/L2/L5 RTK Fixed solution with horizontal accuracy of ±6 mm and vertical accuracy of ±12 mm.
* **Live Caster Stream**: RTCM 3.2 MSM4 message streams (1005, 1074, 1084, 1094, 1124) broadcast at 10 Hz over Gigabit Ethernet PoE+.
* **Diagnostics**: Satellite Signal-to-Noise Ratio (SNR) live meters across GPS, GLONASS, GALILEO, and BEIDOU constellations.
* **Hardware Health**: Voltage, operating temperature, CPU load, and antenna loop current monitoring.

### 3. Modular Future Rover & Reach Stacker Architecture
The application is structured to support seamless connection of the autonomous Reach Stacker Rover without modifying the Base Station foundation:

```
BASE (Current V1 Focus)
├── GPS (L1/L2/L5 RTK Fixed Reference, ±6mm Accuracy)
├── Communication (NTRIP Caster, RTCM 3.2 MSM4, 1000BASE-T)
├── Site Map (Bays A1-A8, B1-B8, Reefer, Hazmat, Roads)
└── Geofence (Terminal Perimeter, Class 3 Hazmat, Stacker Guideway)
    │
    └── ROVER (Architecture Placeholder / V2 Target)
        ├── Location (Centimeter-accurate Real-time Waypoint Tracking)
        ├── Battery (Pack Voltage, SoC %, Thermal Monitor)
        ├── Status (Active / Standby / Docked / Error)
        ├── Navigation (Corridor Waypoints, Collision Avoidance LiDAR)
        ├── Mission (Bay Pickup, Stack Deposit, Quayside Transfer)
        └── Telemetry (J1939 CANbus, Boom Angle, Twistlocks, 45T Load)
```

---

## 🐍 Python Backend & USB Hardware Integration

The backend is built in **Python (FastAPI + PySerial + PyNMEA2 + WebSockets)**:
* **Hardware Chip Detected**: `USB Serial Device (COM3)`
* **Device**: u-blox Multi-Constellation GNSS / RTK Receiver (`VID: 0x1546`, `PID: 0x01A9`)
* **Baud Rate**: `115200 baud`
* **Protocol**: NMEA 0183 (`$GNGGA`, `$GNRMC`, `$GNGSA`, `$GPGSV`, `$GLGSV`, `$GAGSV`, `$GBGSV`)
* **Real-time Live Telemetry**: Streamed over WebSocket at `ws://127.0.0.1:8000/ws/telemetry` at 10 Hz.

### 🏃 Quick Start (One-Click)
Double-click **`start.bat`** in the project folder to start both:
1. Python GNSS Telemetry Server on `http://127.0.0.1:8000`
2. React Command Center UI on `http://127.0.0.1:5173`

Or start them manually:
```powershell
# 1. Start Python Backend
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000

# 2. Start Frontend UI (in another terminal)
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.
