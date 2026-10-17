# Azure deployment notes

The Azure VM hosts the **NTRIP caster only**. The physical ZED-F9P Base remains with the GNSS antenna and CM4 at the site.

Required inbound ports:
- TCP 22: SSH, ideally restricted to administrator public IP.
- TCP 80: Let's Encrypt HTTP-01 validation and renewal.
- TCP 443: TLS NTRIP service.

The physical Base and every Rover make outbound TLS connections to `rtk.prosperinfotech.com:443`.
