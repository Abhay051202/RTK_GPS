import struct
import unittest

from gnss_protocol import (
    GNSSStreamDecoder,
    crc24q,
    parse_ubx_nav_hpposllh,
    parse_ubx_nav_pvt,
    parse_ubx_nav_svin,
    rtcm_message_type,
    validate_rtcm3,
)


def ubx_frame(cls, msg_id, payload):
    header = bytes([0xB5, 0x62, cls, msg_id]) + len(payload).to_bytes(2, "little")
    ck_a = ck_b = 0
    for byte in header[2:] + payload:
        ck_a = (ck_a + byte) & 0xFF
        ck_b = (ck_b + ck_a) & 0xFF
    return header + payload + bytes([ck_a, ck_b])


def make_pvt():
    p = bytearray(92)
    p[20] = 3
    p[21] = 0x01 | 0x02 | (2 << 6)  # valid + differential + RTK fixed
    p[23] = 31
    struct.pack_into("<i", p, 24, int(73.04654733 / 1e-7))
    struct.pack_into("<i", p, 28, int(18.90393083 / 1e-7))
    struct.pack_into("<i", p, 32, 123450)
    struct.pack_into("<i", p, 36, 110000)
    struct.pack_into("<I", p, 40, 18)  # 18 mm
    struct.pack_into("<I", p, 44, 31)  # 31 mm
    struct.pack_into("<i", p, 60, 2500)  # 2.5 m/s
    struct.pack_into("<i", p, 64, int(123.45 / 1e-5))
    struct.pack_into("<H", p, 76, 72)
    return ubx_frame(0x01, 0x07, bytes(p))


def make_hppos():
    p = bytearray(36)
    struct.pack_into("<I", p, 4, 1000)
    struct.pack_into("<i", p, 8, int(73.0465473 / 1e-7))
    struct.pack_into("<i", p, 12, int(18.9039308 / 1e-7))
    struct.pack_into("<i", p, 16, 123000)
    struct.pack_into("<i", p, 20, 110000)
    struct.pack_into("<b", p, 24, 3)
    struct.pack_into("<b", p, 25, 3)
    struct.pack_into("<b", p, 26, 5)
    struct.pack_into("<b", p, 27, 0)
    struct.pack_into("<I", p, 28, 145)  # 14.5 mm
    struct.pack_into("<I", p, 32, 251)  # 25.1 mm
    return ubx_frame(0x01, 0x14, bytes(p))



def make_svin():
    p = bytearray(40)
    struct.pack_into("<I", p, 8, 612)
    struct.pack_into("<i", p, 12, 100)
    struct.pack_into("<i", p, 16, 200)
    struct.pack_into("<i", p, 20, 300)
    struct.pack_into("<b", p, 24, 1)
    struct.pack_into("<b", p, 25, -2)
    struct.pack_into("<b", p, 26, 3)
    struct.pack_into("<I", p, 28, 4523)  # 0.4523 m
    struct.pack_into("<I", p, 32, 1000)
    p[36] = 1
    p[37] = 0
    return ubx_frame(0x01, 0x3B, bytes(p))

def make_rtcm(message_type=1005):
    payload = bytearray(8)
    payload[0] = (message_type >> 4) & 0xFF
    payload[1] = (message_type & 0x0F) << 4
    header = bytes([0xD3, (len(payload) >> 8) & 0x03, len(payload) & 0xFF])
    body = header + bytes(payload)
    return body + crc24q(body).to_bytes(3, "big")


class ProtocolTest(unittest.TestCase):
    def test_nav_pvt_uses_receiver_accuracy_speed_and_carrier(self):
        result = parse_ubx_nav_pvt(make_pvt())
        self.assertIsNotNone(result)
        self.assertEqual(result["carrier_solution_text"], "RTK FIXED")
        self.assertTrue(result["differential_solution"])
        self.assertEqual(result["satellites_used"], 31)
        self.assertAlmostEqual(result["horizontal_accuracy_m"], 0.018, places=6)
        self.assertAlmostEqual(result["vertical_accuracy_m"], 0.031, places=6)
        self.assertAlmostEqual(result["speed_kmh"], 9.0, places=3)

    def test_hppos_scaling(self):
        result = parse_ubx_nav_hpposllh(make_hppos())
        self.assertIsNotNone(result)
        self.assertAlmostEqual(result["horizontal_accuracy_m"], 0.0145, places=6)
        self.assertAlmostEqual(result["vertical_accuracy_m"], 0.0251, places=6)

    def test_nav_svin_scaling(self):
        result = parse_ubx_nav_svin(make_svin())
        self.assertIsNotNone(result)
        self.assertEqual(result["survey_duration_s"], 612)
        self.assertTrue(result["survey_valid"])
        self.assertFalse(result["survey_active"])
        self.assertAlmostEqual(result["mean_accuracy_m"], 0.4523, places=4)

    def test_mixed_stream_extracts_only_valid_protocol_frames(self):
        rtcm = make_rtcm(1005)
        pvt = make_pvt()
        nmea = b"$GNGGA,123519,4807.038,N,01131.000,E,4,12,0.7,545.4,M,46.9,M,,*00\r\n"
        decoder = GNSSStreamDecoder()
        events = []
        mixed = b"noise" + nmea + pvt + rtcm
        for chunk in (mixed[:17], mixed[17:60], mixed[60:120], mixed[120:]):
            events.extend(decoder.feed(chunk))
        kinds = [e.kind for e in events]
        self.assertIn("nmea", kinds)
        self.assertIn("ubx", kinds)
        self.assertIn("rtcm", kinds)
        rtcm_event = next(e.data for e in events if e.kind == "rtcm")
        self.assertTrue(validate_rtcm3(rtcm_event))
        self.assertEqual(rtcm_message_type(rtcm_event), 1005)


if __name__ == "__main__":
    unittest.main()
