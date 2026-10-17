"""API authentication helpers.

RTK_TELEMETRY_TOKEN protects EdgeBox -> Base telemetry independently from the
optional dashboard/admin token.  Browser-side tokens are not treated as strong
secrets; deploy the dashboard on a trusted site network/VLAN or behind a proper
reverse proxy/SSO when wider access is required.
"""
from __future__ import annotations

import hmac
import os
from fastapi import Header, HTTPException, status


def _token(name: str) -> str | None:
    value = os.environ.get(name, "").strip()
    return value or None


def configured_api_token() -> str | None:
    return _token("RTK_API_TOKEN")


def configured_telemetry_token() -> str | None:
    return _token("RTK_TELEMETRY_TOKEN") or configured_api_token()


def _check(expected: str | None, supplied: str | None) -> None:
    if not expected:
        return
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing API key")


def require_api_key(x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> None:
    _check(configured_api_token(), x_api_key)


def require_telemetry_key(x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> None:
    _check(configured_telemetry_token(), x_api_key)


def websocket_token_ok(token: str | None) -> bool:
    expected = configured_api_token()
    if not expected:
        return True
    return bool(token and hmac.compare_digest(token, expected))
