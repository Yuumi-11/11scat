#!/usr/bin/env bash
set -Eeuo pipefail

read -r action version actor extra <<< "${SSH_ORIGINAL_COMMAND:-}"
if [[ "$action" != "deploy" \
  || ! "$version" =~ ^[0-9a-f]{40}$ \
  || ! "$actor" =~ ^[A-Za-z0-9-]{1,39}$ \
  || -n "${extra:-}" ]]; then
  echo "This SSH key may only deploy an exact 11scat-web Git SHA." >&2
  exit 2
fi

token="$(cat)"
if [[ -z "$token" ]]; then
  echo "Missing ephemeral GHCR credential." >&2
  exit 3
fi

docker_config="$(mktemp -d)"
cleanup() {
  token=""
  rm -rf -- "$docker_config"
}
trap cleanup EXIT
export DOCKER_CONFIG="$docker_config"

printf '%s' "$token" | docker login ghcr.io --username "$actor" --password-stdin >/dev/null
token=""

IMAGE_REPOSITORY=ghcr.io/yuumiqwq/11scat-web \
  /opt/11scat-web/deploy.sh "$version"
