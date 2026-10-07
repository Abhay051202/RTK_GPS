"""
RTK Rover Client Script
=======================
Reads live NMEA coordinates from the physical Rover GNSS receiver over USB Serial (e.g. COM4)
or simulates field movement, and transmits real-time telemetry to the RTK Base Station Server.

Usage:
  1. With a physical Rover GNSS module on USB:
     python rover_client.py --port COM4 --baud 115200

  2. Auto-detect available COM ports:
     python rover_client.py --auto

  3. Simulation / Test Mode (no hardware needed):
     python rover_client.py --simulate

  4. Sending to a remote laptop / server IP:
     python rover_client.py --port COM4 --host 192.168.1.50:8000
"""

import argparse
import json
import math
import sys
import time
import urllib.request
import urllib.error

try:
    import serial
    import serial.tools.list_ports
    import pynmea2
except ImportError:
    print("[ERROR] Required packages missing. Run: pip install pyserial pynmea2")
    sys.exit(1)


FIX_QUALITY_MAP = {
    0: ("NO FIX", 0),
    1: ("AUTONOMOUS (GPS)", 1),
    2: ("DGPS (DIFFERENTIAL)", 2),
    4: ("RTK FIXED (cm accuracy)", 4),
    5: ("RTK FLOAT (sub-meter)", 5)
}


def list_serial_ports():
    ports = list(serial.tools.list_ports.comports())
    print("\n--- Available Serial Ports ---")
    if not ports:
        print("  No serial devices found.")
    for p in ports:
        print(f"  * {p.device}: {p.description} (VID: {hex(p.vid) if p.vid else 'N/A'}, PID: {hex(p.pid) if p.pid else 'N/A'})")
    print("------------------------------\n")
    return ports


def send_telemetry(host, payload):
    url = f"http://{host}/api/rover/telemetry"
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return True, data.get("distance_to_base_meters", 0.0)
    except urllib.error.URLError as e:
        return False, str(e)
    except Exception as e:
        return False, str(e)


def run_hardware_rover(port, baudrate, host, device_id):
    print(f"\n[ROVER] Opening serial connection on {port} @ {baudrate} baud...")
    try:
        ser = serial.Serial(port=port, baudrate=baudrate, timeout=1.0)
    except Exception as e:
        print(f"[ERROR] Could not open {port}: {e}")
        list_serial_ports()
        sys.exit(1)

    print(f"[ROVER] Connected to {port}! Forwarding NMEA telemetry to http://{host}/api/rover/telemetry")
    print("[ROVER] Press Ctrl+C to stop.\n")

    current_lat = None
    current_lng = None
    current_alt = 14.0
    current_speed = 0.0
    current_heading = 0.0
    fix_status = "SEARCHING..."
    fix_quality = 0
    sat_count = 0
    last_send_time = 0

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
                        fix_status, fix_quality = FIX_QUALITY_MAP.get(raw_qual, ("GPS FIX", raw_qual))
                        sat_count = int(msg.num_sats or 0)
                except Exception:
                    pass

            elif line.startswith(("$GNRMC", "$GPRMC")):
                try:
                    msg = pynmea2.parse(line)
                    if msg.latitude and msg.longitude:
                        current_lat = msg.latitude
                        current_lng = msg.longitude
                    if msg.spd_over_grnd is not None:
                        current_speed = round(float(msg.spd_over_grnd) * 1.852, 1) # knots to km/h
                    if msg.true_course is not None:
                        current_heading = round(float(msg.true_course), 1)
                except Exception:
                    pass

            # Transmit telemetry at ~5 Hz rate (every 0.2s)
            now = time.time()
            if current_lat and current_lng and (now - last_send_time >= 0.2):
                payload = {
                    "device_id": device_id,
                    "latitude": round(current_lat, 8),
                    "longitude": round(current_lng, 8),
                    "altitude": round(current_alt, 3),
                    "speed_kmh": current_speed,
                    "heading": current_heading,
                    "battery_percent": 96,
                    "fix_quality": fix_quality,
                    "fix_status_text": fix_status
                }
                ok, res = send_telemetry(host, payload)
                last_send_time = now
                if ok:
                    print(f"\r[LIVE ROVER] Lat: {current_lat:.6f}°, Lng: {current_lng:.6f}° | Fix: {fix_status} ({sat_count} Sats) | Dist to Base: {res:.1f}m", end="", flush=True)
                else:
                    print(f"\r[WARNING] Could not reach server at {host}: {res}", end="", flush=True)

        except KeyboardInterrupt:
            print("\n[ROVER] Stopping hardware rover reader.")
            ser.close()
            break
        except Exception as e:
            time.sleep(0.1)


def run_simulated_rover(host, device_id):
    print(f"\n[SIMULATION] Starting Simulated Rover walking in Prosper CFS Yard...")
    print(f"[SIMULATION] Streaming coordinates to http://{host}/api/rover/telemetry")
    print("[SIMULATION] Press Ctrl+C to stop.\n")

    # Center of yard near base station
    center_lat = 18.903250
    center_lng = 73.046550
    radius_lat = 0.00045 # ~50m
    radius_lng = 0.00035 # ~38m

    t = 0.0
    while True:
        try:
            # Elliptical path along yard container bays
            lat = center_lat + radius_lat * math.sin(t)
            lng = center_lng + radius_lng * math.cos(t)
            heading = round((math.degrees(-t) + 360) % 360, 1)
            speed = round(5.4 + 1.2 * math.sin(t * 2), 1)

            payload = {
                "device_id": device_id,
                "latitude": round(lat, 8),
                "longitude": round(lng, 8),
                "altitude": 14.1,
                "speed_kmh": speed,
                "heading": heading,
                "battery_percent": 95,
                "fix_quality": 4,
                "fix_status_text": "RTK FIXED (cm level)"
            }

            ok, res = send_telemetry(host, payload)
            if ok:
                print(f"\r[SIM ROVER] Lat: {lat:.6f}°, Lng: {lng:.6f}° | Spd: {speed} km/h | Dist to Base: {res:.1f}m   ", end="", flush=True)
            else:
                print(f"\r[SIM ROVER] Waiting for server at {host}... ({res})", end="", flush=True)

            t += 0.04
            time.sleep(0.2)
        except KeyboardInterrupt:
            print("\n[SIMULATION] Stopping simulated rover.")
            break


def main():
    parser = argparse.ArgumentParser(description="RTK Rover Serial Reader & Telemetry Transmitter")
    parser.add_argument("--port", type=str, default=None, help="Serial COM port (e.g. COM4 or /dev/ttyUSB0)")
    parser.add_argument("--baud", type=int, default=115200, help="Baud rate (default: 115200)")
    parser.add_argument("--host", type=str, default="127.0.0.1:8000", help="Base station server host:port (default: 127.0.0.1:8000)")
    parser.add_argument("--device", type=str, default="ROVER-RS-01", help="Rover Device ID (default: ROVER-RS-01)")
    parser.add_argument("--simulate", action="store_true", help="Run simulated rover walking in yard")
    parser.add_argument("--auto", action="store_true", help="Auto-detect and list available serial ports")

    args = parser.parse_args()

    if args.auto:
        ports = list_serial_ports()
        # Find port other than COM3 (which is base station)
        rover_port = None
        for p in ports:
            if "COM3" not in p.device.upper():
                rover_port = p.device
                break
        if rover_port:
            print(f"-> Auto-detected candidate Rover port: {rover_port}")
            run_hardware_rover(rover_port, args.baud, args.host, args.device)
        else:
            print("-> No secondary Rover COM port detected. Use --simulate or plug in Rover USB.")
            return

    elif args.simulate:
        run_simulated_rover(args.host, args.device)

    elif args.port:
        run_hardware_rover(args.port, args.baud, args.host, args.device)

    else:
        print("\n=== RTK ROVER CLIENT ===")
        list_serial_ports()
        print("Choose an option:")
        print("  1. Physical Rover on USB:   python rover_client.py --port COM4")
        print("  2. Auto-detect Rover port:  python rover_client.py --auto")
        print("  3. Run Simulated Rover:     python rover_client.py --simulate")
        print()


if __name__ == "__main__":
    main()
