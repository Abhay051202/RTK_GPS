"""ZED-F9P serial smoke test showing UBX high-precision state and RTCM frames."""
from __future__ import annotations
import os
import sys
import time

import serial
import serial.tools.list_ports

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))
from gnss_protocol import GNSSStreamDecoder, parse_ubx_nav_hpposllh, parse_ubx_nav_pvt, rtcm_message_type


def detect(default=None):
    explicit = os.environ.get("GNSS_PORT")
    if explicit:
        return explicit
    for p in serial.tools.list_ports.comports():
        text = f"{p.description or ''} {p.hwid or ''} {p.manufacturer or ''}".lower()
        if "u-blox" in text or "ublox" in text or "vid:pid=1546" in text:
            return p.device
    return default or ("COM3" if os.name == "nt" else "/dev/ttyACM0")


port = sys.argv[1] if len(sys.argv) > 1 else detect()
baud = int(os.environ.get("GNSS_BAUD", "115200"))
print(f"Opening {port} @ {baud}. Ctrl+C to stop.")
decoder = GNSSStreamDecoder()
counts = {}
with serial.Serial(port, baud, timeout=0.5) as ser:
    while True:
        raw = ser.read(ser.in_waiting or 1)
        for event in decoder.feed(raw):
            if event.kind == "rtcm":
                mt = rtcm_message_type(event.data)
                counts[mt] = counts.get(mt, 0) + 1
            elif event.kind == "ubx":
                hp = parse_ubx_nav_hpposllh(event.data)
                pvt = parse_ubx_nav_pvt(event.data)
                if hp:
                    print(f"HPPOS lat={hp['latitude']:.9f} lon={hp['longitude']:.9f} hAcc={hp['horizontal_accuracy_m']:.4f}m")
                elif pvt:
                    print(f"PVT {pvt['carrier_solution_text']} sats={pvt['satellites_used']} speed={pvt['speed_kmh']:.2f}km/h hAcc={pvt['horizontal_accuracy_m']:.3f}m RTCM={counts}")
        time.sleep(0.002)
