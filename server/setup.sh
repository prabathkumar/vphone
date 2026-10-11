#!/bin/bash
# VPhone Server Bootstrap Script
# Runs on first boot via cloud-init on Ubuntu 22.04 ARM
set -e

LOG="/var/log/vphone-setup.log"
exec > >(tee -a "$LOG") 2>&1
echo "=== VPhone setup started at $(date) ==="

# --- System update ---
apt-get update -y
apt-get upgrade -y
apt-get install -y \
  curl wget git unzip \
  qemu-kvm libvirt-daemon-system libvirt-clients bridge-utils \
  cpu-checker virtinst \
  docker.io docker-compose \
  nodejs npm \
  nginx certbot python3-certbot-nginx \
  coturn

# --- Enable KVM for Android virtualisation ---
systemctl enable --now libvirtd
usermod -aG kvm,libvirt ubuntu

# --- Docker ---
systemctl enable --now docker
usermod -aG docker ubuntu

# --- Node.js 20 ---
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# --- TURN server config (coturn) ---
cat > /etc/turnserver.conf <<'TURN'
listening-port=3478
tls-listening-port=5349
fingerprint
lt-cred-mech
realm=vphone.app
server-name=vphone.app
log-file=/var/log/coturn/turn.log
simple-log
no-multicast-peers
TURN

systemctl enable coturn

# --- Android-x86 image download (deferred — needs manual trigger) ---
# Will download Android 13 x86_64 ISO on first vPhone launch
mkdir -p /opt/vphone/android-images
mkdir -p /opt/vphone/instances
mkdir -p /opt/vphone/sessions

# --- scrcpy-server jar download ---
SCRCPY_VERSION="2.4"
ASSETS_DIR="/opt/vphone/server/assets"
mkdir -p "$ASSETS_DIR"
if [ ! -f "$ASSETS_DIR/scrcpy-server.jar" ]; then
  echo "Downloading scrcpy-server v${SCRCPY_VERSION}..."
  wget -q -O "$ASSETS_DIR/scrcpy-server.jar" \
    "https://github.com/Genymobile/scrcpy/releases/download/v${SCRCPY_VERSION}/scrcpy-server-v${SCRCPY_VERSION}"
  echo "scrcpy-server.jar downloaded to $ASSETS_DIR"
fi

# --- ADB install ---
apt-get install -y android-tools-adb

# --- ffmpeg (for scrcpy H.264 → I420 conversion in bridge) ---
apt-get install -y ffmpeg

# --- Pull and start VPhone server ---
mkdir -p /opt/vphone/server
# Code is deployed via CI/CD — see .github/workflows/deploy.yml

echo "=== VPhone setup complete at $(date) ==="
echo "Next steps:"
echo "  1. Set TURN server credentials in /etc/turnserver.conf"
echo "  2. Run: cd /opt/vphone/server && npm install && npm start"
echo "  3. Configure Nginx reverse proxy with SSL"
