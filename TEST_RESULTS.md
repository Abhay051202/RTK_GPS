# Validation Results - v4.0.0

Validation performed before packaging:

- Python source compilation: PASS (`backend/` and `caster/src/`).
- Backend automated unit tests: PASS (9/9).
- Covered: RTCM3 CRC/framing, mixed GNSS stream separation, NAV-PVT decoding, NAV-HPPOSLLH high-precision scaling, NAV-SVIN scaling, NTRIP HTTP/ICY parsing, 409 handling, SQLite persistence/schema migration, Excel recording/export.
- Credential scan: no known development NTRIP credentials are present in the package; example files contain placeholders only.
- Frontend package metadata validated. A full `npm ci && npm run build` could not be executed in the packaging environment because external package download/network access is disabled. Run the documented frontend build commands on the deployment/build machine.

Field acceptance is still required. In particular, verify RTK FIXED at independently surveyed checkpoints and measure actual horizontal/vertical error before enabling precise yard-slot decisions.
