#!/usr/bin/env bash
set -euo pipefail

usage="$(df -P / | awk 'NR == 2 { gsub(/%/, "", $5); print $5 }')"

if (( usage >= 90 )); then
  level="EMERGENCY"
elif (( usage >= 85 )); then
  level="DANGER"
elif (( usage >= 75 )); then
  level="WARNING"
elif (( usage < 70 )); then
  level="NORMAL"
else
  level="ELEVATED"
fi

printf '11scat disk guard: %s (%s%% used on /)\n' "$level" "$usage"

if [[ "${1:-}" == "--before-deploy" ]] && (( usage >= 85 )); then
  echo "Deployment stopped: root filesystem usage is at or above 85%." >&2
  exit 85
fi
