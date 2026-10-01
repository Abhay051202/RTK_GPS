"""
Real-time GNSS Serial Reader for u-blox RTK Base Station
Connects to hardware USB COM port (COM3), parses NMEA sentences (GGA, RMC, GSA, GSV),
and maintains a live telemetry state for the command center.
"""

import threading
import time
import serial
import serial.tools.list_ports
import pynmea2
import math

class GNSSReader:
    def __init__(self, port="COM3", baudrate=115200):
        self.port = port
        self.baudrate = baudrate
        self.serial_conn = None
        self.is_running = False
        self.thread = None
        self.last_update_time = 0
        self.packets_received = 0
        
        # Telemetry State
        self.state = {
            "connected": False,
            "port": port,
            "baudrate": baudrate,
            "device_name": "u-blox GNSS / RTK Receiver",
            "is_hardware": True,
            "latitude": 18.9038968,
            "longitude": 73.0468027,
            "altitude": 17.5,
            "speed_knots": 0.0,
            "heading": 0.0,
            "fix_quality": 2, # 1=Single, 2=DGPS, 4=RTK Fixed, 5=RTK Float
            "fix_status_text": "DGPS / RTK FLOAT",
            "satellites_used": 12,
            "satellites_tracked": 28,
            "hdop": 0.57,
            "pdop": 1.12,
            "vdop": 0.89,
            "horizontal_accuracy_m": 0.045, # estimated based on quality & HDOP
            "vertical_accuracy_m": 0.085,
            "last_sentence": "",
            "last_timestamp": "",
            "raw_stream_active": False,
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
        """Start background reader thread"""
        if self.is_running:
            return
        self.is_running = True
        self.thread = threading.Thread(target=self._read_loop, daemon=True)
        self.thread.start()

    def stop(self):
        """Stop reader thread and close serial connection"""
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
        if qual == 4: # RTK Fixed
            return round(0.006 * max(hdop, 0.5), 3) # ~6-10 mm
        elif qual == 5: # RTK Float
            return round(0.12 * max(hdop, 0.5), 3) # ~10-30 cm
        elif qual == 2: # DGPS
            return round(0.45 * max(hdop, 0.5), 3) # ~30-60 cm
        else: # Single
            return round(1.8 * max(hdop, 0.5), 3)

    def _read_loop(self):
        """Continuous serial read loop with automatic reconnection"""
        while self.is_running:
            try:
                if not self.serial_conn or not self.serial_conn.is_open:
                    self.serial_conn = serial.Serial(self.port, self.baudrate, timeout=1.5)
                    with self.lock:
                        self.state["connected"] = True
                        self.state["raw_stream_active"] = True

                raw_line = self.serial_conn.readline().decode('ascii', errors='replace').strip()
                if not raw_line:
                    continue

                self.packets_received += 1
                self.last_update_time = time.time()

                with self.lock:
                    self.state["last_sentence"] = raw_line
                    self.state["raw_stream_active"] = True

                # Parse NMEA sentences
                if raw_line.startswith('$GNGGA') or raw_line.startswith('$GPGGA'):
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

                elif raw_line.startswith('$GNRMC') or raw_line.startswith('$GPRMC'):
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

                elif raw_line.startswith('$GNGSA') or raw_line.startswith('$GPGSA'):
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

                # Parse GSV for constellation and satellite SNR
                elif any(raw_line.startswith(prefix) for prefix in ['$GPGSV', '$GLGSV', '$GAGSV', '$GBGSV']):
                    try:
                        talker = raw_line[1:3]
                        sys_name = {
                            "GP": "GPS",
                            "GL": "GLONASS",
                            "GA": "GALILEO",
                            "GB": "BEIDOU"
                        }.get(talker, "GNSS")

                        parts = raw_line.split('*')[0].split(',')
                        # Format: $xxGSV, total_msgs, msg_num, total_sats, [prn, el, az, snr] * 4
                        if len(parts) >= 4:
                            try:
                                total_sats = int(parts[3])
                                with self.lock:
                                    self.state["constellations"][sys_name]["tracked"] = total_sats
                            except Exception:
                                pass

                            # Extract up to 4 satellite entries per GSV sentence
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

                            # Prune older satellites and update state
                            now = time.time()
                            fresh_sats = [s for s in self.satellites_db.values() if (now - s["updated"]) < 12]
                            fresh_sats.sort(key=lambda s: s["snr"], reverse=True)
                            with self.lock:
                                self.state["satellites_list"] = fresh_sats[:16]
                                self.state["satellites_tracked"] = len(fresh_sats)
                    except Exception:
                        pass

            except Exception as e:
                with self.lock:
                    self.state["connected"] = False
                    self.state["raw_stream_active"] = False
                if self.serial_conn:
                    try:
                        self.serial_conn.close()
                    except Exception:
                        pass
                self.serial_conn = None
                time.sleep(2.0)

    def get_snapshot(self):
        """Thread-safe snapshot of telemetry"""
        with self.lock:
            snap = dict(self.state)
            snap["packets_received"] = self.packets_received
            snap["uptime_seconds"] = int(time.time() - self.last_update_time) if self.last_update_time else 0
            return snap
