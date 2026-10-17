"""Configuration loader for Prosper NTRIP Caster."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


@dataclass(slots=True)
class TlsConfig:
    enabled: bool = True
    certfile: str = "/etc/prosper-ntrip/tls/fullchain.pem"
    keyfile: str = "/etc/prosper-ntrip/tls/privkey.pem"


@dataclass(slots=True)
class MountpointConfig:
    source_password: str
    rover_users: dict[str, str] = field(default_factory=dict)


@dataclass(slots=True)
class AdminConfig:
    username: str = "admin"
    password: str = ""


@dataclass(slots=True)
class CasterConfig:
    listen_host: str = "0.0.0.0"
    listen_port: int = 443
    read_timeout_s: float = 30.0
    source_idle_timeout_s: float = 20.0
    max_header_bytes: int = 32768
    client_queue_chunks: int = 128
    tls: TlsConfig = field(default_factory=TlsConfig)
    admin: AdminConfig = field(default_factory=AdminConfig)
    mountpoints: dict[str, MountpointConfig] = field(default_factory=dict)


def _expand_env(text: str) -> str:
    return os.path.expandvars(text)


def load_config(path: str | Path) -> CasterConfig:
    raw_text = Path(path).read_text(encoding="utf-8")
    raw: dict[str, Any] = yaml.safe_load(_expand_env(raw_text)) or {}

    tls_raw = raw.get("tls") or {}
    admin_raw = raw.get("admin") or {}
    mounts_raw = raw.get("mountpoints") or {}

    mounts: dict[str, MountpointConfig] = {}
    for name, item in mounts_raw.items():
        item = item or {}
        source_password = str(item.get("source_password", ""))
        rover_users = {str(k): str(v) for k, v in (item.get("rover_users") or {}).items()}
        mounts[str(name).lstrip("/")] = MountpointConfig(
            source_password=source_password,
            rover_users=rover_users,
        )

    cfg = CasterConfig(
        listen_host=str(raw.get("listen_host", "0.0.0.0")),
        listen_port=int(raw.get("listen_port", 443)),
        read_timeout_s=float(raw.get("read_timeout_s", 30.0)),
        source_idle_timeout_s=float(raw.get("source_idle_timeout_s", 20.0)),
        max_header_bytes=int(raw.get("max_header_bytes", 32768)),
        client_queue_chunks=int(raw.get("client_queue_chunks", 128)),
        tls=TlsConfig(
            enabled=bool(tls_raw.get("enabled", True)),
            certfile=str(tls_raw.get("certfile", "/etc/prosper-ntrip/tls/fullchain.pem")),
            keyfile=str(tls_raw.get("keyfile", "/etc/prosper-ntrip/tls/privkey.pem")),
        ),
        admin=AdminConfig(
            username=str(admin_raw.get("username", "admin")),
            password=str(admin_raw.get("password", "")),
        ),
        mountpoints=mounts,
    )
    validate_config(cfg)
    return cfg


def validate_config(cfg: CasterConfig) -> None:
    if not (1 <= cfg.listen_port <= 65535):
        raise ValueError("listen_port must be 1..65535")
    if cfg.source_idle_timeout_s < 3:
        raise ValueError("source_idle_timeout_s must be >= 3 seconds")
    if not cfg.mountpoints:
        raise ValueError("at least one mountpoint is required")
    for name, mount in cfg.mountpoints.items():
        if not name:
            raise ValueError("mountpoint name cannot be blank")
        if not mount.source_password:
            raise ValueError(f"mountpoint {name} requires source_password")
        if not mount.rover_users:
            raise ValueError(f"mountpoint {name} requires at least one rover user")
        if any(not user or not password for user, password in mount.rover_users.items()):
            raise ValueError(f"mountpoint {name} contains blank rover credentials")
    if not cfg.admin.password or "${" in cfg.admin.password:
        raise ValueError("admin.password is required and its environment variable must be set")
    for name, mount in cfg.mountpoints.items():
        if "${" in mount.source_password:
            raise ValueError(f"mountpoint {name} source password environment variable is not set")
        if any("${" in password for password in mount.rover_users.values()):
            raise ValueError(f"mountpoint {name} rover password environment variable is not set")
