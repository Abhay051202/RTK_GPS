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

For a rover connected to COM4 (adjust to your actual port), use a third terminal:
```powershell
cd D:\RTK_base\backend
python rover_client.py --port COM4 --baud 115200 --host 127.0.0.1:8000
```

The base reader uses COM3. Use distinct ports; only one process can own a serial port. Receiver RTK configuration and correction delivery are separate from telemetry recording.

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
