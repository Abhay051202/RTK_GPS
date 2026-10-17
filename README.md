# Prosper CFS RTK Production Solution v4.0.0

Production-oriented RTK positioning for Sarveshwar CFS / ContainerVision AI.

This package deliberately separates the **Base computer** from each **Reach Stacker AI EdgeBox** and combines:

- the proven Prosper ZED-F9P Base/Rover configuration and RTCM handling;
- the offshore team's live React dashboard, map, recording and Excel export;
- production reconnect, auto-start, multi-Rover support and credential separation.

## 1. Production architecture

```text
SURVEYED BASE ANTENNA
       |
       v
u-blox ZED-F9P Base
       |
       | USB / serial
       v
Dedicated Base Computer
  Prosper Base Service
       |
       | CRC-valid RTCM3 only
       | TLS / NTRIP
       v
rtk.prosperinfotech.com:443
Mountpoint: SARVESHWAR-CFS-BASE01
       |
       | TLS / NTRIP corrections
       +-------------------------+
       |                         |
       v                         v
Reach Stacker RS-01          Reach Stacker RS-02 ...
AI EdgeBox                    AI EdgeBox
       |                         |
Prosper Rover Agent          Prosper Rover Agent
       |                         |
RTCM -> ZED-F9P Rover        RTCM -> ZED-F9P Rover
       |                         |
NAV-PVT / HPPOSLLH           NAV-PVT / HPPOSLLH
       |                         |
RTK FIXED position           RTK FIXED position
       +------------ telemetry --+
                    |
                    v
          Base Control Center UI
          Map / recording / Excel
```

The Rover does **not** connect directly to the Base. Both Base and Rovers connect to the central NTRIP caster.


## Azure caster hardening included

The `caster/` folder contains **Prosper NTRIP Caster v1.1**. It adds a Base-source idle timeout and forces Rover streams to reconnect when the Base source disappears. This prevents a half-open source from remaining stuck as `409 Source already connected` after an internet/power interruption. The existing Azure v1.0 caster can continue to be used for testing, but v1.1 is recommended before final production go-live.

## 2. What provides centimeter-level accuracy

The software cannot create centimeter accuracy by itself. Production accuracy requires all of the following:

1. ZED-F9P or equivalent dual-frequency RTK receiver at Base and Rover.
2. Correct L1/L2-capable GNSS antennas with good sky visibility.
3. A physically stable Base antenna.
4. **Surveyed Base latitude, longitude and ellipsoidal height** configured in `BASE_MODE=fixed`.
5. Required RTCM messages reaching the Rover with low correction age.
6. Rover reporting `carrier_solution = 2 / RTK FIXED`.
7. Receiver-reported `hAcc/vAcc` from UBX-NAV-PVT / UBX-NAV-HPPOSLLH used for monitoring.

For production Sarveshwar use **Fixed Base mode**. Survey-In is provided for commissioning/lab work only.

## 3. RTCM messages enabled by the Base

The Base automatically configures the ZED-F9P for:

- RTCM 1005 - reference station coordinates
- RTCM 1077 - GPS MSM7
- RTCM 1087 - GLONASS MSM7
- RTCM 1097 - Galileo MSM7
- RTCM 1127 - BeiDou MSM7
- RTCM 1230 - GLONASS code-phase biases

Only complete CRC-valid RTCM3 frames are published to Azure. NMEA and UBX bytes are never forwarded to the caster.

## 4. Repository layout

```text
backend/
  main.py                  Base Control Center API (BASE COMPUTER ONLY)
  gnss_reader.py           ZED-F9P Base reader + RTCM publisher
  ublox_config.py          Base/Rover F9P automatic configuration
  gnss_protocol.py         RTCM/UBX/NMEA framing + NAV-PVT/HPPOSLLH/SVIN decoding
  ntrip.py                 TLS NTRIP Base/Rover transports
  ntrip_rover_client.py    Reach Stacker Rover agent (EDGEBOX ONLY)
  rover_log.py             SQLite recording + Excel export
  .env.base.production.example
  .env.base.lab.example
  .env.rover.example
src/
  RoverDashboard.jsx       Multi-Rover RTK dashboard
  LiveMap.jsx              Satellite/street map + trail
  rover.css
deploy/systemd/
  prosper-rtk-base.service
  prosper-rtk-rover.service
deploy/windows/
  Windows Base auto-start scripts
scripts/
  install_base_linux.sh
  install_rover_linux.sh
```

---

# PART A - Dedicated Base Computer

## 5. Base prerequisites

- Python 3.10+
- Node/npm only if building the dashboard
- ZED-F9P connected by USB/serial
- Internet access to `rtk.prosperinfotech.com:443`
- Source password for mountpoint `SARVESHWAR-CFS-BASE01`
- Production surveyed Base coordinates

### Linux: identify the stable GNSS device

```bash
ls -l /dev/serial/by-id/
```

Use the `/dev/serial/by-id/...` path in production instead of `/dev/ttyACM0` whenever possible.

## 6. Base - manual Linux installation

```bash
cd /opt
sudo mkdir -p prosper-rtk
sudo chown "$USER":"$USER" prosper-rtk
```

Copy/extract this project into `/opt/prosper-rtk`, then:

```bash
cd /opt/prosper-rtk
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r backend/requirements.txt
```

Build the dashboard if Node/npm are installed:

```bash
npm ci
npm run build
```

The FastAPI Base service will serve the built `dist/` dashboard on port 8000.

## 7. Base production environment

```bash
sudo mkdir -p /etc/prosper-rtk
sudo cp backend/.env.base.production.example /etc/prosper-rtk/base.env
sudo chmod 600 /etc/prosper-rtk/base.env
sudo nano /etc/prosper-rtk/base.env
```

Required production values:

```text
DEVICE_ROLE=BASE
GNSS_PORT=/dev/serial/by-id/<your-ZED-F9P>
GNSS_BAUD=115200
GNSS_AUTO_CONFIGURE=true

BASE_MODE=fixed
BASE_FIXED_LATITUDE_DEG=<surveyed decimal latitude>
BASE_FIXED_LONGITUDE_DEG=<surveyed decimal longitude>
BASE_FIXED_HEIGHT_ELLIPSOID_M=<surveyed ellipsoid height>
BASE_FIXED_POSITION_ACCURACY_M=0.02

NTRIP_CASTER_HOST=rtk.prosperinfotech.com
NTRIP_CASTER_PORT=443
NTRIP_MOUNTPOINT=SARVESHWAR-CFS-BASE01
NTRIP_SOURCE_PASSWORD=<rotated Base source password>
NTRIP_TLS=true

RTK_TELEMETRY_TOKEN=<long random EdgeBox-to-Base token>
RTK_API_TOKEN=<optional dashboard/admin token; leave blank on an isolated trusted LAN>
```

**Do not use MSL/orthometric elevation in `BASE_FIXED_HEIGHT_ELLIPSOID_M`. It must be ellipsoidal height unless the receiver configuration is intentionally changed.**

## 8. Base - manual test start

For a quick manual start, create `backend/.env` from the production example, then:

```bash
cd /opt/prosper-rtk/backend
../.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Expected startup behavior:

- serial receiver opens;
- F9P is configured as the Base;
- Fixed mode or Survey-In is applied;
- RTCM 1005/1077/1087/1097/1127/1230 begin appearing;
- Base NTRIP source connects to Azure;
- caster bytes/frames begin increasing.

Open:

```text
http://<BASE-IP>:8000/
```

Health endpoint:

```bash
curl http://127.0.0.1:8000/api/health
```

## 9. Base - Linux auto-start after power/reboot

The easiest production installer is:

```bash
cd /path/to/Prosper_CFS_RTK_Production_v4.0.0
sudo ./scripts/install_base_linux.sh
```

Then edit:

```bash
sudo nano /etc/prosper-rtk/base.env
```

Start:

```bash
sudo systemctl start prosper-rtk-base
```

Verify:

```bash
sudo systemctl status prosper-rtk-base --no-pager
sudo journalctl -u prosper-rtk-base -f
```

The service uses:

```text
Restart=always
RestartSec=5
```

and is enabled under `multi-user.target`, so it automatically returns after reboot/power restoration.

## 10. Base - Windows installation

From the project root in PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt
npm install
npm run build
```

Create:

```text
backend\.env
```

from `backend\.env.base.production.example`, using `COMx` for `GNSS_PORT`.

Manual start:

```powershell
.\start_base.bat
```

Install automatic startup (run PowerShell as Administrator):

```powershell
.\deploy\windows\install_base_startup_task.ps1 -ProjectRoot "D:\RTK_base" -PythonExe "D:\RTK_base\.venv\Scripts\python.exe"
```

---

# PART B - Reach Stacker AI EdgeBox Rover

## 11. Rover prerequisites

Each Reach Stacker has its own:

- AI EdgeBox / Jetson / Ubuntu computer;
- ZED-F9P Rover receiver;
- unique NTRIP identity such as `RS-01`, `RS-02`;
- unique NTRIP password;
- network access to Azure TCP 443;
- network access to the Base Control Center telemetry API.

## 12. Rover - production Linux install

Copy/extract the project to the EdgeBox, then:

```bash
cd /path/to/Prosper_CFS_RTK_Production_v4.0.0
sudo ./scripts/install_rover_linux.sh
```

Edit:

```bash
sudo nano /etc/prosper-rtk/rover.env
```

Example RS-01:

```text
DEVICE_ROLE=ROVER
RTK_DEVICE_ID=RS-01

GNSS_PORT=/dev/serial/by-id/<RS01-ZED-F9P>
GNSS_BAUD=115200
GNSS_AUTO_CONFIGURE=true
ROVER_MEASUREMENT_RATE_MS=200
ROVER_API_ENABLED=true
ROVER_API_HOST=127.0.0.1
ROVER_API_PORT=8081

NTRIP_CASTER_HOST=rtk.prosperinfotech.com
NTRIP_CASTER_PORT=443
NTRIP_MOUNTPOINT=SARVESHWAR-CFS-BASE01
NTRIP_ROVER_USERNAME=RS-01
NTRIP_ROVER_PASSWORD=<RS01 password>
NTRIP_TLS=true

TELEMETRY_URL=http://<BASE-COMPUTER-IP>:8000
TELEMETRY_API_TOKEN=<same value as Base RTK_TELEMETRY_TOKEN>
```

For RS-02 change both:

```text
RTK_DEVICE_ID=RS-02
NTRIP_ROVER_USERNAME=RS-02
```

and use the RS-02 password.

## 13. Rover - manual test start

Create `backend/.env` from `.env.rover.example`, or export the variables, then:

```bash
cd /opt/prosper-rtk/backend
../.venv/bin/python ntrip_rover_client.py
```

Optional explicit machine/port:

```bash
../.venv/bin/python ntrip_rover_client.py \
  --machine RS-01 \
  --port /dev/serial/by-id/<device>
```

Expected output progresses approximately as:

```text
3D FIX
  -> DGPS / DIFFERENTIAL
  -> RTK FLOAT
  -> RTK FIXED
```

The Rover also exposes a local API on the EdgeBox for ContainerVision/AI integration:

```bash
curl http://127.0.0.1:8081/api/v1/position | jq
```

Use `precision_ready=true` as the software gate before using the position for precise slot/location logic. The local API updates from the receiver at the Rover navigation rate (default 5 Hz); dashboard telemetry is intentionally lower-rate.

The Rover console also shows:

- receiver hAcc;
- number of RTCM frames received;
- correction age;
- NTRIP state;
- Dashboard connectivity.

## 14. Rover - automatic restart after EdgeBox reboot/power cycle

```bash
sudo systemctl start prosper-rtk-rover
sudo systemctl status prosper-rtk-rover --no-pager
sudo journalctl -u prosper-rtk-rover -f
```

The installer already enables the service, so after a Reach Stacker/EdgeBox power cycle it starts automatically.

Test it:

```bash
sudo reboot
```

After the EdgeBox returns:

```bash
systemctl is-enabled prosper-rtk-rover
systemctl is-active prosper-rtk-rover
```

Both should return `enabled` / `active`.

---

# PART C - Dashboard and validation

## 15. Dashboard functions

The React Control Center shows:

- Base fixed/survey mode and position;
- Base receiver hAcc/vAcc;
- RTCM message counts;
- Azure caster streaming state;
- all Reach Stackers seen by the Base server;
- per-machine Rover selector;
- RTK FIXED / FLOAT / no-RTK badge;
- receiver-reported hAcc/vAcc;
- correction age and RTCM frame count;
- speed and heading from NAV-PVT;
- satellite count and PDOP;
- live map, rover trail and Base-to-Rover baseline;
- SQLite recording and Excel export.

## 16. Minimum validation before accepting RTK positioning

A precise slot/location decision should be made only when:

```text
Rover carrier_solution = 2
Rover carrier_solution_text = RTK FIXED
NTRIP connected = true
correction_age_s <= 5 seconds (preferably <= 2 s)
last_rtcm_utc continuously updates
receiver hAcc is within the project's operational threshold
precision_ready = true
```

For final site acceptance, place the Rover antenna on independently surveyed check points and measure the actual error. Do not use `RTK FIXED` alone as proof of absolute accuracy.

## 17. Base acceptance checks

On the dashboard confirm:

```text
Base mode = FIXED
Caster = STREAMING
RTCM frame count increasing
1005 increasing
1077 increasing
1087 increasing
1097 increasing
1127 increasing
1230 increasing
```

For Survey-In commissioning only, confirm `survey_valid=true` before relying on the Base corrections.

## 18. Rover acceptance checks

Confirm:

```text
NTRIP = CONNECTED
RTCM frames increasing
Correction age low
Differential solution = true
Carrier solution = RTK FIXED
hAcc/vAcc populated from the receiver
```

The Rover agent also publishes `precision_ready=true` only when RTK is fixed, NTRIP is up, correction age is within the configured limit, and receiver hAcc is below the configured threshold. Then perform a physical check-point accuracy test.

## 19. Credentials and source control

Never commit any of these into Git:

```text
NTRIP_SOURCE_PASSWORD
NTRIP_ROVER_PASSWORD
RTK_TELEMETRY_TOKEN / TELEMETRY_API_TOKEN
RTK_API_TOKEN (if used)
```

The earlier lab credentials should be rotated before production deployment because they were used during development/testing.

## 20. Tests

Protocol/NTRIP unit tests:

```bash
cd backend
python -m unittest -v test_gnss_protocol.py test_ntrip.py
```

Full Python syntax check:

```bash
python -m compileall backend
```

Frontend checks after installing Node dependencies:

```bash
npm run build
npm run lint
```

## 21. Important production note

The software is designed to support centimeter-class RTK, but the final absolute accuracy is controlled by the complete system: surveyed Base coordinates, antenna quality/placement, multipath, satellite geometry, baseline distance, RF/network reliability, correction age and RTK carrier state.
