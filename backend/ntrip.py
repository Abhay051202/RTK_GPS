"""Production NTRIP transports for the Prosper Base and Reach Stacker Rovers."""
from __future__ import annotations

import base64
from datetime import datetime, timezone
import queue
import socket
import ssl
import threading
import time
from typing import Callable

from gnss_protocol import GNSSStreamDecoder, validate_rtcm3


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _configure_keepalive(sock: socket.socket) -> None:
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
    # Best effort platform-specific keepalive tuning.
    try:
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPIDLE, 30)
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPINTVL, 10)
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPCNT, 3)
    except (AttributeError, OSError):
        pass


def open_socket(host: str, port: int, use_tls: bool, timeout: float = 10.0) -> socket.socket:
    raw = socket.create_connection((host, port), timeout=timeout)
    _configure_keepalive(raw)
    if use_tls or port == 443:
        context = ssl.create_default_context()
        sock = context.wrap_socket(raw, server_hostname=host)
    else:
        sock = raw
    sock.settimeout(timeout)
    return sock


def read_header(sock: socket.socket, limit: int = 32768) -> tuple[str, bytes]:
    data = bytearray()
    while len(data) <= limit:
        raw = bytes(data)
        marker = raw.find(b"\r\n\r\n")
        if marker >= 0:
            return raw[: marker + 4].decode("latin1", errors="replace"), raw[marker + 4 :]

        # NTRIP v1 may answer with ICY 200 OK followed immediately by binary RTCM.
        if raw.startswith(b"ICY "):
            line_end = raw.find(b"\r\n")
            if line_end >= 0:
                return raw[: line_end + 2].decode("latin1", errors="replace"), raw[line_end + 2 :]

        chunk = sock.recv(1024)
        if not chunk:
            return raw.decode("latin1", errors="replace"), b""
        data.extend(chunk)
    raise ConnectionError("NTRIP response header exceeded 32 KB")


def first_status_line(header: str) -> str:
    return header.splitlines()[0].strip() if header else ""


def status_ok(header: str) -> bool:
    line = first_status_line(header).upper()
    return line.startswith("ICY 200") or (line.startswith("HTTP/") and " 200 " in f" {line} ")


def open_source(host: str, port: int, mountpoint: str, password: str, use_tls: bool) -> tuple[socket.socket, bytes]:
    if not password:
        raise ValueError("NTRIP source password is required")
    sock = open_socket(host, port, use_tls)
    request = (
        f"SOURCE {password} /{mountpoint.lstrip('/')}\r\n"
        "Source-Agent: NTRIP ProsperRTK-Base/4.0\r\n"
        "STR: \r\n\r\n"
    ).encode("ascii")
    sock.sendall(request)
    header, initial = read_header(sock)
    if not status_ok(header):
        line = first_status_line(header) or "Unknown NTRIP source response"
        sock.close()
        if "409" in line:
            raise ConnectionError(f"{line} - source already connected; verify only one Base publisher is running")
        raise ConnectionError(line)
    sock.settimeout(20.0)
    return sock, initial


def open_rover(
    host: str,
    port: int,
    mountpoint: str,
    username: str,
    password: str,
    use_tls: bool,
) -> tuple[socket.socket, bytes]:
    if not username or not password:
        raise ValueError("NTRIP rover username/password are required")
    sock = open_socket(host, port, use_tls)
    token = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
    request = (
        f"GET /{mountpoint.lstrip('/')} HTTP/1.1\r\n"
        f"Host: {host}:{port}\r\n"
        "Ntrip-Version: Ntrip/2.0\r\n"
        "User-Agent: NTRIP ProsperRTK-Rover/4.0\r\n"
        f"Authorization: Basic {token}\r\n"
        "Accept: */*\r\n"
        "Connection: keep-alive\r\n\r\n"
    ).encode("ascii")
    sock.sendall(request)
    header, initial = read_header(sock)
    if not status_ok(header):
        line = first_status_line(header) or "Unknown NTRIP rover response"
        sock.close()
        raise ConnectionError(line)
    sock.settimeout(15.0)
    return sock, initial


class NtripSourceWorker:
    """Non-blocking Base RTCM publisher with a bounded queue and reconnect loop."""

    def __init__(self, host: str, port: int, mountpoint: str, password: str, use_tls: bool = True, reconnect_s: float = 5.0):
        self.host = host
        self.port = port
        self.mountpoint = mountpoint
        self.password = password
        self.use_tls = use_tls
        self.reconnect_s = reconnect_s
        self._queue: queue.Queue[tuple[float, bytes]] = queue.Queue(maxsize=256)
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._lock = threading.RLock()
        self._state = {
            "connected": False,
            "status_text": "STOPPED",
            "bytes_sent": 0,
            "frames_sent": 0,
            "reconnects": 0,
            "last_connected_utc": None,
            "last_sent_utc": None,
            "last_error": None,
            "host": host,
            "port": port,
            "mountpoint": mountpoint,
            "tls": use_tls,
        }

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name="ntrip-base-source", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)

    def submit(self, frame: bytes) -> None:
        if not validate_rtcm3(frame):
            return
        try:
            self._queue.put_nowait((time.monotonic(), frame))
        except queue.Full:
            # Preserve the freshest corrections instead of blocking the serial reader.
            try:
                self._queue.get_nowait()
            except queue.Empty:
                pass
            try:
                self._queue.put_nowait((time.monotonic(), frame))
            except queue.Full:
                pass

    def snapshot(self) -> dict:
        with self._lock:
            return dict(self._state, queue_depth=self._queue.qsize())

    def _set(self, **kwargs) -> None:
        with self._lock:
            self._state.update(kwargs)

    def _loop(self) -> None:
        sock: socket.socket | None = None
        self._set(status_text="CONNECTING")
        while not self._stop.is_set():
            try:
                queued_at, frame = self._queue.get(timeout=1.0)
                # Never publish stale corrections after an outage. Fresh RTCM will arrive continuously.
                if time.monotonic() - queued_at > 5.0:
                    continue
            except queue.Empty:
                continue

            if sock is None:
                try:
                    sock, _ = open_source(self.host, self.port, self.mountpoint, self.password, self.use_tls)
                    self._set(
                        connected=True,
                        status_text="STREAMING",
                        last_connected_utc=_utc_now(),
                        last_error=None,
                    )
                except Exception as exc:
                    self._set(
                        connected=False,
                        status_text="RECONNECTING",
                        reconnects=int(self.snapshot()["reconnects"]) + 1,
                        last_error=str(exc),
                    )
                    self._stop.wait(self.reconnect_s)
                    continue

            try:
                sock.sendall(frame)
                snap = self.snapshot()
                self._set(
                    bytes_sent=int(snap["bytes_sent"]) + len(frame),
                    frames_sent=int(snap["frames_sent"]) + 1,
                    last_sent_utc=_utc_now(),
                )
            except Exception as exc:
                try:
                    sock.close()
                except Exception:
                    pass
                sock = None
                snap = self.snapshot()
                self._set(
                    connected=False,
                    status_text="RECONNECTING",
                    reconnects=int(snap["reconnects"]) + 1,
                    last_error=str(exc),
                )
                self._stop.wait(self.reconnect_s)

        if sock:
            try:
                sock.close()
            except Exception:
                pass
        self._set(connected=False, status_text="STOPPED")


class NtripRoverWorker:
    """Reconnectable Rover NTRIP client that injects CRC-valid RTCM3 frames only."""

    def __init__(
        self,
        host: str,
        port: int,
        mountpoint: str,
        username: str,
        password: str,
        sink: Callable[[bytes], None],
        use_tls: bool = True,
        reconnect_s: float = 5.0,
    ):
        self.host = host
        self.port = port
        self.mountpoint = mountpoint
        self.username = username
        self.password = password
        self.sink = sink
        self.use_tls = use_tls
        self.reconnect_s = reconnect_s
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._lock = threading.RLock()
        self._state = {
            "connected": False,
            "status_text": "STOPPED",
            "bytes_received": 0,
            "frames_received": 0,
            "reconnects": 0,
            "last_connected_utc": None,
            "last_rtcm_utc": None,
            "last_rtcm_monotonic": None,
            "last_error": None,
        }

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name="ntrip-rover", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)

    def snapshot(self) -> dict:
        with self._lock:
            snap = dict(self._state)
        mono = snap.pop("last_rtcm_monotonic", None)
        snap["correction_age_s"] = round(max(0.0, time.monotonic() - mono), 3) if mono else None
        return snap

    def _set(self, **kwargs) -> None:
        with self._lock:
            self._state.update(kwargs)

    def _handle_bytes(self, decoder: GNSSStreamDecoder, data: bytes) -> None:
        for event in decoder.feed(data):
            if event.kind != "rtcm":
                continue
            self.sink(event.data)
            now = _utc_now()
            snap = self.snapshot()
            self._set(
                bytes_received=int(snap["bytes_received"]) + len(event.data),
                frames_received=int(snap["frames_received"]) + 1,
                last_rtcm_utc=now,
                last_rtcm_monotonic=time.monotonic(),
            )

    def _loop(self) -> None:
        while not self._stop.is_set():
            sock: socket.socket | None = None
            decoder = GNSSStreamDecoder()
            try:
                self._set(status_text="CONNECTING")
                sock, initial = open_rover(
                    self.host,
                    self.port,
                    self.mountpoint,
                    self.username,
                    self.password,
                    self.use_tls,
                )
                self._set(
                    connected=True,
                    status_text="RECEIVING",
                    last_connected_utc=_utc_now(),
                    last_error=None,
                )
                if initial:
                    self._handle_bytes(decoder, initial)

                while not self._stop.is_set():
                    data = sock.recv(8192)
                    if not data:
                        raise ConnectionError("Caster closed RTCM stream")
                    self._handle_bytes(decoder, data)
            except Exception as exc:
                snap = self.snapshot()
                self._set(
                    connected=False,
                    status_text="RECONNECTING",
                    reconnects=int(snap["reconnects"]) + 1,
                    last_error=str(exc),
                )
                self._stop.wait(self.reconnect_s)
            finally:
                if sock:
                    try:
                        sock.close()
                    except Exception:
                        pass
        self._set(connected=False, status_text="STOPPED")
