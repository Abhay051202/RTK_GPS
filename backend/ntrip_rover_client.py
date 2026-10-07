"""
NTRIP Rover Client & RTCM Injector (Downloads from RTK2GO)
===========================================================
Runs on LAPTOP 2 (Rover in the Yard).
1. Pulls RTCM3 differential corrections over 4G/Internet from rtk2go.com.
2. Injects RTCM3 bytes into the Rover's USB Serial COM port.
3. Reads the resulting cm-accurate NMEA coordinates from the Rover.
4. Forwards live RTK FIXED coordinates to the Yard Survey Map (http://127.0.0.1:8000).

Usage:
  python ntrip_rover_client.py --port COM3 --mountpoint PROSPER_CFS_01
"""

import argparse
import json
import socket
import sys
import threading
import time
import urllib.request
import serial
import serial.tools.list_ports
import pynmea2

FIX_QUALITY_MAP = {
    0: ("NO FIX", 0),
    1: ("3D SINGLE (GPS)", 1),
    2: ("DGPS / SBAS", 2),
    4: ("🟢 RTK FIXED (1-2 cm accuracy!)", 4),
    5: ("🟡 RTK FLOAT (sub-meter)", 5)
}

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

def connect_ntrip_stream(caster_host, caster_port, mountpoint):
    """Establishes an NTRIP 1.0 Client connection to pull RTCM3"""
    print(f"[NTRIP] Connecting to caster {caster_host}:{caster_port} for /{mountpoint}...")
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(10.0)
    try:
        s.connect((caster_host, caster_port))
        
        request = (
            f"GET /{mountpoint} HTTP/1.0\r\n"
            f"User-Agent: NTRIP PythonRover/1.0\r\n"
            f"Accept: */*\r\n"
            f"Connection: close\r\n\r\n"
        )
        s.sendall(request.encode('ascii'))
        
        # Read header response until \r\n\r\n
        response_hdr = b""
        while b"\r\n\r\n" not in response_hdr:
            chunk = s.recv(512)
            if not chunk:
                break
            response_hdr += chunk
            
        header_text = response_hdr.decode('ascii', errors='ignore')
        if "200 OK" in header_text or "ICY 200 OK" in header_text:
            print(f"[NTRIP] Connected! Receiving live RTCM3 corrections from /{mountpoint}")
            return s
        else:
            print(f"[NTRIP CASTER ERROR]: {header_text.splitlines()[0] if header_text else 'Unknown error'}")
            s.close()
            return None
    except Exception as e:
        print(f"[NTRIP] Connection error: {e}")
        try:
            s.close()
        except Exception:
            pass
        return None

def main():
    parser = argparse.ArgumentParser(description="NTRIP Rover Client & RTCM Injector")
    parser.add_argument("--port", type=str, default="COM3", help="Rover USB Serial port (default: COM3)")
    parser.add_argument("--baud", type=int, default=115200, help="Baud rate (default: 115200)")
    parser.add_argument("--caster", type=str, default="rtk2go.com", help="NTRIP Caster Host (default: rtk2go.com)")
    parser.add_argument("--caster-port", type=int, default=2101, help="NTRIP Caster Port (default: 2101)")
    parser.add_argument("--mountpoint", type=str, default="PROSPER_CFS_01", help="Base Station Mountpoint Name")
    parser.add_argument("--dashboard-host", type=str, default="127.0.0.1:8000", help="Local dashboard host (default: 127.0.0.1:8000)")

    args = parser.parse_args()

    print("\n=======================================================")
    print("   RTK ROVER CLIENT & RTCM INJECTOR (LAPTOP 2)")
    print("=======================================================")
    print(f"  * Rover USB Serial Port: {args.port} @ {args.baud} baud")
    print(f"  * NTRIP Stream:          {args.caster}:{args.caster_port}/{args.mountpoint}")
    print(f"  * Web UI Dashboard:      http://{args.dashboard-host}")
    print("=======================================================\n")

    # 1. Open Rover Serial Port
    try:
        ser = serial.Serial(args.port, args.baud, timeout=0.5)
        print(f"[SERIAL] Connected to Rover receiver on {args.port}")
    except Exception as e:
        print(f"[ERROR] Could not open {args.port}: {e}")
        print("Available ports:")
        for p in serial.tools.list_ports.comports():
            print(f"  * {p.device}: {p.description}")
        sys.exit(1)

    is_running = True
    ntrip_sock = None

    # Thread 1: Pull RTCM3 from RTK2GO and inject into Rover USB Serial
    def rtcm_injector_loop():
        nonlocal ntrip_sock
        total_rtcm_bytes = 0
        while is_running:
            try:
                if ntrip_sock is None:
                    ntrip_sock = connect_ntrip_stream(args.caster, args.caster_port, args.mountpoint)
                    if ntrip_sock is None:
                        time.sleep(5)
                        continue

                data = ntrip_sock.recv(1024)
                if not data:
                    print("[NTRIP] Stream ended by caster. Reconnecting...")
                    ntrip_sock.close()
                    ntrip_sock = None
                    time.sleep(2)
                    continue

                # Write RTCM3 bytes into the Rover's USB Serial RX
                ser.write(data)
                total_rtcm_bytes += len(data)
            except socket.timeout:
                continue
            except Exception as e:
                print(f"\n[NTRIP RECONNECT]: {e}")
                if ntrip_sock:
                    try:
                        ntrip_sock.close()
                    except Exception:
                        pass
                    ntrip_sock = None
                time.sleep(3)

    injector_thread = threading.Thread(target=rtcm_injector_loop, daemon=True)
    injector_thread.start()

    # Main Thread: Read NMEA from Rover and monitor RTK FIX status
    last_print_time = time.time()
    current_lat = None
    current_lng = None
    current_alt = 14.0
    current_qual = 0
    current_status = "INITIALIZING..."
    current_sats = 0
    current_speed = 0.0

    print("[ROVER] Listening for GPS coordinates and waiting for RTK lock...\n")

    try:
        while True:
            try:
                line = ser.readline().decode('ascii', errors='replace').strip()
                if not line:
                    continue

                if line.startswith(("$GNGGA", "$GPGGA")):
                    try:
                        msg = pynmea2.parse(line)
                        if msg.latitude and msg.longitude:
                            current_lat = msg.latitude
                            current_lng = msg.longitude
                            current_alt = float(msg.altitude or 14.0)
                            raw_qual = int(msg.gps_qual or 0)
                            current_status, current_qual = FIX_QUALITY_MAP.get(raw_qual, (f"FIX {raw_qual}", raw_qual))
                            current_sats = int(msg.num_sats or 0)

                            # Send to Web UI Dashboard
                            payload = {
                                "device_id": "ROVER-RS-01",
                                "latitude": round(current_lat, 8),
                                "longitude": round(current_lng, 8),
                                "altitude": round(current_alt, 3),
                                "speed_kmh": current_speed,
                                "battery_percent": 98,
                                "fix_quality": current_qual,
                                "fix_status_text": current_status
                            }
                            send_to_dashboard(payload, args.dashboard_host)
                    except Exception:
                        pass

                elif line.startswith(("$GNRMC", "$GPRMC")):
                    try:
                        msg = pynmea2.parse(line)
                        if msg.spd_over_grnd is not None:
                            current_speed = round(float(msg.spd_over_grnd) * 1.852, 1)
                    except Exception:
                        pass

                # Print clean terminal feedback every 0.5s
                now = time.time()
                if current_lat and (now - last_print_time >= 0.5):
                    print(f"\r[{current_status}] Lat: {current_lat:.8f}°, Lng: {current_lng:.8f}° | Sats: {current_sats} | Alt: {current_alt:.2f}m   ", end="", flush=True)
                    last_print_time = now

            except serial.SerialException as se:
                print(f"\n[SERIAL ERROR]: {se}")
                time.sleep(1)

    except KeyboardInterrupt:
        print("\n[STOP] Stopping Rover NTRIP client.")
        is_running = False

    if ntrip_sock:
        ntrip_sock.close()
    if ser and ser.is_open:
        ser.close()

if __name__ == "__main__":
    main()
