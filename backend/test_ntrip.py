import unittest

from ntrip import read_header, status_ok


class FakeSocket:
    def __init__(self, chunks):
        self.chunks = list(chunks)
    def recv(self, _):
        return self.chunks.pop(0) if self.chunks else b""


class NtripHeaderTest(unittest.TestCase):
    def test_http_header_preserves_initial_body(self):
        sock = FakeSocket([b"HTTP/1.1 200 OK\r\nContent-Type: gnss/data\r\n\r\n\xD3\x00"])
        header, body = read_header(sock)
        self.assertTrue(status_ok(header))
        self.assertEqual(body, b"\xD3\x00")

    def test_icy_single_line_header(self):
        sock = FakeSocket([b"ICY 200 OK\r\n\xD3\x00\x01"])
        header, body = read_header(sock)
        self.assertTrue(status_ok(header))
        self.assertEqual(body, b"\xD3\x00\x01")

    def test_409_is_not_success(self):
        self.assertFalse(status_ok("HTTP/1.1 409 Conflict\r\n"))


if __name__ == "__main__":
    unittest.main()
