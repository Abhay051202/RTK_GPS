"""ZED-F9P receiver configuration used by the production Base and Rover.

The configuration logic is derived from the proven Prosper RTK service: the Base
is explicitly put into Survey-In or Fixed mode and the required RTCM3 messages
are enabled; the Rover is explicitly put into normal positioning mode with RTCM3
input and high-precision UBX telemetry enabled.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass

from pyubx2 import UBXMessage, SET_LAYER_BBR, SET_LAYER_RAM, TXN_NONE, val2sphp

LOGGER = logging.getLogger(__name__)

RTCM_TYPES = ("1005", "1077", "1087", "1097", "1127", "1230")


@dataclass(slots=True)
class BaseReceiverConfig:
    mode: str = "survey_in"  # survey_in | fixed
    measurement_rate_ms: int = 1000
    persist_to_bbr: bool = True
    survey_min_duration_s: int = 600
    survey_accuracy_limit_m: float = 0.5
    reset_survey_on_start: bool = False
    fixed_latitude_deg: float | None = None
    fixed_longitude_deg: float | None = None
    fixed_height_ellipsoid_m: float | None = None
    fixed_position_accuracy_m: float = 0.02
    ubx_port: str = "USB"


@dataclass(slots=True)
class RoverReceiverConfig:
    measurement_rate_ms: int = 200
    persist_to_bbr: bool = True
    ubx_port: str = "USB"


def _send(ser, pairs: list[tuple[str, object]], persist: bool) -> None:
    layers = SET_LAYER_RAM | (SET_LAYER_BBR if persist else 0)
    msg = UBXMessage.config_set(layers, TXN_NONE, pairs)
    ser.write(msg.serialize())
    ser.flush()
    time.sleep(0.15)


def configure_base(ser, cfg: BaseReceiverConfig) -> None:
    if cfg.mode not in {"survey_in", "fixed"}:
        raise ValueError("BASE_MODE must be survey_in or fixed")
    port = cfg.ubx_port.upper()
    if port not in {"USB", "UART1", "UART2"}:
        raise ValueError("GNSS_UBX_PORT must be USB, UART1 or UART2")

    _send(
        ser,
        [
            ("CFG_RATE_MEAS", cfg.measurement_rate_ms),
            ("CFG_RATE_NAV", 1),
            (f"CFG_{port}INPROT_UBX", 1),
            (f"CFG_{port}INPROT_RTCM3X", 1),
            (f"CFG_{port}OUTPROT_UBX", 1),
            (f"CFG_{port}OUTPROT_RTCM3X", 1),
        ],
        cfg.persist_to_bbr,
    )

    pairs: list[tuple[str, object]] = [
        (f"CFG_MSGOUT_UBX_NAV_PVT_{port}", 1),
        (f"CFG_MSGOUT_UBX_NAV_HPPOSLLH_{port}", 1),
        (f"CFG_MSGOUT_UBX_NAV_SVIN_{port}", 1),
    ]
    for msg_type in RTCM_TYPES:
        pairs.append((f"CFG_MSGOUT_RTCM_3X_TYPE{msg_type}_{port}", 1))
    _send(ser, pairs, cfg.persist_to_bbr)

    if cfg.mode == "survey_in":
        if cfg.reset_survey_on_start:
            _send(ser, [("CFG_TMODE_MODE", 0)], cfg.persist_to_bbr)
            time.sleep(0.5)
        _send(
            ser,
            [
                ("CFG_TMODE_MODE", 1),
                ("CFG_TMODE_SVIN_MIN_DUR", int(cfg.survey_min_duration_s)),
                ("CFG_TMODE_SVIN_ACC_LIMIT", int(round(cfg.survey_accuracy_limit_m * 10000.0))),
            ],
            cfg.persist_to_bbr,
        )
        LOGGER.info(
            "ZED-F9P Base configured for Survey-In: min=%ss, accuracy_limit=%.3fm",
            cfg.survey_min_duration_s,
            cfg.survey_accuracy_limit_m,
        )
        return

    if None in (cfg.fixed_latitude_deg, cfg.fixed_longitude_deg, cfg.fixed_height_ellipsoid_m):
        raise ValueError("Fixed Base mode requires latitude, longitude and ellipsoid height")

    lat, lat_hp = val2sphp(float(cfg.fixed_latitude_deg))
    lon, lon_hp = val2sphp(float(cfg.fixed_longitude_deg))
    height_cm_float = float(cfg.fixed_height_ellipsoid_m) * 100.0
    height_cm = int(height_cm_float)
    height_hp = int(round((height_cm_float - height_cm) * 100.0))  # 0.1 mm units

    _send(
        ser,
        [
            ("CFG_TMODE_MODE", 2),
            ("CFG_TMODE_POS_TYPE", 1),  # LLH
            ("CFG_TMODE_FIXED_POS_ACC", int(round(cfg.fixed_position_accuracy_m * 10000.0))),
            ("CFG_TMODE_LAT", lat),
            ("CFG_TMODE_LAT_HP", lat_hp),
            ("CFG_TMODE_LON", lon),
            ("CFG_TMODE_LON_HP", lon_hp),
            ("CFG_TMODE_HEIGHT", height_cm),
            ("CFG_TMODE_HEIGHT_HP", height_hp),
        ],
        cfg.persist_to_bbr,
    )
    LOGGER.info(
        "ZED-F9P Base configured for FIXED reference coordinates: %.9f, %.9f, h=%.4fm",
        cfg.fixed_latitude_deg,
        cfg.fixed_longitude_deg,
        cfg.fixed_height_ellipsoid_m,
    )


def configure_rover(ser, cfg: RoverReceiverConfig) -> None:
    port = cfg.ubx_port.upper()
    if port not in {"USB", "UART1", "UART2"}:
        raise ValueError("GNSS_UBX_PORT must be USB, UART1 or UART2")

    _send(
        ser,
        [
            ("CFG_RATE_MEAS", cfg.measurement_rate_ms),
            ("CFG_RATE_NAV", 1),
            ("CFG_TMODE_MODE", 0),
            (f"CFG_{port}INPROT_UBX", 1),
            (f"CFG_{port}INPROT_RTCM3X", 1),
            (f"CFG_{port}OUTPROT_UBX", 1),
            (f"CFG_MSGOUT_UBX_NAV_PVT_{port}", 1),
            (f"CFG_MSGOUT_UBX_NAV_HPPOSLLH_{port}", 1),
        ],
        cfg.persist_to_bbr,
    )
    LOGGER.info("ZED-F9P Rover configured for RTCM3 input and high-precision UBX output")
