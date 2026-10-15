"""
NTRIP Base Station Caster (Uploads RTCM3 to Prosper Azure NTRIP Caster)
========================================================================
Runs on LAPTOP 1 (Base Station).
Reads RTCM3 differential correction packets from the u-blox Base GNSS receiver
over USB Serial (e.g. COM6) and streams them to the central Azure NTRIP Caster:
  Host:       rtk.prosperinfotech.com
  Port:       443 (TLS)
  Mountpoint: SARVESHWAR-CFS-BASE01

Usage:
  python ntrip_base_caster.py
  (All defaults are pre-configured for Prosper Azure Caster & auto-detects COM port)
"""

import argparse
import os
import socket
import ssl
import sys
import time
import serial
import serial.tools.list_ports

DEFAULT_CASTER_HOST = "rtk.prosperinfotech.com"
DEFAULT_CASTER_PORT = 443
DEFAULT_MOUNTPOINT = "SARVESHWAR-CFS-BASE01"
DEFAULT_SOURCE_PASSWORD = os.environ.get(
    "NTRIP_SOURCE_PASSWORD",
    "1626e00b933feef1e11a6aa7b572d352e866e1187df79146"
)

def detect_ublox_port(default="COM6"):
    """Auto-detect u-blox USB serial port"""
    for p in serial.tools.list_ports.comports():
        desc = (p.description or "").lower()
        hwid = (p.hwid or "").lower()
        if "1546" in hwid or "u-blox" in desc or "ublox" in desc:
            return p.device
    return default

def parse_rtcm_type(data):
    """Inspect packet to identify RTCM3 message type (e.g. 1005, 1077, 1087, 1097, 1127, 1230)"""
    if len(data) >= 5 and data[0] == 0xD3:
        msg_id = (data[3] << 4) | (data[4] >> 4)
        return msg_id
    return None

def connect_ntrip_caster(host, port, mountpoint, password, use_tls=True):
    """Establishes an NTRIP 1.0 SOURCE connection to Prosper Azure Caster"""
    print(f"[NTRIP] Connecting to caster {host}:{port} ({'TLS' if use_tls else 'PLAIN'}) for mountpoint /{mountpoint}...")
    try:
        raw_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        raw_sock.settimeout(10.0)

        if use_tls or port == 443:
            context = ssl.create_default_context()
            sock = context.wrap_socket(raw_sock, server_hostname=host)
        else:
            sock = raw_sock

        sock.connect((host, port))

        # NTRIP 1.0 Source Handshake
        auth_header = f"SOURCE {password} /{mountpoint}\r\n"
        auth_header += "Source-Agent: NTRIP ProsperBaseCaster/1.0\r\n"
        auth_header += "STR: \r\n"
        auth_header += "\r\n"

        sock.sendall(auth_header.encode('ascii'))

        response = sock.recv(1024).decode('ascii', errors='ignore')
        if "ICY 200 OK" in response or "200 OK" in response:
            print(f"[NTRIP] [OK] Connected successfully! Mountpoint /{mountpoint} is now LIVE on {host}:{port}")
            return sock
        else:
            print(f"[NTRIP CASTER ERROR]: {response.strip()}")
            try:
                sock.close()
            except Exception:
                pass
            return None
    except Exception as e:
        print(f"[NTRIP] Connection failed: {e}")
        return None

def main():
    detected_port = detect_ublox_port("COM6")

    parser = argparse.ArgumentParser(description="NTRIP Base Station Caster (Prosper Azure)")
    parser.add_argument("--port", type=str, default=detected_port, help=f"Base Serial Port (auto-detected: {detected_port})")
    parser.add_argument("--baud", type=int, default=115200, help="Baud rate (default: 115200)")
    parser.add_argument("--caster", type=str, default=DEFAULT_CASTER_HOST, help=f"Caster Host (default: {DEFAULT_CASTER_HOST})")
    parser.add_argument("--caster-port", type=int, default=DEFAULT_CASTER_PORT, help=f"Caster Port (default: {DEFAULT_CASTER_PORT})")
    parser.add_argument("--mountpoint", type=str, default=DEFAULT_MOUNTPOINT, help=f"Mountpoint (default: {DEFAULT_MOUNTPOINT})")
    parser.add_argument("--password", type=str, default=DEFAULT_SOURCE_PASSWORD, help="NTRIP Source Password")
    parser.add_argument("--no-tls", action="store_true", help="Disable TLS encryption")

    args = parser.parse_args()
    use_tls = not args.no_tls if args.caster_port != 443 else True

    print("\n=======================================================")
    print("   PROSPER RTK BASE STATION CASTER (LAPTOP 1)")
    print("=======================================================")
    print(f"  * Base USB Serial Port: {args.port} @ {args.baud} baud")
    print(f"  * NTRIP Caster:         {args.caster}:{args.caster_port} ({'TLS 443' if use_tls else 'PLAIN'})")
    print(f"  * Mountpoint:           /{args.mountpoint}")
    print("=======================================================\n")

    # 1. Open Base Serial Port
    try:
        ser = serial.Serial(args.port, args.baud, timeout=1.0)
        print(f"[SERIAL] Connected to Base receiver on {args.port}")
    except Exception as e:
        print(f"[ERROR] Could not open {args.port}: {e}")
        print("Note: If the local web server is already using this port, stop it first or use a separate COM port.")
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
            if caster_socket is None:
                caster_socket = connect_ntrip_caster(
                    args.caster, args.caster_port, args.mountpoint, args.password, use_tls=use_tls
                )
                if caster_socket is None:
                    print("[NTRIP] Retrying in 5 seconds...")
                    time.sleep(5)
                    continue

            raw_bytes = ser.read(ser.in_waiting or 1)
            if not raw_bytes:
                time.sleep(0.02)
                continue

            try:
                caster_socket.sendall(raw_bytes)
                total_bytes_sent += len(raw_bytes)

                for i in range(len(raw_bytes) - 4):
                    if raw_bytes[i] == 0xD3:
                        msg_id = parse_rtcm_type(raw_bytes[i:i+6])
                        if msg_id:
                            rtcm_counts[msg_id] = rtcm_counts.get(msg_id, 0) + 1

                now = time.time()
                if now - last_stat_time >= 1.0:
                    summary_msgs = ", ".join([f"RTCM {k}" for k in sorted(rtcm_counts.keys())]) or "Streaming GNSS corrections"
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
