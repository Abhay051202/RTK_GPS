# RTK Rover Tracking

Live rover coordinates, fix status, speed, persistent recording and Excel export.

## Start

Terminal 1:
```powershell
cd D:\RTK_base\backend
python main.py
```

Terminal 2:
```powershell
cd D:\RTK_base
npm run dev
```

Open http://localhost:5173. Click Start recording, connect your rover, and Download Excel when ready.

For a Reach Stacker Rover connecting to the central Azure NTRIP Caster (`rtk.prosperinfotech.com:443`):
```powershell
cd D:\RTK_base\backend
python ntrip_rover_client.py
```
This presents an interactive menu to choose your machine (`RS-01`, `RS-02`, `LAB-ROVER`, or manual custom stacker entry like `RS-03`), connects to Azure over TLS 443, injects RTCM3 corrections into the Rover USB serial port, and reaches `RTK FIXED (1-2 cm accuracy)`.

The Base reader auto-detects the u-blox receiver (e.g. COM6) and automatically streams RTCM3 corrections to the Azure Caster (`mountpoint: SARVESHWAR-CFS-BASE01`).

Install missing dependencies with `npm install` in the project root and `python -m pip install -r requirements.txt` in backend.

## Recording

Incoming rover packets are saved while recording to backend/rover_readings.sqlite3. Stationary readings and no-fix reports are retained. Recording stops when the backend restarts; saved rows remain. The table shows the latest 100 readings; Excel includes all saved readings, UTC receive time, device ID, coordinates, altitude, speed, heading, fix quality/status and reported battery level.

The frontend uses port 8000 on the browser hostname by default; VITE_API_URL overrides this. Remote rover clients send data to /api/rover/telemetry. To enable trusted LAN access, run `python -m uvicorn main:app --host 0.0.0.0 --port 8000` from backend and point the rover client at that computer's LAN IP. The API has no authentication; keep it on a trusted network.

This project contains rover telemetry tracking, persistent recording, Excel export, and receiver connection utilities.

## Checks

```powershell
npm run build
npm run lint
python -m unittest discover -s backend -p test_rover_log.py
```
