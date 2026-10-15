"""
Real-time GNSS Serial Reader for u-blox RTK Base Station
- Reads raw serial stream from hardware USB COM port (e.g. COM6)
- Automatically streams raw RTCM3 differential corrections to the Prosper Azure NTRIP Caster:
    Host:       rtk.prosperinfotech.com:443 (TLS)
    Mountpoint: SARVESHWAR-CFS-BASE01
- Parses NMEA sentences (GGA, RMC, GSA, GSV) to feed the live dashboard.
"""

import math
import os
import queue
import socket
import ssl
import threading
import time
import pynmea2
import serial
import serial.tools.list_ports

DEFAULT_CASTER_HOST = "rtk.prosperinfotech.com"
DEFAULT_CASTER_PORT = 443
DEFAULT_MOUNTPOINT = "SARVESHWAR-CFS-BASE01"
DEFAULT_SOURCE_PASSWORD = os.environ.get(
    "NTRIP_SOURCE_PASSWORD",
    "1626e00b933feef1e11a6aa7b572d352e866e1187df79146"
)

class GNSSReader:
    def __init__(self, port="COM6", baudrate=115200, enable_azure_caster=True):
        self.port = port
        self.baudrate = baudrate
        self.enable_azure_caster = enable_azure_caster
        self.serial_conn = None
        self.is_running = False
        self.reader_thread = None
        self.caster_thread = None
        self.last_update_time = 0
        self.packets_received = 0
        self.caster_queue = queue.Queue(maxsize=200)

        # Telemetry State
        self.state = {
            "connected": False,
            "port": port,
            "baudrate": baudrate,
            "device_name": "u-blox GNSS / RTK Receiver",
            "is_hardware": True,
            "latitude": None,
            "longitude": None,
            "altitude": None,
            "speed_knots": 0.0,
            "heading": 0.0,
            "fix_quality": 0,
            "fix_status_text": "SEARCHING FOR FIX...",
            "satellites_used": 0,
            "satellites_tracked": 0,
            "hdop": None,
            "pdop": None,
            "vdop": None,
            "horizontal_accuracy_m": None,
            "vertical_accuracy_m": None,
            "last_sentence": "",
            "last_timestamp": "",
            "raw_stream_active": False,
            "azure_caster": {
                "host": DEFAULT_CASTER_HOST,
                "port": DEFAULT_CASTER_PORT,
                "mountpoint": DEFAULT_MOUNTPOINT,
                "connected": False,
                "bytes_sent": 0,
                "status_text": "INITIALIZING"
            },
            "constellations": {
                "GPS": {"tracked": 0, "used": 0},
                "GLONASS": {"tracked": 0, "used": 0},
                "GALILEO": {"tracked": 0, "used": 0},
                "BEIDOU": {"tracked": 0, "used": 0}
            },
            "satellites_list": []
        }

        self.satellites_db = {}
        self.lock = threading.Lock()

    @staticmethod
    def list_available_ports():
        """List all detected system COM ports with descriptions and VID/PID"""
        ports_info = []
        for p in serial.tools.list_ports.comports():
            is_ublox = (p.vid == 0x1546) or ("u-blox" in (p.description or "").lower())
            ports_info.append({
                "device": p.device,
                "name": p.name,
                "description": p.description,
                "hwid": p.hwid,
                "vid": hex(p.vid) if p.vid else None,
                "pid": hex(p.pid) if p.pid else None,
                "is_ublox": is_ublox
            })
        return ports_info

    def start(self):
        """Start background serial reader and Azure NTRIP Caster threads"""
        if self.is_running:
            return
        self.is_running = True

        self.reader_thread = threading.Thread(target=self._read_loop, daemon=True)
        self.reader_thread.start()

        if self.enable_azure_caster:
            self.caster_thread = threading.Thread(target=self._caster_uploader_loop, daemon=True)
            self.caster_thread.start()

    def stop(self):
        """Stop threads and close connections"""
        self.is_running = False
        if self.serial_conn and self.serial_conn.is_open:
            try:
                self.serial_conn.close()
            except Exception:
                pass

    def _get_fix_text(self, qual):
        qual_map = {
            0: "NO FIX",
            1: "3D SINGLE GNSS",
            2: "DGPS / DIFFERENTIAL",
            4: "RTK FIXED (HIGH PRECISION)",
            5: "RTK FLOAT",
            6: "DEAD RECKONING"
        }
        return qual_map.get(qual, "FIX ACTIVE")

    def _estimate_accuracy(self, qual, hdop):
        if qual == 4:
            return round(0.006 * max(hdop, 0.5), 3)
        elif qual == 5:
            return round(0.12 * max(hdop, 0.5), 3)
        elif qual == 2:
            return round(0.45 * max(hdop, 0.5), 3)
        else:
            return round(1.8 * max(hdop, 0.5), 3)

    # -------------------------------------------------------------
    # 1. AZURE NTRIP CASTER STREAMING THREAD
    # -------------------------------------------------------------
    def _connect_azure_caster(self):
        """Establish TLS NTRIP 1.0 Source connection to rtk.prosperinfotech.com:443"""
        try:
            raw_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            raw_sock.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
            raw_sock.settimeout(10.0)
            context = ssl.create_default_context()
            sock = context.wrap_socket(raw_sock, server_hostname=DEFAULT_CASTER_HOST)
            sock.connect((DEFAULT_CASTER_HOST, DEFAULT_CASTER_PORT))

            auth_header = (
                f"SOURCE {DEFAULT_SOURCE_PASSWORD} /{DEFAULT_MOUNTPOINT}\r\n"
                f"Source-Agent: NTRIP ProsperBaseServer/2.0\r\n"
                f"STR: \r\n\r\n"
            )
            sock.sendall(auth_header.encode('ascii'))
            resp = sock.recv(1024).decode('ascii', errors='ignore')

            if "ICY 200 OK" in resp or "200 OK" in resp:
                sock.settimeout(None)  # Infinite / non-blocking timeout for continuous live streaming
                print(f"[AZURE CASTER] [OK] Live connection established to {DEFAULT_CASTER_HOST}:{DEFAULT_CASTER_PORT}/{DEFAULT_MOUNTPOINT}")
                return sock
            else:
                first_line = resp.strip().splitlines()[0] if resp else 'Unknown error'
                print(f"[AZURE CASTER ERROR]: {first_line}")
                if "409" in first_line:
                    with self.lock:
                        self.state["azure_caster"]["status_text"] = "WAITING FOR CASTER MOUNTPOINT RELEASE (409)"
                try:
                    sock.close()
                except Exception:
                    pass
                return None
        except Exception as e:
            print(f"[AZURE CASTER] Reconnect attempt failed: {e}")
            return None

    def _caster_uploader_loop(self):
        """Continuously streams raw RTCM3/GNSS packets to Azure NTRIP Caster"""
        sock = None
        total_sent = 0

        while self.is_running:
            try:
                if sock is None:
                    with self.lock:
                        self.state["azure_caster"]["connected"] = False
                        self.state["azure_caster"]["status_text"] = "CONNECTING TO AZURE..."

                    sock = self._connect_azure_caster()
                    if sock is None:
                        time.sleep(5)
                        continue

                    with self.lock:
                        self.state["azure_caster"]["connected"] = True
                        self.state["azure_caster"]["status_text"] = "STREAMING TO AZURE"

                # Wait for next chunk of raw bytes from serial reader
                try:
                    data = self.caster_queue.get(timeout=2.0)
                except queue.Empty:
                    continue

                sock.sendall(data)
                total_sent += len(data)

                with self.lock:
                    self.state["azure_caster"]["bytes_sent"] = total_sent

            except (socket.error, BrokenPipeError, ssl.SSLError) as net_err:
                print(f"[AZURE CASTER] Disconnected: {net_err}. Reconnecting in 3s...")
                with self.lock:
                    self.state["azure_caster"]["connected"] = False
                    self.state["azure_caster"]["status_text"] = "RECONNECTING"
                if sock:
                    try:
                        sock.close()
                    except Exception:
                        pass
                sock = None
                time.sleep(3)
            except Exception as e:
                print(f"[AZURE CASTER ERROR]: {e}")
                time.sleep(3)

        if sock:
            try:
                sock.close()
            except Exception:
                pass

    # -------------------------------------------------------------
    # 2. SERIAL PORT READER & NMEA PARSER
    # -------------------------------------------------------------
    def _read_loop(self):
        """Reads serial port, feeds Azure Caster queue, and parses NMEA for dashboard"""
        line_buffer = bytearray()

        while self.is_running:
            try:
                if not self.serial_conn or not self.serial_conn.is_open:
                    self.serial_conn = serial.Serial(self.port, self.baudrate, timeout=1.5)
                    with self.lock:
                        self.state["connected"] = True
                        self.state["raw_stream_active"] = True
                    print(f"[BASE SERIAL] Connected to Base receiver on {self.port} @ {self.baudrate}")

                # Read available raw bytes from receiver
                raw_chunk = self.serial_conn.read(self.serial_conn.in_waiting or 1)
                if not raw_chunk:
                    time.sleep(0.01)
                    continue

                self.packets_received += 1
                self.last_update_time = time.time()

                # Push raw chunk directly to Azure NTRIP Caster queue
                if self.enable_azure_caster:
                    try:
                        self.caster_queue.put_nowait(raw_chunk)
                    except queue.Full:
                        try:
                            self.caster_queue.get_nowait()
                            self.caster_queue.put_nowait(raw_chunk)
                        except Exception:
                            pass

                # Parse NMEA lines from byte stream
                line_buffer.extend(raw_chunk)
                while b'\n' in line_buffer:
                    idx = line_buffer.index(b'\n')
                    line_bytes = line_buffer[:idx]
                    del line_buffer[:idx + 1]

                    try:
                        raw_line = line_bytes.decode('ascii', errors='ignore').strip()
                        if raw_line.startswith('$'):
                            self._parse_nmea_sentence(raw_line)
                    except Exception:
                        pass

            except serial.SerialException as se:
                print(f"[BASE SERIAL ERROR] Port {self.port} lost: {se}. Retrying in 2s...")
                with self.lock:
                    self.state["connected"] = False
                    self.state["raw_stream_active"] = False
                if self.serial_conn:
                    try:
                        self.serial_conn.close()
                    except Exception:
                        pass
                self.serial_conn = None
                time.sleep(2)
            except Exception as e:
                time.sleep(0.05)

    def _parse_nmea_sentence(self, raw_line):
        with self.lock:
            self.state["last_sentence"] = raw_line
            self.state["raw_stream_active"] = True

        if raw_line.startswith(('$GNGGA', '$GPGGA')):
            try:
                msg = pynmea2.parse(raw_line)
                with self.lock:
                    if msg.latitude and msg.longitude:
                        self.state["latitude"] = float(msg.latitude)
                        self.state["longitude"] = float(msg.longitude)
                    if hasattr(msg, 'altitude') and msg.altitude is not None:
                        try:
                            self.state["altitude"] = float(msg.altitude)
                        except Exception:
                            pass
                    if hasattr(msg, 'num_sats') and msg.num_sats:
                        try:
                            self.state["satellites_used"] = int(msg.num_sats)
                        except Exception:
                            pass
                    if hasattr(msg, 'gps_qual') and msg.gps_qual is not None:
                        try:
                            q = int(msg.gps_qual)
                            self.state["fix_quality"] = q
                            self.state["fix_status_text"] = self._get_fix_text(q)
                        except Exception:
                            pass
                    if hasattr(msg, 'horizontal_dil') and msg.horizontal_dil:
                        try:
                            self.state["hdop"] = float(msg.horizontal_dil)
                        except Exception:
                            pass

                    self.state["horizontal_accuracy_m"] = self._estimate_accuracy(
                        self.state["fix_quality"], self.state["hdop"]
                    )
                    self.state["vertical_accuracy_m"] = round(self.state["horizontal_accuracy_m"] * 1.8, 3)
                    self.state["last_timestamp"] = str(getattr(msg, 'timestamp', ''))
            except Exception:
                pass

        elif raw_line.startswith(('$GNRMC', '$GPRMC')):
            try:
                msg = pynmea2.parse(raw_line)
                with self.lock:
                    if hasattr(msg, 'spd_over_grnd') and msg.spd_over_grnd is not None:
                        try:
                            self.state["speed_knots"] = float(msg.spd_over_grnd)
                        except Exception:
                            pass
                    if hasattr(msg, 'true_course') and msg.true_course is not None:
                        try:
                            self.state["heading"] = float(msg.true_course)
                        except Exception:
                            pass
            except Exception:
                pass

        elif raw_line.startswith(('$GNGSA', '$GPGSA')):
            try:
                msg = pynmea2.parse(raw_line)
                with self.lock:
                    if hasattr(msg, 'pdop') and msg.pdop:
                        try:
                            self.state["pdop"] = float(msg.pdop)
                        except Exception:
                            pass
                    if hasattr(msg, 'vdop') and msg.vdop:
                        try:
                            self.state["vdop"] = float(msg.vdop)
                        except Exception:
                            pass
            except Exception:
                pass

        elif any(raw_line.startswith(p) for p in ('$GPGSV', '$GLGSV', '$GAGSV', '$GBGSV')):
            try:
                talker = raw_line[1:3]
                sys_name = {"GP": "GPS", "GL": "GLONASS", "GA": "GALILEO", "GB": "BEIDOU"}.get(talker, "GNSS")
                parts = raw_line.split('*')[0].split(',')
                if len(parts) >= 4:
                    try:
                        total_sats = int(parts[3])
                        with self.lock:
                            self.state["constellations"][sys_name]["tracked"] = total_sats
                    except Exception:
                        pass

                    idx = 4
                    while idx + 3 < len(parts):
                        prn_str = parts[idx].strip()
                        el_str = parts[idx+1].strip()
                        az_str = parts[idx+2].strip()
                        snr_str = parts[idx+3].strip()
                        idx += 4

                        if prn_str:
                            try:
                                prn = f"{talker[1]}{prn_str.zfill(2)}"
                                snr = int(snr_str) if snr_str and snr_str.isdigit() else 0
                                el = int(el_str) if el_str and el_str.isdigit() else 0
                                az = int(az_str) if az_str and az_str.isdigit() else 0

                                self.satellites_db[prn] = {
                                    "prn": prn,
                                    "system": sys_name,
                                    "snr": snr,
                                    "elevation": el,
                                    "azimuth": az,
                                    "status": "USED" if snr > 35 else "TRACKED",
                                    "updated": time.time()
                                }
                            except Exception:
                                pass
            except Exception:
                pass

    def get_snapshot(self):
        """Return a clean copy of the live telemetry state"""
        now = time.time()
        with self.lock:
            # Active sats
            active_sats = [s for s in self.satellites_db.values() if (now - s["updated"]) < 10.0]
            self.state["satellites_list"] = sorted(active_sats, key=lambda x: x["snr"], reverse=True)
            self.state["satellites_tracked"] = len(active_sats)
            self.state["packets_received"] = self.packets_received
            return dict(self.state)
