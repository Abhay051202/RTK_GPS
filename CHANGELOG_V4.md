# v4.0.0

- Replaced POC Base/Rover serial handling with the Prosper production RTK core pattern.
- Automatic ZED-F9P configuration for Base and Rover.
- Production Fixed Base coordinates plus commissioning Survey-In mode.
- Required RTCM 1005/1077/1087/1097/1127/1230 enabled automatically.
- CRC-valid RTCM-only Base publishing and Rover injection.
- Queue-based Base NTRIP publisher so network delays cannot block the GNSS serial reader.
- Stale Base RTCM frames are discarded after an outage instead of replayed.
- Robust TLS NTRIP response parsing with HTTP and ICY support.
- UBX NAV-PVT and NAV-HPPOSLLH actual receiver accuracy, speed, heading and carrier state.
- UBX NAV-SVIN monitoring.
- Separate Base service and Reach Stacker EdgeBox Rover agent.
- Multi-Rover dashboard and telemetry ingestion.
- Offline timeout, NTRIP state, correction age and RTCM frame counts in UI.
- SQLite + Excel recording expanded with precision/NTRIP fields.
- Linux systemd auto-start/restart for Base and Rover.
- Windows Base startup task support retained.
- Removed all real credentials from source.
