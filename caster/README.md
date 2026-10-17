# Prosper NTRIP Caster - Azure v1.0

A lightweight authenticated TLS NTRIP caster intended for Prosper RTK deployments.

## Supported flows

- Base source: NTRIP v1 `SOURCE <password> /<mountpoint>` over TLS.
- Rover client: NTRIP HTTP GET with Basic authentication over TLS.
- Multiple rover clients per mountpoint.
- Public `/health` endpoint and authenticated `/status` endpoint.
- Automatic service restart via systemd.

## Default endpoint

- Host: `rtk.prosperinfotech.com`
- Port: `443`
- Mountpoint: `SARVESHWAR-CFS-BASE01`

## Azure deployment

See `docs/AZURE_DEPLOYMENT.md`.
