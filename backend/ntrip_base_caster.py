"""
NTRIP Base Station Caster (Uploads RTCM3 to RTK2GO)
====================================================
Runs on LAPTOP 1 (Base Station).
Reads RTCM3 differential correction packets from the u-blox Base GNSS receiver
over USB Serial (e.g. COM3) and streams them to the free global NTRIP caster (rtk2go.com).

Usage:
  python ntrip_base_caster.py --port COM3 --mountpoint PROSPER_CFS_01 --password YOUR_PASSWORD

Free Mountpoint Setup on RTK2GO:
  1. Visit: http://www.rtk2go.com/
  2. Register your free mountpoint name (e.g. PROSPER_CFS_01) with your email.
  3. Run this script!
"""

import argparse
import base64
import socket
import sys
import time
import serial
import serial.tools.list_ports

def parse_rtcm_type(data):
    """Inspect packet to identify RTCM3 message type (e.g. 1005, 1074, 1084)"""
    if len(data) >= 5 and data[0] == 0xD3:
        # Message ID is the first 12 bits of the payload (byte 3 and top 4 bits of byte 4)
        msg_id = (data[3] << 4) | (data[4] >> 4)
        return msg_id
    return None

def connect_ntrip_caster(host, port, mountpoint, password):
    """Establishes an NTRIP 1.0 SOURCE connection to RTK2GO"""
    print(f"[NTRIP] Connecting to caster {host}:{port} for mountpoint /{mountpoint}...")
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(10.0)
    try:
        s.connect((host, port))
        
        # Standard NTRIP 1.0 Source Handshake
        # SOURCE <password> /<mountpoint>
        auth_header = f"SOURCE {password} /{mountpoint}\r\n"
        auth_header += "Source-Agent: NTRIP PythonBaseCaster/1.0\r\n"
        auth_header += "STR: \r\n"
        auth_header += "\r\n"
        
        s.sendall(auth_header.encode('ascii'))
        
        # Read response
        response = s.recv(1024).decode('ascii', errors='ignore')
        if "ICY 200 OK" in response or "200 OK" in response:
            print(f"[NTRIP] Connected successfully! Mountpoint /{mountpoint} is now LIVE on {host}:{port}")
            return s
        else:
            print(f"[NTRIP CASTER ERROR]: {response.strip()}")
            s.close()
            return None
    except Exception as e:
        print(f"[NTRIP] Connection failed: {e}")
        try:
            s.close()
        except Exception:
            pass
        return None

def main():
    parser = argparse.ArgumentParser(description="NTRIP Base Station Caster (RTCM3 Upload)")
    parser.add_argument("--port", type=str, default="COM3", help="Base Station USB Serial port (default: COM3)")
    parser.add_argument("--baud", type=int, default=115200, help="Baud rate (default: 115200)")
    parser.add_argument("--caster", type=str, default="rtk2go.com", help="NTRIP Caster Host (default: rtk2go.com)")
    parser.add_argument("--caster-port", type=int, default=2101, help="NTRIP Caster Port (default: 2101)")
    parser.add_argument("--mountpoint", type=str, default="PROSPER_CFS_01", help="Your Mountpoint Name (e.g. PROSPER_CFS_01)")
    parser.add_argument("--password", type=str, default="betatest", help="RTK2GO registration password")

    args = parser.parse_args()

    print("\n=======================================================")
    print("   RTK BASE STATION NTRIP CASTER (LAPTOP 1)")
    print("=======================================================")
    print(f"  * Base USB Serial Port: {args.port} @ {args.baud} baud")
    print(f"  * NTRIP Caster:         {args.caster}:{args.caster_port}")
    print(f"  * Mountpoint:           /{args.mountpoint}")
    print("=======================================================\n")

    # 1. Open Base Serial Port
    try:
        ser = serial.Serial(args.port, args.baud, timeout=1.0)
        print(f"[SERIAL] Connected to Base receiver on {args.port}")
    except Exception as e:
        print(f"[ERROR] Could not open {args.port}: {e}")
        print("Available ports:")
        for p in serial.tools.list_ports.comports():
            print(f"  * {p.device}: {p.description}")
        sys.exit(1)

    # 2. Continuous Caster Upload Loop
    caster_socket = None
    total_bytes_sent = 0
    rtcm_counts = {}
    last_stat_time = time.time()

    while True:
        try:
            # Reconnect to Caster if disconnected
            if caster_socket is None:
                caster_socket = connect_ntrip_caster(args.caster, args.caster_port, args.mountpoint, args.password)
                if caster_socket is None:
                    print("[NTRIP] Retrying in 5 seconds...")
                    time.sleep(5)
                    continue

            # Read raw bytes from Base GNSS receiver
            raw_bytes = ser.read(ser.in_waiting or 1)
            if not raw_bytes:
                time.sleep(0.02)
                continue

            # Send raw RTCM bytes to NTRIP Caster
            try:
                caster_socket.sendall(raw_bytes)
                total_bytes_sent += len(raw_bytes)

                # Identify RTCM packet type for live diagnostics
                for i in range(len(raw_bytes) - 4):
                    if raw_bytes[i] == 0xD3:
                        msg_id = parse_rtcm_type(raw_bytes[i:i+6])
                        if msg_id:
                            rtcm_counts[msg_id] = rtcm_counts.get(msg_id, 0) + 1

                # Print live status every second
                now = time.time()
                if now - last_stat_time >= 1.0:
                    summary_msgs = ", ".join([f"RTCM {k}" for k in sorted(rtcm_counts.keys())]) or "Streaming raw GNSS frames"
                    kb_sent = total_bytes_sent / 1024.0
                    print(f"\r[UPLOADING RTCM3] Sent: {kb_sent:.1f} KB | Active Types: [{summary_msgs}]    ", end="", flush=True)
                    last_stat_time = now

            except (socket.error, BrokenPipeError) as sock_err:
                print(f"\n[WARNING] Caster connection lost: {sock_err}. Reconnecting...")
                try:
                    caster_socket.close()
                except Exception:
                    pass
                caster_socket = None
                time.sleep(2)

        except KeyboardInterrupt:
            print("\n[STOP] Stopping Base NTRIP Caster.")
            break
        except Exception as e:
            print(f"\n[ERROR]: {e}")
            time.sleep(1)

    if caster_socket:
        caster_socket.close()
    if ser and ser.is_open:
        ser.close()

if __name__ == "__main__":
    main()
