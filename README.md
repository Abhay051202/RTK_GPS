# RTK Base & Rover Yard Surveying & Mapping Application
### Industrial RTK GNSS Mapping, Container Yard Surveying & Centimeter-Accuracy Excel Exporter

A high-precision RTK GNSS field mapping and yard operation system designed for surveying container terminals, stack bays, traffic lanes, and boundaries with physical RTK Base and Rover units.

---

## 🚀 Key Features

### 1. Interactive Yard Survey & Line Drawing
* **✏️ Draw Yard Lines**: Click directly on high-resolution satellite imagery or street maps to survey container stack bays, truck transit lanes, perimeter walls, and crane rails.
* **📌 Log RTK Point (Field Rover Sync)**: Carrying the physical RTK Rover unit in the yard? Tap one button to log the current live cm-accurate GNSS coordinate as the next vertex in the survey line.
* **Live On-Map Geodesy**:
  * Real-time segment & cumulative line distance in meters with **centimeter precision** (e.g. `103.45 m`).
  * Vertex badges and dynamic estimation of **20ft (6.1m)** and **40ft (12.2m)** container bay slots.
  * Undo point, finish line, or cancel at any moment.
* **Line Metadata & Categorization**: Name each surveyed line (e.g. `Bay Row 01 (Import Stack)`, `Main Truck Lane`) and assign categories and display colors.
* **Container Bay Slot Markings**: Toggle to render 6.1m container slot markers along all surveyed lines.

---

### 2. Centimeter-Accurate Excel Generation (`.xlsx`)
Export all surveyed lines, vertices, and container slots into a multi-sheet spreadsheet:

| Sheet Name | Description & Columns | Precision |
| :--- | :--- | :--- |
| **`Survey_Coordinates_CM`** | Point ID, Feature Name, Latitude, Longitude, UTM Easting, UTM Northing, UTM Zone (43N), Elevation MSL, Segment Length, Cumulative Distance, RTK Fix Quality, Survey Method, Timestamp | WGS-84 Lat/Lng to **8 decimal places** (`~1.1 mm`), UTM Easting/Northing in meters to **3 decimals** (`1 mm`) |
| **`Lines_Summary`** | Line ID, Feature Name, Category, Total Length (m & ft), Vertices Count, Estimated 20ft Bays (6.1m), Estimated 40ft Bays (12.2m), Start Easting/Northing, End Easting/Northing, Color | Summary lengths to **cm level** |
| **`Container_Bay_Slots`** | Auto-interpolates individual 20ft container bay parking slots (at 6.1m intervals) along every line, giving each container slot its own GPS & UTM coordinates | Georeferenced parking coordinates for Terminal Operating Systems (TOS) & WMS |

---

### 3. Dual Hardware Positioning (Base & Rover)
* **Base Station**: USB Serial reader connected to physical u-blox RTK GNSS chip on `COM3` broadcasting DGPS / RTK corrections.
* **Rover Unit**: Real-time telemetry support over WebSocket and HTTP POST (`/api/rover/telemetry`) for remote field rovers, reach stackers, and survey poles.
* **Real-time Baseline**: Real-time vector line connecting Base Station to Rover with dynamic distance measurement.

---

## 🐍 Backend Architecture

Built with **FastAPI**, **PySerial**, **PyNMEA2**, **openpyxl**, and **WebSockets**:
* **Hardware Port**: `USB Serial Device (COM3)`
* **Device**: u-blox Multi-Constellation GNSS Receiver (`VID: 0x1546`, `PID: 0x01A9`)
* **Baud Rate**: `115200 baud`
* **Protocols**: NMEA 0183 (`$GNGGA`, `$GNRMC`, `$GNGSA`, `$GPGSV`, `$GLGSV`, `$GAGSV`, `$GBGSV`)
* **Persistence**: Saved survey features stored in `backend/survey_features.json`

---

## 🏃 Quick Start

### 1. Start Python Backend
```powershell
cd backend
python main.py
```
Backend runs at `http://127.0.0.1:8000` with WebSocket telemetry at `ws://127.0.0.1:8000/ws/telemetry`.

### 2. Start Frontend UI
```powershell
# From project root
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.
