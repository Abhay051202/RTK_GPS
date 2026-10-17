# Sarveshwar RTK Production Acceptance Test

## Base
- Fixed coordinates obtained from an independent survey.
- `BASE_MODE=fixed`.
- Base antenna mechanically stable.
- RTCM 1005/1077/1087/1097/1127/1230 observed.
- Azure caster `STREAMING` with continuously increasing bytes/frames.

## Each Reach Stacker
- Stable `/dev/serial/by-id/...` ZED-F9P path.
- Unique NTRIP username/password.
- Correction age normally <= 2 s; alarm/reject precise slot decision if > 5 s.
- `carrier_solution=2` / `RTK FIXED` before precision location decisions.
- Receiver hAcc/vAcc populated from UBX.

## Physical accuracy test
1. Establish multiple independent surveyed check points across the yard.
2. Place Rover antenna reference point on each check point.
3. Wait for stable RTK FIXED.
4. Record at least 60 seconds per point.
5. Calculate horizontal error versus surveyed coordinates.
6. Repeat after Base/Rover reboot and after a network interruption.
7. Accept only after the measured physical error meets the project requirement.

`RTK FIXED` is a carrier-state indicator; it is not by itself proof that the Base coordinates are absolutely correct.
