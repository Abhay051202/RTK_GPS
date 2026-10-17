# Azure Caster v1.1 hardening

This package is compatible with the existing `rtk.prosperinfotech.com:443` design but fixes an important recovery case from v1.0:

- a Base source that stops sending RTCM is closed after `source_idle_timeout_s` (default 20 s);
- connected Rover streams are closed when the Base source disappears so Rover agents reconnect cleanly;
- the mountpoint becomes available again automatically instead of remaining stuck as `409 Source already connected` after a half-open connection.

Before replacing the running Azure caster, back up `/etc/prosper-ntrip/caster.env`, `/etc/prosper-ntrip/caster.yaml` and TLS files. Keep the same mountpoint/users/passwords unless credentials are intentionally rotated.
