"""Async TLS NTRIP caster supporting NTRIP v1 SOURCE and rover GET clients."""

from __future__ import annotations

import asyncio
import base64
import hmac
import json
import logging
import ssl
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from .config import CasterConfig, MountpointConfig

LOGGER = logging.getLogger(__name__)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class RuntimeMount:
    config: MountpointConfig
    source_connected: bool = False
    source_peer: str | None = None
    source_connected_utc: str | None = None
    last_rtcm_utc: str | None = None
    last_rtcm_monotonic: float | None = None
    bytes_in: int = 0
    bytes_out: int = 0
    source_reconnects: int = 0
    clients: set[asyncio.Queue[bytes]] = field(default_factory=set)


class ProsperNtripCaster:
    """Minimal authenticated NTRIP caster optimized for private Prosper deployments."""

    def __init__(self, cfg: CasterConfig) -> None:
        self.cfg = cfg
        self.mounts = {name: RuntimeMount(config=mp) for name, mp in cfg.mountpoints.items()}
        self.started_utc = _utc_now()
        self._server: asyncio.Server | None = None

    async def run(self) -> None:
        ssl_context = None
        if self.cfg.tls.enabled:
            ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            ssl_context.minimum_version = ssl.TLSVersion.TLSv1_2
            ssl_context.load_cert_chain(self.cfg.tls.certfile, self.cfg.tls.keyfile)

        self._server = await asyncio.start_server(
            self._handle_connection,
            self.cfg.listen_host,
            self.cfg.listen_port,
            ssl=ssl_context,
            start_serving=True,
        )
        sockets = ", ".join(str(sock.getsockname()) for sock in (self._server.sockets or []))
        LOGGER.info("Prosper NTRIP Caster listening on %s TLS=%s", sockets, self.cfg.tls.enabled)
        async with self._server:
            await self._server.serve_forever()

    async def _handle_connection(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        peer = writer.get_extra_info("peername")
        peer_text = str(peer)
        try:
            header = await asyncio.wait_for(self._read_header(reader), timeout=self.cfg.read_timeout_s)
            if not header:
                return
            first, headers = self._parse_header(header)
            LOGGER.info("connection %s request=%s", peer_text, first)

            if first.startswith("SOURCE "):
                await self._handle_source_v1(first, reader, writer, peer_text)
                return

            parts = first.split()
            if len(parts) < 2:
                await self._write_http(writer, 400, b"Bad Request\n")
                return
            method, path = parts[0].upper(), parts[1]

            if method == "GET" and path == "/health":
                payload = json.dumps({"status": "ok", "started_utc": self.started_utc}).encode()
                await self._write_http(writer, 200, payload, "application/json")
                return

            if method == "GET" and path == "/status":
                if not self._check_basic(headers, {self.cfg.admin.username: self.cfg.admin.password}):
                    await self._write_http(writer, 401, b"Unauthorized\n", extra_headers={"WWW-Authenticate": 'Basic realm="ProsperRTK"'})
                    return
                payload = json.dumps(self.status(), indent=2).encode()
                await self._write_http(writer, 200, payload, "application/json")
                return

            if method == "GET" and path in {"/", ""}:
                await self._write_sourcetable(writer)
                return

            if method == "GET":
                mount_name = path.lstrip("/")
                await self._handle_rover(mount_name, headers, writer, peer_text)
                return

            await self._write_http(writer, 405, b"Method Not Allowed\n")
        except asyncio.TimeoutError:
            LOGGER.warning("connection timeout from %s", peer_text)
        except (ConnectionError, asyncio.IncompleteReadError, OSError) as exc:
            LOGGER.info("connection closed %s: %s", peer_text, exc)
        except Exception:
            LOGGER.exception("unhandled connection error from %s", peer_text)
        finally:
            if not writer.is_closing():
                writer.close()
                try:
                    await writer.wait_closed()
                except OSError:
                    pass

    async def _read_header(self, reader: asyncio.StreamReader) -> bytes:
        data = bytearray()
        while b"\r\n\r\n" not in data:
            chunk = await reader.read(1024)
            if not chunk:
                break
            data.extend(chunk)
            if len(data) > self.cfg.max_header_bytes:
                raise ConnectionError("request header too large")
        return bytes(data)

    @staticmethod
    def _parse_header(data: bytes) -> tuple[str, dict[str, str]]:
        head = data.split(b"\r\n\r\n", 1)[0].decode("latin1", errors="replace")
        lines = head.split("\r\n")
        first = lines[0].strip()
        headers: dict[str, str] = {}
        for line in lines[1:]:
            if ":" in line:
                key, value = line.split(":", 1)
                headers[key.strip().lower()] = value.strip()
        return first, headers

    async def _handle_source_v1(
        self,
        first_line: str,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
        peer_text: str,
    ) -> None:
        parts = first_line.split(maxsplit=2)
        if len(parts) != 3:
            await self._write_http(writer, 400, b"Invalid SOURCE request\n")
            return
        _, password, path = parts
        mount_name = path.lstrip("/")
        runtime = self.mounts.get(mount_name)
        if runtime is None:
            await self._write_http(writer, 404, b"Unknown mountpoint\n")
            return
        if not hmac.compare_digest(password, runtime.config.source_password):
            await self._write_http(writer, 401, b"Bad source password\n")
            return
        if runtime.source_connected:
            await self._write_http(writer, 409, b"Source already connected\n")
            return

        runtime.source_connected = True
        runtime.source_peer = peer_text
        runtime.source_connected_utc = _utc_now()
        runtime.source_reconnects += 1
        writer.write(b"ICY 200 OK\r\n\r\n")
        await writer.drain()
        LOGGER.info("source connected mount=%s peer=%s", mount_name, peer_text)
        try:
            while True:
                try:
                    payload = await asyncio.wait_for(
                        reader.read(16384), timeout=self.cfg.source_idle_timeout_s
                    )
                except asyncio.TimeoutError as exc:
                    raise ConnectionError(
                        f"source idle for > {self.cfg.source_idle_timeout_s:.0f}s"
                    ) from exc
                if not payload:
                    break
                runtime.bytes_in += len(payload)
                runtime.last_rtcm_utc = _utc_now()
                runtime.last_rtcm_monotonic = time.monotonic()
                self._broadcast(runtime, payload)
        finally:
            runtime.source_connected = False
            runtime.source_peer = None
            runtime.last_rtcm_monotonic = None
            self._disconnect_rovers(runtime)
            LOGGER.warning("source disconnected mount=%s peer=%s", mount_name, peer_text)

    def _broadcast(self, runtime: RuntimeMount, payload: bytes) -> None:
        for queue in list(runtime.clients):
            if queue.full():
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                # Prefer dropping stale correction chunks over blocking the source.
                pass

    def _disconnect_rovers(self, runtime: RuntimeMount) -> None:
        """Force connected Rovers to reconnect when the Base source disappears."""
        for queue in list(runtime.clients):
            if queue.full():
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            try:
                queue.put_nowait(b"")
            except asyncio.QueueFull:
                pass

    async def _handle_rover(
        self,
        mount_name: str,
        headers: dict[str, str],
        writer: asyncio.StreamWriter,
        peer_text: str,
    ) -> None:
        runtime = self.mounts.get(mount_name)
        if runtime is None:
            await self._write_http(writer, 404, b"Unknown mountpoint\n")
            return
        if not self._check_basic(headers, runtime.config.rover_users):
            await self._write_http(writer, 401, b"Unauthorized\n", extra_headers={"WWW-Authenticate": 'Basic realm="NTRIP"'})
            return
        if not runtime.source_connected:
            await self._write_http(writer, 503, b"RTK source not connected\n")
            return

        queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=self.cfg.client_queue_chunks)
        runtime.clients.add(queue)
        writer.write(
            b"ICY 200 OK\r\n"
            b"Ntrip-Version: Ntrip/2.0\r\n"
            b"Content-Type: gnss/data\r\n"
            b"Connection: close\r\n\r\n"
        )
        await writer.drain()
        LOGGER.info("rover connected mount=%s peer=%s clients=%s", mount_name, peer_text, len(runtime.clients))
        try:
            while True:
                payload = await queue.get()
                if not payload:
                    break
                writer.write(payload)
                await writer.drain()
                runtime.bytes_out += len(payload)
        except (ConnectionError, OSError, asyncio.CancelledError):
            pass
        finally:
            runtime.clients.discard(queue)
            LOGGER.info("rover disconnected mount=%s peer=%s clients=%s", mount_name, peer_text, len(runtime.clients))

    @staticmethod
    def _check_basic(headers: dict[str, str], users: dict[str, str]) -> bool:
        auth = headers.get("authorization", "")
        if not auth.lower().startswith("basic "):
            return False
        try:
            decoded = base64.b64decode(auth.split(None, 1)[1]).decode("utf-8")
            username, password = decoded.split(":", 1)
        except Exception:
            return False
        expected = users.get(username)
        return expected is not None and hmac.compare_digest(password, expected)

    async def _write_sourcetable(self, writer: asyncio.StreamWriter) -> None:
        lines = ["SOURCETABLE 200 OK", "Server: ProsperNTRIPCaster/1.1", "Content-Type: text/plain", ""]
        for name, runtime in self.mounts.items():
            status = "ACTIVE" if runtime.source_connected else "INACTIVE"
            lines.append(f"STR;{name};Prosper RTK;RTCM 3;1005(10),1077(1),1087(1),1097(1),1127(1),1230(10);2;GPS+GLO+GAL+BDS;PROSPER;IND;0;0;1;1;Prosper;none;N;N;0;{status}")
        lines.extend(["ENDSOURCETABLE", ""])
        writer.write("\r\n".join(lines).encode("latin1"))
        await writer.drain()

    async def _write_http(
        self,
        writer: asyncio.StreamWriter,
        status: int,
        payload: bytes,
        content_type: str = "text/plain",
        extra_headers: dict[str, str] | None = None,
    ) -> None:
        reason = {
            200: "OK",
            400: "Bad Request",
            401: "Unauthorized",
            404: "Not Found",
            405: "Method Not Allowed",
            409: "Conflict",
            503: "Service Unavailable",
        }.get(status, "Error")
        headers = {
            "Content-Type": content_type,
            "Content-Length": str(len(payload)),
            "Connection": "close",
        }
        headers.update(extra_headers or {})
        head = [f"HTTP/1.1 {status} {reason}"] + [f"{k}: {v}" for k, v in headers.items()] + ["", ""]
        writer.write("\r\n".join(head).encode("ascii") + payload)
        await writer.drain()

    def status(self) -> dict[str, Any]:
        now = time.time()
        mounts: dict[str, Any] = {}
        for name, runtime in self.mounts.items():
            age = None
            if runtime.last_rtcm_utc:
                try:
                    dt = datetime.fromisoformat(runtime.last_rtcm_utc)
                    age = max(0.0, now - dt.timestamp())
                except ValueError:
                    age = None
            mounts[name] = {
                "source_connected": runtime.source_connected,
                "source_peer": runtime.source_peer,
                "source_connected_utc": runtime.source_connected_utc,
                "last_rtcm_utc": runtime.last_rtcm_utc,
                "rtcm_age_s": age,
                "connected_rovers": len(runtime.clients),
                "bytes_in": runtime.bytes_in,
                "bytes_out": runtime.bytes_out,
                "source_reconnects": runtime.source_reconnects,
            }
        return {
            "service": "prosper-ntrip-caster",
            "version": "1.1.0",
            "started_utc": self.started_utc,
            "mountpoints": mounts,
        }
