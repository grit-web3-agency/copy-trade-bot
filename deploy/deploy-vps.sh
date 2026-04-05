#!/usr/bin/env bash
# Deploy script for grit-web3-agency/copy-trade-bot
# NOTE: This script only prepares and starts the app under PM2 on a remote VPS.
# Do NOT run locally unless you understand the environment. This script is
# intended to be run on the VPS as root or a sudoer account (or invoked by CI).

set -euo pipefail

APP_DIR=${1:-/home/ubuntu/copy-trade-bot}
REPO_URL=${2:-https://github.com/grit-web3-agency/copy-trade-bot.git}
BRANCH=${3:-main}
NODE_VERSION=${NODE_VERSION:-22}
PM2_APP_NAME=${PM2_APP_NAME:-copy-trade-bot}

echo "Deploying ${REPO_URL} (branch ${BRANCH}) to ${APP_DIR}"

# 0. Preconditions
if [ "$(id -u)" -ne 0 ]; then
  echo "Warning: not running as root. Some steps may require sudo. Proceeding anyway."
fi

# 1. Ensure git is available
command -v git >/dev/null 2>&1 || { echo "git not found. Install git first."; exit 1; }

# 2. Ensure nvm or node is present (simple check)
if ! command -v node >/dev/null 2>&1 || [ "$(node -v 2>/dev/null | sed 's/^v//')" != "${NODE_VERSION}" ]; then
  echo "Node ${NODE_VERSION} not found. Install Node ${NODE_VERSION} before running this script."
  echo "Recommended: install nvm and 'nvm install ${NODE_VERSION}' then 'nvm use ${NODE_VERSION}'."
  # do not auto-install to avoid destructive changes
fi

# 3. Clone or update repo
if [ -d "${APP_DIR}/.git" ]; then
  echo "Repository exists. Fetching and resetting to ${BRANCH}."
  git -C "${APP_DIR}" fetch origin
  git -C "${APP_DIR}" checkout "${BRANCH}"
  git -C "${APP_DIR}" reset --hard "origin/${BRANCH}"
else
  echo "Cloning repository into ${APP_DIR}"
  git clone --depth=1 --branch "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
fi

cd "${APP_DIR}"

# 4. Install dependencies
if [ -f package-lock.json ] || [ -f package.json ]; then
  echo "Installing npm dependencies (ci if lockfile present)."
  if [ -f package-lock.json ]; then
    npm ci --no-audit --no-fund
  else
    npm install --no-audit --no-fund
  fi
fi

# 5. Build
if [ -f tsconfig.json ]; then
  echo "Building TypeScript project"
  npm run build || echo "Build failed (non-zero exit). Check logs."
fi

# 6. Start with PM2 (idempotent)
if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 not installed. Install pm2 globally (npm i -g pm2) or run as service manager."
  exit 0
fi

# Define start command (adjust as needed)
START_CMD="npm run start:prod"

# Use PM2 to start or reload
if pm2 list | grep -q "${PM2_APP_NAME}"; then
  echo "Reloading existing PM2 process ${PM2_APP_NAME}"
  pm2 reload "${PM2_APP_NAME}" || pm2 restart "${PM2_APP_NAME}"
else
  echo "Starting new PM2 process ${PM2_APP_NAME}"
  pm2 start --name "${PM2_APP_NAME}" --cwd "${APP_DIR}" --interpreter node -- ${START_CMD}
fi

# 7. Save PM2 process list for startup
pm2 save || echo "pm2 save failed (non-fatal)"

echo "Deploy script finished. DO NOT FORGET: set required env vars (RPC keys, BOT keys) securely."
