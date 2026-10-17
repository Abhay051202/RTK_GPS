"""Prosper RTK Reach Stacker Rover agent (Production v4.0).

Run one instance on each Reach Stacker AI EdgeBox.  The agent:
- configures the local ZED-F9P as a Rover;
- receives TLS NTRIP RTCM3 from the central Azure caster;
- injects only CRC-valid RTCM3 into the receiver;
- decodes NAV-PVT and NAV-HPPOSLLH for actual receiver position/accuracy;
- exposes a local REST API for the AI application (default port 8081);
- posts dashboard telemetry to the dedicated Base/control-center computer.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import os
import signal
import sys
import threading
import time
from typing import Any

from fastapi import FastAPI
import httpx
import pynmea2
import serial
import serial.tools.list_ports
import uvicorn

from gnss_protocol import GNSSStreamDecoder, parse_ubx_nav_hpposllh, parse_ubx_nav_pvt
from ntrip import NtripRoverWorker
from settings import CASTER_HOST, CASTER_PORT, GNSS_BAUD, MOUNTPOINT, NTRIP_TLS, env, env_bool, env_float, env_int
from ublox_config import RoverReceiverConfig, configure_rover


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def detect_ublox_port(default: str | None = None) -> str:
    explicit = env("GNSS_PORT")
    if explicit:
        return explicit
    for p in serial.tools.list_ports.comports():
        text = f"{p.description or ''} {p.hwid or ''} {p.manufacturer or ''}".lower()
        if "u-blox" in text or "ublox" in text or "vid:pid=1546" in text:
            return p.device
    if default:
        return default
    return "COM3" if os.name == "nt" else "/dev/ttyACM0"


class TelemetrySender:
    def __init__(self, dashboard_url: str, api_token: str | None):
        self.url = dashboard_url.rstrip("/") + "/api/rover/telemetry"
        self.api_token = api_token
        self.client = httpx.Client(timeout=2.5)
        self.last_error: str | None = None

    def send(self, payload: dict) -> bool:
        headers = {"X-API-Key": self.api_token} if self.api_token else {}
        try:
            response = self.client.post(self.url, json=payload, headers=headers)
            response.raise_for_status()
            self.last_error = None
            return True
        except Exception as exc:
            self.last_error = str(exc)
            return False

    def close(self) -> None:
        self.client.close()


class LocalRoverApi:
    """Local read-only API for ContainerVision/EdgeBox integration."""

    def __init__(self, snapshot_fn, host: str, port: int):
        self.snapshot_fn = snapshot_fn
        self.host = host
        self.port = port
        self.app = FastAPI(title="Prosper RTK Rover Local API", version="4.0.0")
        self.server: uvicorn.Server | None = None
        self.thread: threading.Thread | None = None

        @self.app.get("/health/live")
        def live():
            return {"status": "ok"}

        @self.app.get("/health/ready")
        def ready():
            snap = self.snapshot_fn()
            return {
                "status": "ready" if snap.get("serial_connected") else "not_ready",
                "serial_connected": snap.get("serial_connected"),
                "ntrip_connected": snap.get("ntrip_connected"),
                "precision_ready": snap.get("precision_ready"),
            }

        @self.app.get("/api/v1/position")
        def position():
            return self.snapshot_fn()

        @self.app.get("/api/v1/status")
        def status():
            return self.snapshot_fn()

    def start(self) -> None:
        config = uvicorn.Config(self.app, host=self.host, port=self.port, log_level="warning", access_log=False)
        self.server = uvicorn.Server(config)
        self.thread = threading.Thread(target=self.server.run, name="rover-local-api", daemon=True)
        self.thread.start()

    def stop(self) -> None:
        if self.server:
            self.server.should_exit = True
        if self.thread:
            self.thread.join(timeout=3)


def run(args: argparse.Namespace) -> int:
    machine = (args.machine or env("RTK_DEVICE_ID") or env("NTRIP_ROVER_USERNAME") or "RS-01").upper().strip()
    username = env("NTRIP_ROVER_USERNAME", machine) or machine
    password = args.password or env("NTRIP_ROVER_PASSWORD")
    if not password:
        raise RuntimeError("NTRIP_ROVER_PASSWORD is required; do not store the password in source code")

    port = args.port or detect_ublox_port()
    baud = args.baud or GNSS_BAUD
    dashboard_url = args.dashboard_url or env("TELEMETRY_URL", "http://127.0.0.1:8000") or "http://127.0.0.1:8000"
    telemetry_token = env("TELEMETRY_API_TOKEN")
    max_age = env_float("PRECISION_MAX_CORRECTION_AGE_S", 5.0)
    max_hacc = env_float("PRECISION_MAX_HACC_M", 0.05)

    print("=" * 76)
    print(" PROSPER RTK REACH STACKER ROVER - Production v4.0")
    print("=" * 76)
    print(f" Device ID      : {machine}")
    print(f" GNSS Port      : {port} @ {baud}")
    print(f" NTRIP Caster   : {args.caster}:{args.caster_port}/{args.mountpoint} (TLS={args.tls})")
    print(f" NTRIP User     : {username}")
    print(f" Dashboard      : {dashboard_url}")
    print(f" Local RTK API  : http://{args.api_host}:{args.api_port}/api/v1/position")
    print(f" Precision gate : hAcc <= {max_hacc:.3f}m, correction age <= {max_age:.1f}s, RTK FIXED")
    print("=" * 76)

    ser = serial.Serial(port, baud, timeout=0.25, write_timeout=2)
    if env_bool("GNSS_AUTO_CONFIGURE", True):
        configure_rover(
            ser,
            RoverReceiverConfig(
                measurement_rate_ms=env_int("ROVER_MEASUREMENT_RATE_MS", 200),
                persist_to_bbr=env_bool("GNSS_PERSIST_TO_BBR", True),
                ubx_port=env("GNSS_UBX_PORT", "USB") or "USB",
            ),
        )

    serial_write_lock = threading.RLock()
    state_lock = threading.RLock()

    def inject_rtcm(frame: bytes) -> None:
        with serial_write_lock:
            ser.write(frame)
            ser.flush()

    ntrip = NtripRoverWorker(
        args.caster,
        args.caster_port,
        args.mountpoint,
        username,
        password,
        inject_rtcm,
        use_tls=args.tls,
        reconnect_s=env_float("NTRIP_RECONNECT_S", 5.0),
    )
    ntrip.start()

    sender = TelemetrySender(dashboard_url, telemetry_token)
    decoder = GNSSStreamDecoder()
    stop_event = threading.Event()
    last_hppos = 0.0
    last_send = 0.0

    state: dict[str, Any] = {
        "service": "prosper-rtk-rover",
        "version": "4.0.0",
        "device_role": "ROVER",
        "device_id": machine,
        "serial_connected": True,
        "gnss_port": port,
        "latitude": None,
        "longitude": None,
        "altitude": None,
        "height_ellipsoid_m": None,
        "speed_kmh": 0.0,
        "heading": 0.0,
        "battery_percent": None,
        "fix_quality": 0,
        "fix_status_text": "NO FIX",
        "fix_type": None,
        "fix_type_text": "NO FIX",
        "satellites_used": 0,
        "hdop": None,
        "pdop": None,
        "horizontal_accuracy_m": None,
        "vertical_accuracy_m": None,
        "accuracy_source": None,
        "carrier_solution": 0,
        "carrier_solution_text": "NO RTK",
        "differential_solution": False,
        "last_position_utc": None,
    }

    def update_state(**kwargs: Any) -> None:
        with state_lock:
            state.update(kwargs)

    def snapshot() -> dict[str, Any]:
        with state_lock:
            snap = dict(state)
        ns = ntrip.snapshot()
        hacc = snap.get("horizontal_accuracy_m")
        corr_age = ns.get("correction_age_s")
        precision_ready = bool(
            snap.get("carrier_solution") == 2
            and ns.get("connected")
            and isinstance(corr_age, (int, float)) and corr_age <= max_age
            and isinstance(hacc, (int, float)) and hacc <= max_hacc
        )
        reasons: list[str] = []
        if snap.get("carrier_solution") != 2:
            reasons.append("RTK_NOT_FIXED")
        if not ns.get("connected"):
            reasons.append("NTRIP_DOWN")
        if not isinstance(corr_age, (int, float)) or corr_age > max_age:
            reasons.append("CORRECTION_STALE")
        if not isinstance(hacc, (int, float)) or hacc > max_hacc:
            reasons.append("HACC_HIGH")
        snap.update(
            ntrip_connected=ns.get("connected"),
            ntrip_status_text=ns.get("status_text"),
            ntrip_last_error=ns.get("last_error"),
            rtcm_bytes_injected=ns.get("bytes_received", 0),
            rtcm_frames_injected=ns.get("frames_received", 0),
            correction_age_s=corr_age,
            last_rtcm_utc=ns.get("last_rtcm_utc"),
            precision_ready=precision_ready,
            precision_block_reason=",".join(reasons) if reasons else None,
            # Backward-compatible names from prosper_rtk_services_v1.2
            latitude_deg=snap.get("latitude"),
            longitude_deg=snap.get("longitude"),
            height_msl_m=snap.get("altitude"),
            num_satellites=snap.get("satellites_used"),
            ground_speed_mps=(snap.get("speed_kmh", 0.0) / 3.6) if isinstance(snap.get("speed_kmh"), (int, float)) else None,
            heading_deg=snap.get("heading"),
        )
        return snap

    local_api = None
    if env_bool("ROVER_API_ENABLED", True):
        local_api = LocalRoverApi(snapshot, args.api_host, args.api_port)
        local_api.start()

    def request_stop(_signum=None, _frame=None):
        stop_event.set()

    if threading.current_thread() is threading.main_thread():
        signal.signal(signal.SIGINT, request_stop)
        signal.signal(signal.SIGTERM, request_stop)

    try:
        while not stop_event.is_set():
            raw = ser.read(ser.in_waiting or 1)
            if raw:
                for event in decoder.feed(raw):
                    if event.kind == "ubx":
                        pvt = parse_ubx_nav_pvt(event.data)
                        if pvt:
                            recent_hp = time.monotonic() - last_hppos < 1.0
                            values: dict[str, Any] = {
                                "speed_kmh": pvt["speed_kmh"],
                                "heading": pvt["heading"],
                                "fix_type": pvt["fix_type"],
                                "fix_type_text": pvt["fix_type_text"],
                                "satellites_used": pvt["satellites_used"],
                                "pdop": pvt["pdop"],
                                "carrier_solution": pvt["carrier_solution"],
                                "carrier_solution_text": pvt["carrier_solution_text"],
                                "differential_solution": pvt["differential_solution"],
                                "last_position_utc": _utc_now(),
                            }
                            if pvt["carrier_solution"] == 2:
                                values.update(fix_quality=4, fix_status_text="RTK FIXED")
                            elif pvt["carrier_solution"] == 1:
                                values.update(fix_quality=5, fix_status_text="RTK FLOAT")
                            elif pvt["differential_solution"]:
                                values.update(fix_quality=2, fix_status_text="DGPS / DIFFERENTIAL")
                            elif pvt["gnss_fix_ok"] and pvt["fix_type"] >= 2:
                                values.update(fix_quality=1, fix_status_text=pvt["fix_type_text"])
                            else:
                                values.update(fix_quality=0, fix_status_text="NO FIX")
                            if not recent_hp:
                                values.update(
                                    latitude=pvt["latitude"], longitude=pvt["longitude"],
                                    altitude=pvt["altitude"], height_ellipsoid_m=pvt["height_ellipsoid_m"],
                                    horizontal_accuracy_m=pvt["horizontal_accuracy_m"],
                                    vertical_accuracy_m=pvt["vertical_accuracy_m"], accuracy_source="UBX-NAV-PVT",
                                )
                            update_state(**values)
                            continue

                        hp = parse_ubx_nav_hpposllh(event.data)
                        if hp:
                            last_hppos = time.monotonic()
                            update_state(**hp, last_position_utc=_utc_now())

                    elif event.kind == "nmea":
                        text = event.data.decode("ascii", errors="ignore").strip()
                        try:
                            if text.startswith(("$GNGGA", "$GPGGA")):
                                msg = pynmea2.parse(text)
                                values = {}
                                if getattr(msg, "horizontal_dil", None):
                                    values["hdop"] = float(msg.horizontal_dil)
                                if getattr(msg, "num_sats", None):
                                    values["satellites_used"] = int(msg.num_sats)
                                if values:
                                    update_state(**values)
                            elif text.startswith(("$GNRMC", "$GPRMC")):
                                msg = pynmea2.parse(text)
                                values = {}
                                if getattr(msg, "spd_over_grnd", None) is not None:
                                    values["speed_kmh"] = float(msg.spd_over_grnd) * 1.852
                                if getattr(msg, "true_course", None) is not None:
                                    values["heading"] = float(msg.true_course)
                                if values:
                                    update_state(**values)
                        except Exception:
                            pass

            now = time.monotonic()
            current = snapshot()
            if current["latitude"] is not None and current["longitude"] is not None and now - last_send >= args.telemetry_interval:
                dashboard_ok = sender.send(current)
                last_send = now
                hacc = current["horizontal_accuracy_m"]
                hacc_text = f"{hacc * 100:.1f} cm" if isinstance(hacc, (int, float)) and hacc < 1 else (f"{hacc:.2f} m" if isinstance(hacc, (int, float)) else "n/a")
                corr_age = current["correction_age_s"]
                age_text = f"{corr_age:.1f}s" if isinstance(corr_age, (int, float)) else "n/a"
                print(
                    f"\r[{machine}] {current['fix_status_text']:<18} | "
                    f"Lat {current['latitude']:.8f} Lng {current['longitude']:.8f} | "
                    f"hAcc {hacc_text:<9} | RTCM {current['rtcm_frames_injected']} age {age_text:<6} | "
                    f"Precision {'READY' if current['precision_ready'] else 'BLOCKED'} | "
                    f"Dashboard {'UP' if dashboard_ok else 'DOWN'}   ",
                    end="", flush=True,
                )
            time.sleep(0.003)
    except (serial.SerialException, OSError) as exc:
        update_state(serial_connected=False)
        print(f"\n[SERIAL ERROR] {exc}")
        return 2
    finally:
        print("\n[ROVER] Stopping...")
        if local_api:
            local_api.stop()
        ntrip.stop()
        sender.close()
        try:
            ser.close()
        except Exception:
            pass
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Prosper RTK Reach Stacker Rover agent")
    parser.add_argument("--machine", default=None, help="Reach Stacker ID, e.g. RS-01")
    parser.add_argument("--port", default=None, help="ZED-F9P serial device; use /dev/serial/by-id/... in production")
    parser.add_argument("--baud", type=int, default=None)
    parser.add_argument("--caster", default=CASTER_HOST)
    parser.add_argument("--caster-port", type=int, default=CASTER_PORT)
    parser.add_argument("--mountpoint", default=MOUNTPOINT)
    parser.add_argument("--password", default=None, help="Prefer NTRIP_ROVER_PASSWORD environment variable")
    parser.add_argument("--dashboard-url", default=None)
    parser.add_argument("--telemetry-interval", type=float, default=0.5)
    parser.add_argument("--api-host", default=env("ROVER_API_HOST", "127.0.0.1"))
    parser.add_argument("--api-port", type=int, default=env_int("ROVER_API_PORT", 8081))
    parser.add_argument("--no-tls", action="store_true")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    args.tls = NTRIP_TLS and not args.no_tls
    try:
        return run(args)
    except Exception as exc:
        print(f"[FATAL] {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
