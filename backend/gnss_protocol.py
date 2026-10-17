"""Low-level GNSS stream separation and u-blox navigation decoding.

The ZED-F9P USB stream may contain NMEA, UBX and RTCM3 simultaneously.  This
module separates complete frames and validates checksums/CRC before any RTCM is
published to the caster or injected into a Rover receiver.
"""
from __future__ import annotations

import struct
from dataclasses import dataclass
from typing import Optional

CRC24Q_POLY = 0x1864CFB


def crc24q(data: bytes) -> int:
    crc = 0
    for byte in data:
        crc ^= byte << 16
        for _ in range(8):
            crc <<= 1
            if crc & 0x1000000:
                crc ^= CRC24Q_POLY
    return crc & 0xFFFFFF


def validate_rtcm3(frame: bytes) -> bool:
    if len(frame) < 6 or frame[0] != 0xD3:
        return False
    payload_len = ((frame[1] & 0x03) << 8) | frame[2]
    if len(frame) != payload_len + 6:
        return False
    expected = int.from_bytes(frame[-3:], "big")
    return crc24q(frame[:-3]) == expected


def rtcm_message_type(frame: bytes) -> Optional[int]:
    if not validate_rtcm3(frame) or len(frame) < 8:
        return None
    return (frame[3] << 4) | (frame[4] >> 4)


def validate_ubx(frame: bytes) -> bool:
    if len(frame) < 8 or frame[:2] != b"\xB5\x62":
        return False
    payload_len = frame[4] | (frame[5] << 8)
    if len(frame) != payload_len + 8:
        return False
    ck_a = ck_b = 0
    for byte in frame[2:-2]:
        ck_a = (ck_a + byte) & 0xFF
        ck_b = (ck_b + ck_a) & 0xFF
    return frame[-2] == ck_a and frame[-1] == ck_b


@dataclass(frozen=True)
class StreamEvent:
    kind: str  # nmea | ubx | rtcm
    data: bytes


class GNSSStreamDecoder:
    """Incrementally separates NMEA lines, UBX frames and RTCM3 frames."""

    def __init__(self, max_buffer: int = 262144):
        self.buffer = bytearray()
        self.max_buffer = max_buffer

    def feed(self, data: bytes) -> list[StreamEvent]:
        if data:
            self.buffer.extend(data)
        if len(self.buffer) > self.max_buffer:
            del self.buffer[: len(self.buffer) - self.max_buffer]

        events: list[StreamEvent] = []
        while self.buffer:
            if self.buffer[0] == 0x24:  # '$' NMEA
                newline = self.buffer.find(b"\n")
                if newline < 0:
                    break
                line = bytes(self.buffer[: newline + 1])
                del self.buffer[: newline + 1]
                events.append(StreamEvent("nmea", line))
                continue

            if len(self.buffer) >= 2 and self.buffer[:2] == b"\xB5\x62":
                if len(self.buffer) < 6:
                    break
                payload_len = self.buffer[4] | (self.buffer[5] << 8)
                total = payload_len + 8
                if len(self.buffer) < total:
                    break
                frame = bytes(self.buffer[:total])
                del self.buffer[:total]
                if validate_ubx(frame):
                    events.append(StreamEvent("ubx", frame))
                continue

            if self.buffer[0] == 0xD3:
                if len(self.buffer) < 3:
                    break
                payload_len = ((self.buffer[1] & 0x03) << 8) | self.buffer[2]
                total = payload_len + 6
                if len(self.buffer) < total:
                    break
                frame = bytes(self.buffer[:total])
                del self.buffer[:total]
                if validate_rtcm3(frame):
                    events.append(StreamEvent("rtcm", frame))
                continue

            # Skip noise until a possible protocol marker.
            candidates: list[int] = []
            for marker in (b"$", b"\xB5\x62", b"\xD3"):
                idx = self.buffer.find(marker, 1)
                if idx >= 0:
                    candidates.append(idx)
            if not candidates:
                self.buffer[:] = self.buffer[-1:] if self.buffer[-1] == 0xB5 else b""
                break
            del self.buffer[: min(candidates)]

        return events


def _payload(frame: bytes) -> bytes:
    payload_len = frame[4] | (frame[5] << 8)
    return frame[6 : 6 + payload_len]


def parse_ubx_nav_pvt(frame: bytes) -> Optional[dict]:
    """Decode UBX-NAV-PVT using receiver-provided accuracy/speed/heading."""
    if not validate_ubx(frame) or frame[2] != 0x01 or frame[3] != 0x07:
        return None
    p = _payload(frame)
    if len(p) < 92:
        return None

    fix_type = p[20]
    flags = p[21]
    num_sv = p[23]
    carr_soln = (flags >> 6) & 0x03
    differential = bool(flags & 0x02)
    gnss_fix_ok = bool(flags & 0x01)

    return {
        "fix_type": fix_type,
        "fix_type_text": {
            0: "NO FIX",
            1: "DEAD RECKONING",
            2: "2D FIX",
            3: "3D FIX",
            4: "GNSS + DEAD RECKONING",
            5: "TIME ONLY",
        }.get(fix_type, f"FIX {fix_type}"),
        "gnss_fix_ok": gnss_fix_ok,
        "differential_solution": differential,
        "carrier_solution": carr_soln,
        "carrier_solution_text": {0: "NO RTK", 1: "RTK FLOAT", 2: "RTK FIXED"}.get(carr_soln, "UNKNOWN"),
        "satellites_used": num_sv,
        "longitude": struct.unpack_from("<i", p, 24)[0] * 1e-7,
        "latitude": struct.unpack_from("<i", p, 28)[0] * 1e-7,
        "height_ellipsoid_m": struct.unpack_from("<i", p, 32)[0] / 1000.0,
        "altitude": struct.unpack_from("<i", p, 36)[0] / 1000.0,
        "horizontal_accuracy_m": struct.unpack_from("<I", p, 40)[0] / 1000.0,
        "vertical_accuracy_m": struct.unpack_from("<I", p, 44)[0] / 1000.0,
        "speed_kmh": max(0.0, struct.unpack_from("<i", p, 60)[0] / 1000.0 * 3.6),
        "heading": (struct.unpack_from("<i", p, 64)[0] * 1e-5) % 360.0,
        "pdop": struct.unpack_from("<H", p, 76)[0] * 0.01,
    }


def parse_ubx_nav_hpposllh(frame: bytes) -> Optional[dict]:
    """Decode UBX-NAV-HPPOSLLH with 1e-9 degree and 0.1 mm components."""
    if not validate_ubx(frame) or frame[2] != 0x01 or frame[3] != 0x14:
        return None
    p = _payload(frame)
    if len(p) < 36:
        return None

    return {
        "longitude": struct.unpack_from("<i", p, 8)[0] * 1e-7 + struct.unpack_from("<b", p, 24)[0] * 1e-9,
        "latitude": struct.unpack_from("<i", p, 12)[0] * 1e-7 + struct.unpack_from("<b", p, 25)[0] * 1e-9,
        "height_ellipsoid_m": struct.unpack_from("<i", p, 16)[0] / 1000.0 + struct.unpack_from("<b", p, 26)[0] / 10000.0,
        "altitude": struct.unpack_from("<i", p, 20)[0] / 1000.0 + struct.unpack_from("<b", p, 27)[0] / 10000.0,
        "horizontal_accuracy_m": struct.unpack_from("<I", p, 28)[0] / 10000.0,
        "vertical_accuracy_m": struct.unpack_from("<I", p, 32)[0] / 10000.0,
        "accuracy_source": "UBX-NAV-HPPOSLLH",
    }


def parse_ubx_nav_svin(frame: bytes) -> Optional[dict]:
    """Decode UBX-NAV-SVIN survey-in status."""
    if not validate_ubx(frame) or frame[2] != 0x01 or frame[3] != 0x3B:
        return None
    p = _payload(frame)
    if len(p) < 40:
        return None
    return {
        "survey_duration_s": struct.unpack_from("<I", p, 8)[0],
        "mean_x_m": struct.unpack_from("<i", p, 12)[0] / 100.0 + struct.unpack_from("<b", p, 24)[0] / 10000.0,
        "mean_y_m": struct.unpack_from("<i", p, 16)[0] / 100.0 + struct.unpack_from("<b", p, 25)[0] / 10000.0,
        "mean_z_m": struct.unpack_from("<i", p, 20)[0] / 100.0 + struct.unpack_from("<b", p, 26)[0] / 10000.0,
        "mean_accuracy_m": struct.unpack_from("<I", p, 28)[0] / 10000.0,
        "observations": struct.unpack_from("<I", p, 32)[0],
        "survey_valid": bool(p[36]),
        "survey_active": bool(p[37]),
    }
