"""
Rover GNSS Client Script
Run this script on the Rover (Reach Stacker onboard PC / Raspberry Pi / Jetson / Laptop).

What it does:
1. Connects to the Rover's physical GNSS chip (USB or UART Serial).
2. Parses real-time NMEA sentences ($GNGGA, $GNRMC) to extract Latitude, Longitude, Altitude, Speed, and Heading.
3. Transmits live telemetry over Wi-Fi / Local Network / 4G to the Base Station backend.
"""

import time
import requests
import serial
import pynmea2
import sys

# ================= CONFIGURATION =================
# Replace with the IP address of your Base Station laptop on your local Wi-Fi / Network
BASE_STATION_URL = "http://127.0.0.1:8000/api/rover/telemetry"

# Serial port of the GNSS receiver on the Rover
# On Linux / Raspberry Pi: '/dev/ttyUSB0' or '/dev/ttyACM0'
# On Windows: 'COM4' (or whichever COM port the Rover chip is plugged into)
ROVER_SERIAL_PORT = "COM4"
BAUD_RATE = 115200

# Vehicle identifier
DEVICE_ID = "ROVER-RS-01"
UPDATE_INTERVAL_SEC = 0.2  # 5 updates per second
# =================================================

def run_rover_client():
    print("=" * 60)
    print(f"  STARTING ROVER CLIENT: {DEVICE_ID}")
    print(f"  Target Base Station: {BASE_STATION_URL}")
    print(f"  Listening on Serial: {ROVER_SERIAL_PORT} @ {BAUD_RATE} baud")
    print("=" * 60)

    # Try to open serial port, or fall back to simulation mode if no chip is attached
    ser = None
    try:
        ser = serial.Serial(ROVER_SERIAL_PORT, BAUD_RATE, timeout=1.0)
        print(f"[SUCCESS] Connected to Rover GNSS on {ROVER_SERIAL_PORT}")
    except Exception as e:
        print(f"[WARNING] Could not open {ROVER_SERIAL_PORT} ({e}).")
        print("--> Make sure your Rover GNSS chip is plugged in, or edit ROVER_SERIAL_PORT in this file.\n")
        return

    telemetry = {
        "device_id": DEVICE_ID,
        "latitude": 0.0,
        "longitude": 0.0,
        "altitude": 0.0,
        "speed_kmh": 0.0,
        "heading": 0.0,
        "battery_percent": 95,
        "fix_quality": 4,
        "fix_status_text": "RTK FIXED"
    }

    last_post_time = 0

    while True:
        try:
            line = ser.readline().decode('ascii', errors='replace').strip()
            if not line:
                continue

            # Parse GGA for coordinates, altitude, and RTK fix quality
            if line.startswith('$GNGGA') or line.startswith('$GPGGA'):
                msg = pynmea2.parse(line)
                if msg.latitude and msg.longitude:
                    telemetry["latitude"] = float(msg.latitude)
                    telemetry["longitude"] = float(msg.longitude)
                if hasattr(msg, 'altitude') and msg.altitude is not None:
                    telemetry["altitude"] = float(msg.altitude)
                
                # Check RTK Fix: 4 = RTK Fixed, 5 = RTK Float, 2 = DGPS, 1 = Single
                qual = int(getattr(msg, 'gps_qual', 1) or 1)
                qual_map = {4: "RTK FIXED", 5: "RTK FLOAT", 2: "DGPS", 1: "SINGLE GNSS"}
                telemetry["fix_quality"] = qual
                telemetry["fix_status_text"] = qual_map.get(qual, "FIX ACTIVE")

            # Parse RMC for speed and heading
            elif line.startswith('$GNRMC') or line.startswith('$GPRMC'):
                msg = pynmea2.parse(line)
                if hasattr(msg, 'spd_over_grnd') and msg.spd_over_grnd is not None:
                    # Convert knots to km/h (1 knot = 1.852 km/h)
                    telemetry["speed_kmh"] = round(float(msg.spd_over_grnd) * 1.852, 1)
                if hasattr(msg, 'true_course') and msg.true_course is not None:
                    telemetry["heading"] = round(float(msg.true_course), 1)

            # Transmit to Base Station at set interval
            now = time.time()
            if now - last_post_time >= UPDATE_INTERVAL_SEC and telemetry["latitude"] != 0.0:
                last_post_time = now
                try:
                    resp = requests.post(BASE_STATION_URL, json=telemetry, timeout=0.5)
                    if resp.status_code == 200:
                        data = resp.json()
                        dist = data.get("distance_to_base_meters", 0.0)
                        print(f"[{time.strftime('%H:%M:%S')}] Lat: {telemetry['latitude']:.6f}, Lng: {telemetry['longitude']:.6f} | Baseline Distance: {dist:.1f} m")
                except requests.exceptions.RequestException:
                    print(f"[{time.strftime('%H:%M:%S')}] Waiting for Base Station at {BASE_STATION_URL}...")

        except KeyboardInterrupt:
            print("\nStopping Rover client.")
            break
        except Exception as e:
            time.sleep(0.1)

    if ser and ser.is_open:
        ser.close()

if __name__ == "__main__":
    run_rover_client()
