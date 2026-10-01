import serial
import pynmea2
import time

print("Opening COM3 at 115200 baud...")
try:
    ser = serial.Serial('COM3', 115200, timeout=1.5)
    print("Successfully connected to COM3!")
    
    for i in range(20):
        raw_line = ser.readline().decode('ascii', errors='replace').strip()
        if not raw_line:
            continue
        print("RAW:", raw_line)
        if raw_line.startswith('$GNGGA') or raw_line.startswith('$GPGGA'):
            try:
                msg = pynmea2.parse(raw_line)
                print(f"--> [FIX PARSED] Lat: {msg.latitude:.7f}, Lng: {msg.longitude:.7f}, Alt: {msg.altitude} {msg.altitude_units}, Sats: {msg.num_sats}, Quality: {msg.gps_qual}, HDOP: {msg.horizontal_dil}")
            except Exception as e:
                print("Parse error:", e)
        time.sleep(0.05)
    ser.close()
    print("Test complete.")
except Exception as e:
    print("Failed to open COM3:", e)
