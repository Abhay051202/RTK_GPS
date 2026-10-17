"""Environment-backed settings for Prosper CFS RTK production services.

No credentials are stored in source.  Copy the appropriate .env.*.example file
and keep production secrets in an OS-protected environment file.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover
    load_dotenv = None

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent

if load_dotenv:
    load_dotenv(PROJECT_ROOT / ".env", override=False)
    load_dotenv(BACKEND_DIR / ".env", override=False)


def env(name: str, default: Optional[str] = None) -> Optional[str]:
    value = os.environ.get(name)
    if value is None or value.strip() == "":
        return default
    return value.strip()


def required(name: str) -> str:
    value = env(name)
    if not value:
        raise RuntimeError(
            f"Required environment variable {name} is not set. "
            "Copy the appropriate .env.*.example file and provide the value outside source control."
        )
    return value


def env_int(name: str, default: int) -> int:
    value = env(name)
    return int(value) if value is not None else default


def env_float(name: str, default: float) -> float:
    value = env(name)
    return float(value) if value is not None else default


def env_bool(name: str, default: bool = False) -> bool:
    value = env(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "y", "on"}


def env_csv(name: str, default: str = "") -> list[str]:
    value = env(name, default) or ""
    return [item.strip() for item in value.split(",") if item.strip()]


# Common NTRIP defaults used by both Base and Rover.
CASTER_HOST = env("NTRIP_CASTER_HOST", "rtk.prosperinfotech.com") or "rtk.prosperinfotech.com"
CASTER_PORT = env_int("NTRIP_CASTER_PORT", 443)
MOUNTPOINT = env("NTRIP_MOUNTPOINT", "SARVESHWAR-CFS-BASE01") or "SARVESHWAR-CFS-BASE01"
NTRIP_TLS = env_bool("NTRIP_TLS", True)
GNSS_BAUD = env_int("GNSS_BAUD", 115200)
