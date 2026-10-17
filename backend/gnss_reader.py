"""Production ZED-F9P Base service.

This module combines the strongest parts of the original Prosper RTK core with
the offshore monitoring application:
- explicitly configures the F9P Base (Survey-In or surveyed Fixed coordinates)
- enables the required RTCM3 messages
- decodes NAV-PVT/NAV-HPPOSLLH/NAV-SVIN for real receiver status
- forwards CRC-valid RTCM3 frames only to the central NTRIP caster
- automatically reconnects the serial receiver and the NTRIP publisher
"""
from __future__ import annotations

from datetime import datetime, timezone
import threading
import time
from typing import Any

import pynmea2
import serial
import serial.tools.list_ports

from gnss_protocol import (
    GNSSStreamDecoder,
    parse_ubx_nav_hpposllh,
    parse_ubx_nav_pvt,
    parse_ubx_nav_svin,
    rtcm_message_type,
)
from ntrip import NtripSourceWorker
from settings import env, env_bool, env_float, env_int
from ublox_config import BaseReceiverConfig, configure_base


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class GNSSReader:
    def __init__(
        self,
        port: str,
        baudrate: int = 115200,
        enable_azure_caster: bool = True,
        source_password: str | None = None,
        caster_host: str = "rtk.prosperinfotech.com",
        caster_port: int = 443,
        mountpoint: str = "SARVESHWAR-CFS-BASE01",
        use_tls: bool = True,
    ):
        self.port = port
        self.baudrate = baudrate
        self.enable_azure_caster = enable_azure_caster
        self.source_password = source_password
        self.caster_host = caster_host
        self.caster_port = caster_port
        self.mountpoint = mountpoint
        self.use_tls = use_tls
        if enable_azure_caster and not source_password:
            raise RuntimeError("NTRIP_SOURCE_PASSWORD is required when Base publishing is enabled")

        self._running = threading.Event()
        self._thread: threading.Thread | None = None
        self._serial: serial.Serial | None = None
        self._serial_lock = threading.RLock()
        self._state_lock = threading.RLock()
        self._last_hppos_monotonic = 0.0
        self._decoder = GNSSStreamDecoder()

        self.base_cfg = BaseReceiverConfig(
            mode=(env("BASE_MODE", "survey_in") or "survey_in").lower(),
            measurement_rate_ms=env_int("BASE_MEASUREMENT_RATE_MS", 1000),
            persist_to_bbr=env_bool("GNSS_PERSIST_TO_BBR", True),
            survey_min_duration_s=env_int("BASE_SURVEY_MIN_DURATION_S", 600),
            survey_accuracy_limit_m=env_float("BASE_SURVEY_ACCURACY_LIMIT_M", 0.5),
            reset_survey_on_start=env_bool("BASE_RESET_SURVEY_ON_START", False),
            fixed_latitude_deg=float(env("BASE_FIXED_LATITUDE_DEG")) if env("BASE_FIXED_LATITUDE_DEG") else None,
            fixed_longitude_deg=float(env("BASE_FIXED_LONGITUDE_DEG")) if env("BASE_FIXED_LONGITUDE_DEG") else None,
            fixed_height_ellipsoid_m=float(env("BASE_FIXED_HEIGHT_ELLIPSOID_M")) if env("BASE_FIXED_HEIGHT_ELLIPSOID_M") else None,
            fixed_position_accuracy_m=env_float("BASE_FIXED_POSITION_ACCURACY_M", 0.02),
            ubx_port=env("GNSS_UBX_PORT", "USB") or "USB",
        )

        self.source = (
            NtripSourceWorker(
                caster_host,
                caster_port,
                mountpoint,
                source_password or "",
                use_tls=use_tls,
                reconnect_s=env_float("NTRIP_RECONNECT_S", 5.0),
            )
            if enable_azure_caster
            else None
        )

        self.state: dict[str, Any] = {
            "connected": False,
            "port": port,
            "baudrate": baudrate,
            "device_name": "u-blox ZED-F9P RTK Base",
            "device_role": "BASE",
            "base_mode": self.base_cfg.mode.upper(),
            "configured": False,
            "latitude": None,
            "longitude": None,
            "altitude": None,
            "height_ellipsoid_m": None,
            "horizontal_accuracy_m": None,
            "vertical_accuracy_m": None,
            "accuracy_source": None,
            "speed_kmh": 0.0,
            "heading": 0.0,
            "fix_type": None,
            "fix_type_text": "NO FIX",
            "fix_status_text": "NO FIX",
            "carrier_solution": 0,
            "carrier_solution_text": "NO RTK",
            "differential_solution": False,
            "satellites_used": 0,
            "hdop": None,
            "pdop": None,
            "survey_active": False,
            "survey_valid": False,
            "survey_duration_s": 0,
            "survey_mean_accuracy_m": None,
            "survey_observations": 0,
            "rtcm_frames_seen": 0,
            "rtcm_bytes_seen": 0,
            "rtcm_message_counts": {},
            "last_rtcm_utc": None,
            "last_position_utc": None,
            "last_error": None,
            "reference": {
                "latitude_deg": self.base_cfg.fixed_latitude_deg,
                "longitude_deg": self.base_cfg.fixed_longitude_deg,
                "height_ellipsoid_m": self.base_cfg.fixed_height_ellipsoid_m,
                "configured_accuracy_m": self.base_cfg.fixed_position_accuracy_m if self.base_cfg.mode == "fixed" else None,
            },
        }

    @staticmethod
    def list_available_ports() -> list[dict[str, Any]]:
        ports: list[dict[str, Any]] = []
        for p in serial.tools.list_ports.comports():
            desc = p.description or ""
            hwid = p.hwid or ""
            manufacturer = p.manufacturer or ""
            text = f"{desc} {hwid} {manufacturer}".lower()
            ports.append(
                {
                    "device": p.device,
                    "description": desc,
                    "manufacturer": manufacturer,
                    "hwid": hwid,
                    "is_ublox": "u-blox" in text or "ublox" in text or "vid:pid=1546" in text,
                }
            )
        return ports

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._running.set()
        if self.source:
            self.source.start()
        self._thread = threading.Thread(target=self._serial_loop, name="base-zedf9p", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._running.clear()
        with self._serial_lock:
            if self._serial:
                try:
                    self._serial.close()
                except Exception:
                    pass
                self._serial = None
        if self._thread:
            self._thread.join(timeout=5)
        if self.source:
            self.source.stop()
        self._update(connected=False)

    def get_snapshot(self) -> dict[str, Any]:
        with self._state_lock:
            snap = dict(self.state)
            snap["rtcm_message_counts"] = dict(self.state["rtcm_message_counts"])
            snap["reference"] = dict(self.state["reference"])
        snap["azure_caster"] = self.source.snapshot() if self.source else {
            "connected": False,
            "status_text": "DISABLED",
            "host": self.caster_host,
            "port": self.caster_port,
            "mountpoint": self.mountpoint,
            "bytes_sent": 0,
            "frames_sent": 0,
        }
        return snap

    def _update(self, **kwargs: Any) -> None:
        with self._state_lock:
            self.state.update(kwargs)

    def _serial_loop(self) -> None:
        reconnect_s = env_float("GNSS_RECONNECT_S", 5.0)
        while self._running.is_set():
            try:
                self._open_and_configure()
                self._read_until_error()
            except Exception as exc:
                self._update(connected=False, configured=False, last_error=str(exc))
                with self._serial_lock:
                    if self._serial:
                        try:
                            self._serial.close()
                        except Exception:
                            pass
                        self._serial = None
                if self._running.is_set():
                    time.sleep(reconnect_s)

    def _open_and_configure(self) -> None:
        ser = serial.Serial(self.port, self.baudrate, timeout=0.5, write_timeout=2)
        with self._serial_lock:
            self._serial = ser
        self._decoder = GNSSStreamDecoder()
        self._update(connected=True, last_error=None)
        if env_bool("GNSS_AUTO_CONFIGURE", True):
            configure_base(ser, self.base_cfg)
        self._update(configured=True)

    def _read_until_error(self) -> None:
        assert self._serial is not None
        while self._running.is_set() and self._serial.is_open:
            raw = self._serial.read(self._serial.in_waiting or 1)
            if not raw:
                continue
            for event in self._decoder.feed(raw):
                if event.kind == "rtcm":
                    self._handle_rtcm(event.data)
                elif event.kind == "ubx":
                    self._handle_ubx(event.data)
                elif event.kind == "nmea":
                    self._handle_nmea(event.data)

    def _handle_rtcm(self, frame: bytes) -> None:
        msg_type = rtcm_message_type(frame)
        now = _utc_now()
        with self._state_lock:
            counts = dict(self.state["rtcm_message_counts"])
            if msg_type is not None:
                counts[str(msg_type)] = int(counts.get(str(msg_type), 0)) + 1
            self.state["rtcm_message_counts"] = counts
            self.state["rtcm_frames_seen"] = int(self.state["rtcm_frames_seen"]) + 1
            self.state["rtcm_bytes_seen"] = int(self.state["rtcm_bytes_seen"]) + len(frame)
            self.state["last_rtcm_utc"] = now
        if self.source:
            self.source.submit(frame)

    def _handle_ubx(self, frame: bytes) -> None:
        pvt = parse_ubx_nav_pvt(frame)
        if pvt:
            recent_hp = time.monotonic() - self._last_hppos_monotonic < 2.5
            values = {
                "speed_kmh": pvt["speed_kmh"],
                "heading": pvt["heading"],
                "fix_type": pvt["fix_type"],
                "fix_type_text": pvt["fix_type_text"],
                "fix_status_text": pvt["carrier_solution_text"] if pvt["carrier_solution"] else pvt["fix_type_text"],
                "carrier_solution": pvt["carrier_solution"],
                "carrier_solution_text": pvt["carrier_solution_text"],
                "differential_solution": pvt["differential_solution"],
                "satellites_used": pvt["satellites_used"],
                "pdop": pvt["pdop"],
                "last_position_utc": _utc_now(),
            }
            if not recent_hp:
                values.update(
                    latitude=pvt["latitude"],
                    longitude=pvt["longitude"],
                    altitude=pvt["altitude"],
                    height_ellipsoid_m=pvt["height_ellipsoid_m"],
                    horizontal_accuracy_m=pvt["horizontal_accuracy_m"],
                    vertical_accuracy_m=pvt["vertical_accuracy_m"],
                    accuracy_source="UBX-NAV-PVT",
                )
            self._update(**values)
            return

        hp = parse_ubx_nav_hpposllh(frame)
        if hp:
            self._last_hppos_monotonic = time.monotonic()
            self._update(**hp, last_position_utc=_utc_now())
            return

        svin = parse_ubx_nav_svin(frame)
        if svin:
            self._update(
                survey_active=svin["survey_active"],
                survey_valid=svin["survey_valid"],
                survey_duration_s=svin["survey_duration_s"],
                survey_mean_accuracy_m=svin["mean_accuracy_m"],
                survey_observations=svin["observations"],
            )

    def _handle_nmea(self, data: bytes) -> None:
        # Fallback only; the production accuracy source is UBX NAV-PVT/HPPOSLLH.
        text = data.decode("ascii", errors="ignore").strip()
        try:
            if text.startswith(("$GNGGA", "$GPGGA")):
                msg = pynmea2.parse(text)
                values: dict[str, Any] = {}
                if msg.latitude and msg.longitude and time.monotonic() - self._last_hppos_monotonic >= 2.5:
                    values.update(latitude=float(msg.latitude), longitude=float(msg.longitude), accuracy_source="NMEA-FALLBACK")
                if getattr(msg, "horizontal_dil", None):
                    values["hdop"] = float(msg.horizontal_dil)
                if getattr(msg, "num_sats", None):
                    values["satellites_used"] = int(msg.num_sats)
                if values:
                    self._update(**values)
        except Exception:
            pass
