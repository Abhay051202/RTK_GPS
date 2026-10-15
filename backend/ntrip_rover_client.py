"""
NTRIP Rover Client & RTCM Injector (Downloads from Prosper Azure Caster)
========================================================================
Runs on LAPTOP 2 (Rover receiver on Reach Stacker / Field Laptop).
1. Pulls RTCM3 differential corrections over 4G/Cellular from:
     rtk.prosperinfotech.com:443 (TLS)
     Mountpoint: SARVESHWAR-CFS-BASE01
     User:       LAB-ROVER (or RS-01 / RS-02)
2. Injects RTCM3 bytes into the Rover's USB Serial COM port.
3. Reads the resulting cm-accurate NMEA coordinates from the Rover.
4. Forwards live RTK FIXED coordinates to the Dashboard (http://127.0.0.1:8000).

Usage:
  python ntrip_rover_client.py
  (All defaults are pre-configured for Prosper Azure Caster & auto-detects COM port)
"""

import argparse
import base64
import json
import os
import socket
import ssl
import sys
import threading
import time
import urllib.request
import serial
import serial.tools.list_ports
import pynmea2

DEFAULT_CASTER_HOST = "rtk.prosperinfotech.com"
DEFAULT_CASTER_PORT = 443
DEFAULT_MOUNTPOINT = "SARVESHWAR-CFS-BASE01"

# Known Reach Stacker credentials from Sarveshwar Deployment Runbook
KNOWN_MACHINES = {
    "RS-01": {
        "label": "Reach Stacker 01 (Production)",
        "password": "ca6f99b5585b60f8dc21c897495bc4c25ebfa3beaffcd332"
    },
    "RS-02": {
        "label": "Reach Stacker 02 (Production)",
        "password": "e13fb76940fbb80addb4529bec28077c546642d88de47dfc"
    },
    "LAB-ROVER": {
        "label": "USA Test / Lab Rover",
        "password": "200cbc144e801b9fbe6f599780fc9043b68890c2e0ab6a4e"
    }
}

DEFAULT_ROVER_USER = os.environ.get("NTRIP_ROVER_USERNAME", "RS-01")
DEFAULT_ROVER_PASS = os.environ.get("NTRIP_ROVER_PASSWORD", None)

FIX_QUALITY_MAP = {
    0: ("NO FIX", 0),
    1: ("3D SINGLE (GPS)", 1),
    2: ("DGPS / SBAS", 2),
    4: ("RTK FIXED (1-2 cm accuracy!)", 4),
    5: ("RTK FLOAT (sub-meter)", 5)
}

def detect_ublox_port(default="COM3"):
    """Auto-detect u-blox USB serial port"""
    for p in serial.tools.list_ports.comports():
        desc = (p.description or "").lower()
        hwid = (p.hwid or "").lower()
        if "1546" in hwid or "u-blox" in desc or "ublox" in desc:
            return p.device
    return default

def send_to_dashboard(payload, host="127.0.0.1:8000"):
    """Forward live Rover telemetry to the local Web UI backend"""
    url = f"http://{host}/api/rover/telemetry"
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        with urllib.request.urlopen(req, timeout=1.0) as resp:
            pass
    except Exception:
        pass

def connect_ntrip_stream(caster_host, caster_port, mountpoint, username, password, use_tls=True):
    """Establishes an NTRIP 1.0 Client connection over TLS to pull RTCM3"""
    print(f"[NTRIP] Connecting to caster {caster_host}:{caster_port} ({'TLS' if use_tls else 'PLAIN'}) for /{mountpoint}...")
    try:
        raw_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        raw_sock.settimeout(10.0)

        if use_tls or caster_port == 443:
            context = ssl.create_default_context()
            sock = context.wrap_socket(raw_sock, server_hostname=caster_host)
        else:
            sock = raw_sock

        sock.connect((caster_host, caster_port))

        # Basic Auth
        userpass = f"{username}:{password}"
        auth_b64 = base64.b64encode(userpass.encode('utf-8')).decode('ascii')

        request = (
            f"GET /{mountpoint} HTTP/1.0\r\n"
            f"User-Agent: NTRIP ProsperRover/1.0\r\n"
            f"Authorization: Basic {auth_b64}\r\n"
            f"Accept: */*\r\n"
            f"Connection: close\r\n\r\n"
        )
        sock.sendall(request.encode('ascii'))

        # Read header response until \r\n\r\n
        response_hdr = b""
        while b"\r\n\r\n" not in response_hdr:
            chunk = sock.recv(512)
            if not chunk:
                break
            response_hdr += chunk

        header_text = response_hdr.decode('ascii', errors='ignore')
        if "200 OK" in header_text or "ICY 200 OK" in header_text:
            print(f"[NTRIP] [OK] Connected! Receiving live RTCM3 corrections from /{mountpoint} as '{username}'")
            return sock
        else:
            first_line = header_text.splitlines()[0] if header_text else 'Unknown error'
            print(f"[NTRIP CASTER ERROR]: {first_line}")
            if "503" in first_line:
                print("       -> (Base Station is not connected to Azure yet. Start Base caster first!)")
            try:
                sock.close()
            except Exception:
                pass
            return None
    except Exception as e:
        print(f"[NTRIP] Connection error: {e}")
        return None

def main():
    detected_port = detect_ublox_port("COM3")

    parser = argparse.ArgumentParser(description="NTRIP Rover Client & RTCM Injector (Prosper Azure)")
    parser.add_argument("-m", "--machine", type=str, default=None, help="Reach Stacker machine name (e.g. RS-01, RS-02, LAB-ROVER)")
    parser.add_argument("--port", type=str, default=detected_port, help=f"Rover Serial Port (auto-detected: {detected_port})")
    parser.add_argument("--baud", type=int, default=115200, help="Baud rate (default: 115200)")
    parser.add_argument("--caster", type=str, default=DEFAULT_CASTER_HOST, help=f"Caster Host (default: {DEFAULT_CASTER_HOST})")
    parser.add_argument("--caster-port", type=int, default=DEFAULT_CASTER_PORT, help=f"Caster Port (default: {DEFAULT_CASTER_PORT})")
    parser.add_argument("--mountpoint", type=str, default=DEFAULT_MOUNTPOINT, help=f"Mountpoint (default: {DEFAULT_MOUNTPOINT})")
    parser.add_argument("-u", "--user", type=str, default=None, help="NTRIP Rover User")
    parser.add_argument("-p", "--password", type=str, default=None, help="NTRIP Rover Password")
    parser.add_argument("--dashboard-host", type=str, default="127.0.0.1:8000", help="Local dashboard host (default: 127.0.0.1:8000)")
    parser.add_argument("--no-tls", action="store_true", help="Disable TLS encryption")

    args = parser.parse_args()

    # Determine Machine identity
    selected_machine = args.machine or args.user or os.environ.get("NTRIP_ROVER_USERNAME")

    # If running interactively without arguments, prompt the user
    if not selected_machine and sys.stdin.isatty():
        print("\n=======================================================")
        print("   SELECT REACH STACKER MACHINE FOR THIS ROVER:")
        print("=======================================================")
        print("  [1] RS-01     - Reach Stacker 01 (Production)")
        print("  [2] RS-02     - Reach Stacker 02 (Production)")
        print("  [3] LAB-ROVER - USA Test / Lab Rover")
        print("  [4] Custom    - Enter custom machine (e.g. RS-03, RS-04)")
        print("=======================================================")
        try:
            choice = input("Enter choice [1-4 or name, default 1]: ").strip()
            if choice == "2" or choice.upper() == "RS-02":
                selected_machine = "RS-02"
            elif choice == "3" or choice.upper() == "LAB-ROVER":
                selected_machine = "LAB-ROVER"
            elif choice == "4" or choice.lower() in ("custom", "manual", "other"):
                selected_machine = input("Enter Reach Stacker ID (e.g. RS-03): ").strip()
            elif choice:
                selected_machine = choice
            else:
                selected_machine = "RS-01"
        except (KeyboardInterrupt, EOFError):
            print("\nExiting.")
            sys.exit(0)

    # Normalize machine name
    if not selected_machine:
        selected_machine = "RS-01"
    elif selected_machine == "1":
        selected_machine = "RS-01"
    elif selected_machine == "2":
        selected_machine = "RS-02"
    elif selected_machine == "3":
        selected_machine = "LAB-ROVER"

    selected_machine = selected_machine.upper().strip()

    # Lookup known credentials or custom
    machine_info = KNOWN_MACHINES.get(selected_machine, {
        "label": f"Custom Reach Stacker ({selected_machine})",
        "password": ""
    })

    rover_user = selected_machine
    rover_pass = args.password or os.environ.get("NTRIP_ROVER_PASSWORD") or machine_info["password"]

    # If it's a new/custom machine and no password was provided, prompt for it
    if not rover_pass and sys.stdin.isatty():
        try:
            rover_pass = input(f"Enter NTRIP password for '{rover_user}': ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nExiting.")
            sys.exit(0)

    use_tls = not args.no_tls if args.caster_port != 443 else True

    print("\n=======================================================")
    print("   PROSPER RTK ROVER CLIENT & RTCM INJECTOR (LAPTOP 2)")
    print("=======================================================")
    print(f"  * Reach Stacker Machine: {rover_user} ({machine_info['label']})")
    print(f"  * Rover USB Serial Port: {args.port} @ {args.baud} baud")
    print(f"  * NTRIP Caster:          {args.caster}:{args.caster_port} ({'TLS 443' if use_tls else 'PLAIN'})")
    print(f"  * Mountpoint:            /{args.mountpoint}")
    print(f"  * Telemetry Host:        http://{args.dashboard_host}")
    print("=======================================================\n")

    # 1. Connect to Rover Serial Port
    try:
        ser = serial.Serial(args.port, args.baud, timeout=1.0)
        print(f"[SERIAL] Connected to Rover receiver on {args.port}")
    except Exception as e:
        print(f"[ERROR] Could not open {args.port}: {e}")
        print("Available ports:")
        for p in serial.tools.list_ports.comports():
            print(f"  * {p.device}: {p.description}")
        sys.exit(1)

    stop_event = threading.Event()
    stats = {"rtcm_bytes_injected": 0, "last_fix": "NO FIX", "lat": 0.0, "lng": 0.0}

    # THREAD A: Pull RTCM3 from Azure Caster & Inject into Rover USB
    def rtcm_worker():
        sock = None
        while not stop_event.is_set():
            try:
                if sock is None:
                    sock = connect_ntrip_stream(
                        args.caster, args.caster_port, args.mountpoint, rover_user, rover_pass, use_tls=use_tls
                    )
                    if sock is None:
                        time.sleep(5)
                        continue

                data = sock.recv(2048)
                if not data:
                    print("[NTRIP] Stream ended by caster. Reconnecting in 3s...")
                    sock.close()
                    sock = None
                    time.sleep(3)
                    continue

                ser.write(data)
                ser.flush()
                stats["rtcm_bytes_injected"] += len(data)

            except Exception as e:
                print(f"[NTRIP STREAM ERROR]: {e}")
                if sock:
                    try:
                        sock.close()
                    except Exception:
                        pass
                sock = None
                time.sleep(3)

        if sock:
            sock.close()

    t_rtcm = threading.Thread(target=rtcm_worker, daemon=True)
    t_rtcm.start()

    # THREAD B: Read NMEA from Rover & Send to Local Dashboard
    last_ui_send = 0
    while not stop_event.is_set():
        try:
            line = ser.readline().decode('ascii', errors='ignore').strip()
            if not line:
                continue

            if line.startswith(("$GNGGA", "$GPGGA")):
                try:
                    msg = pynmea2.parse(line)
                    if msg.latitude and msg.longitude:
                        fix_q = getattr(msg, 'gps_qual', 0)
                        status_text, q_num = FIX_QUALITY_MAP.get(fix_q, ("UNKNOWN", fix_q))
                        stats["last_fix"] = status_text
                        stats["lat"] = msg.latitude
                        stats["lng"] = msg.longitude

                        now = time.time()
                        if now - last_ui_send >= 0.5:
                            telemetry_payload = {
                                "device_id": rover_user,
                                "latitude": round(msg.latitude, 8),
                                "longitude": round(msg.longitude, 8),
                                "altitude": float(msg.altitude) if msg.altitude else None,
                                "fix_quality": q_num,
                                "fix_status_text": status_text,
                                "satellites_used": int(msg.num_sats) if msg.num_sats else 0,
                                "hdop": float(msg.horizontal_dil) if msg.horizontal_dil else 1.0,
                                "speed_kmh": 0.0
                            }
                            send_to_dashboard(telemetry_payload, host=args.dashboard_host)
                            last_ui_send = now

                            kb_inj = stats["rtcm_bytes_injected"] / 1024.0
                            print(
                                f"\r[ROVER FIX] Status: {status_text:<32} | Lat: {msg.latitude:.8f} | Lng: {msg.longitude:.8f} | RTCM Injected: {kb_inj:.1f} KB    ",
                                end="",
                                flush=True
                            )
                except Exception:
                    pass

        except KeyboardInterrupt:
            print("\n[STOP] Stopping Rover client.")
            stop_event.set()
            break
        except Exception as e:
            print(f"\n[SERIAL ERROR]: {e}")
            time.sleep(1)

    if ser and ser.is_open:
        ser.close()

if __name__ == "__main__":
    main()
