# Prosper RTK - Azure NTRIP Caster A-to-Z Deployment

## Target architecture

Physical Base (ZED-F9P + CM4) -> TLS NTRIP source -> rtk.prosperinfotech.com:443 -> Azure caster -> TLS NTRIP client -> Rover ZED-F9P.

The Azure VM is the **caster/relay**, not the physical GNSS Base.

## Suggested Azure region

Use `centralindia` for the long-lived production deployment (Pune, India), or `westindia` if the desired VM SKU is available. Keeping the caster in India avoids moving it later when the physical Base/Rovers are installed at JNPT.

## Azure Cloud Shell variables

```bash
RG=prosper-rtk-prod-rg
LOC=centralindia
VM=prosper-rtk-caster01
ADMIN=azureuser
IMAGE='Canonical:0001-com-ubuntu-minimal-jammy:minimal-22_04-lts-gen2:latest'
```

## Create resource group and VM

```bash
az group create --name "$RG" --location "$LOC"

az vm create \
  --resource-group "$RG" \
  --name "$VM" \
  --location "$LOC" \
  --image "$IMAGE" \
  --size Standard_B1ms \
  --admin-username "$ADMIN" \
  --generate-ssh-keys \
  --public-ip-sku Standard
```

## Open required ports

```bash
az vm open-port --resource-group "$RG" --name "$VM" --port 443 --priority 1010
az vm open-port --resource-group "$RG" --name "$VM" --port 80  --priority 1020
```

TCP 443 is the TLS NTRIP endpoint. TCP 80 is used only for Let's Encrypt HTTP-01 certificate issuance/renewal. SSH 22 should be restricted to the administrator's public IP in the VM NSG.

## Get VM public IP

```bash
PUBLIC_IP=$(az vm show -d -g "$RG" -n "$VM" --query publicIps -o tsv)
echo "$PUBLIC_IP"
```

Create an A record in the authoritative DNS for `prosperinfotech.com`:

- Name: `rtk`
- Type: `A`
- Value: Azure VM public IP
- TTL: 300 seconds during testing

If the domain uses Cloudflare, use DNS-only mode for this hostname unless a TCP proxy product designed for raw TCP is configured.

Verify:

```bash
dig +short rtk.prosperinfotech.com
```

## Copy package to VM

From the administrator workstation:

```bash
scp prosper_ntrip_caster_azure_v1.0.zip azureuser@<PUBLIC_IP>:/tmp/
ssh azureuser@<PUBLIC_IP>
```

On VM:

```bash
cd /tmp
unzip prosper_ntrip_caster_azure_v1.0.zip
cd prosper_ntrip_caster_azure_v1.0
sudo ./scripts/install_ubuntu.sh
```

## Create credentials

Generate five strong test secrets:

```bash
openssl rand -hex 24
openssl rand -hex 24
openssl rand -hex 24
openssl rand -hex 24
openssl rand -hex 24
```

Create `/etc/prosper-ntrip/caster.env`:

```bash
sudo tee /etc/prosper-ntrip/caster.env >/dev/null <<'ENV'
CASTER_ADMIN_PASSWORD=REPLACE_ADMIN_SECRET
NTRIP_SOURCE_PASSWORD=REPLACE_SOURCE_SECRET
NTRIP_RS01_PASSWORD=REPLACE_RS01_SECRET
NTRIP_RS02_PASSWORD=REPLACE_RS02_SECRET
NTRIP_LAB_ROVER_PASSWORD=REPLACE_LAB_ROVER_SECRET
ENV
sudo chown root:root /etc/prosper-ntrip/caster.env
sudo chmod 600 /etc/prosper-ntrip/caster.env
```

## Install Certbot

```bash
sudo apt update
sudo apt install -y snapd
sudo snap install core
sudo snap refresh core
sudo snap install --classic certbot
sudo ln -sf /snap/bin/certbot /usr/local/bin/certbot
```

After DNS resolves to the VM:

```bash
sudo certbot certonly --standalone \
  -d rtk.prosperinfotech.com \
  -m YOUR_EMAIL_ADDRESS \
  --agree-tos \
  --no-eff-email
```

Install the copy/restart hook:

```bash
cd /opt/prosper-ntrip-caster
sudo ./scripts/install_certbot_deploy_hook.sh rtk.prosperinfotech.com
```

Test renewal:

```bash
sudo certbot renew --dry-run
```

## Start caster

```bash
sudo systemctl enable --now prosper-ntrip-caster
sudo systemctl status prosper-ntrip-caster --no-pager
```

Tail logs:

```bash
sudo journalctl -u prosper-ntrip-caster -f
```

## Test HTTPS/TLS health

```bash
curl -sS https://rtk.prosperinfotech.com/health
```

Expected: `{"status":"ok",...}`

Authenticated status:

```bash
curl -sS -u admin:'YOUR_ADMIN_SECRET' https://rtk.prosperinfotech.com/status | jq
```

Before the Base connects, `source_connected` is false.

## Connect physical Base

On the CM4/Ubuntu Base system using Prosper RTK Services v1.2:

```bash
cd ~/Documents/RTK/prosper_rtk_services_v1.2
source .venv/bin/activate
export NTRIP_SOURCE_PASSWORD='YOUR_SOURCE_SECRET'
prosper-rtk --config config/base-ntrip-azure.yaml
```

For the Texas validation use survey-in. After the survey becomes valid, caster status should show the source connected and bytes_in increasing.

## Connect Rover

On Rover system:

```bash
cd ~/Documents/RTK/prosper_rtk_services_v1.2
source .venv/bin/activate
export NTRIP_ROVER_USERNAME='LAB-ROVER'
export NTRIP_ROVER_PASSWORD='YOUR_LAB_ROVER_SECRET'
prosper-rtk --config config/rover-ntrip-azure.yaml
```

Monitor:

```bash
watch -n 1 'curl -s http://127.0.0.1:8081/api/v1/position | jq "{latitude_deg,longitude_deg,num_satellites,carrier_solution,carrier_solution_text,differential_solution,correction_age_s,last_rtcm_utc}"'
```

Expected final state: `carrier_solution=2`, `carrier_solution_text=RTK FIXED`, `differential_solution=true`.

## Azure status during test

```bash
curl -sS -u admin:'YOUR_ADMIN_SECRET' https://rtk.prosperinfotech.com/status | jq
```

Expected:
- `source_connected: true`
- `connected_rovers: 1`
- `bytes_in` increasing
- `bytes_out` increasing
- `rtcm_age_s` low

## WAN proof

After the first test works, put the Rover machine on a cellular/mobile hotspot while the Base remains on the normal home Internet. Do not change the configuration. It must reacquire RTK FIXED through Azure.

## India deployment delta

At Sarveshwar CFS:
1. Install the permanent Base antenna and ZED-F9P + CM4.
2. Establish the permanent surveyed Base coordinate.
3. Change Base config from `survey_in` to `fixed` and enter latitude, longitude, and ellipsoid height.
4. Use stable `/dev/serial/by-id/...` for the F9P.
5. Keep Azure host, port, mountpoint and Rover credentials unchanged.
6. Deploy Rover ZED-F9P + Jetson on each Reach Stacker.
