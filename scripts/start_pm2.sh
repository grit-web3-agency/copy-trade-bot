#!/usr/bin/env bash
# PM2 start script (instructions)
# This script is provided for documentation/automation on the VPS.
# DO NOT RUN ON LOCAL MACHINE UNLESS YOU KNOW WHAT YOU'RE DOING.

set -euo pipefail

# Example steps to deploy on a remote VPS (do not run as part of this sprint):
# 1) Clone the repo on the VPS (HTTPS):
#    git clone https://github.com/grit-web3-agency/copy-trade-bot.git
#    cd copy-trade-bot
# 2) Install dependencies:
#    npm ci
# 3) Copy .env with BOT_TOKEN and HELIUS_API_KEY to the server (securely).
# 4) Start with PM2 using the ecosystem config included in this repo:
#    pm2 start ecosystem.config.js --env production
# 5) Check logs:
#    pm2 logs copy-trade-bot
# 6) To update code:
#    git pull && npm ci && pm2 restart copy-trade-bot

echo "PM2 start instructions are in this script. This file is for documentation only."
