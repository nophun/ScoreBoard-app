#!/usr/bin/env bash
set -euo pipefail

# Installer script for systemd service on Raspberry Pi OS / Debian
# Run on the Pi as a user with sudo: `sudo ./install-systemd.sh`

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_BIN="$(which node || echo /usr/bin/node)"
SERVICE_NAME=scoreboard
SERVICE_FILE=/etc/systemd/system/${SERVICE_NAME}.service

echo "Installing systemd service '${SERVICE_NAME}' for app at: ${APP_DIR}"

sudo tee ${SERVICE_FILE} > /dev/null <<EOF
[Unit]
Description=ScoreBoard App (Node.js)
After=network.target

[Service]
Environment=NODE_ENV=production
WorkingDirectory=${APP_DIR}
ExecStart=${NODE_BIN} ${APP_DIR}/server.js
Restart=always
RestartSec=5
# Change 'pi' to the appropriate user if needed
User=noserver

[Install]
WantedBy=multi-user.target
EOF

echo "Reloading systemd and enabling service..."
sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_NAME}.service
sudo systemctl start ${SERVICE_NAME}.service

echo "Service '${SERVICE_NAME}' started. Check status with:"
echo "  sudo systemctl status ${SERVICE_NAME}.service"

echo "To stop/remove the service:"
echo "  sudo systemctl stop ${SERVICE_NAME}.service"
echo "  sudo systemctl disable ${SERVICE_NAME}.service"
