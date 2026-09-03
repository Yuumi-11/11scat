# 11scat-web deployment

GitHub Actions builds each `main` commit and pushes two GHCR tags:

- `ghcr.io/yuumi-11/11scat-web:<full-git-sha>` (immutable deployment tag)
- `ghcr.io/yuumi-11/11scat-web:latest` (current branch head)

The VPS does not build application images and does not retain source releases or
deployment archives. Persistent application data remains at
`/opt/11scat-data:/data`. Secrets remain only in
`/opt/11scat-web/identity.env`.

The package stays private. GitHub Actions connects with a dedicated SSH key that
is forced server-side to run only `ci-deploy.sh`. The workflow's short-lived
`GITHUB_TOKEN` is streamed to that command for the GHCR pull and held in a
temporary Docker configuration directory, which is deleted when deployment
finishes. No persistent GHCR credential is stored on the VPS.

## Deploy

Copy the scripts to `/opt/11scat-web`, then run as root:

```bash
/opt/11scat-web/deploy.sh <full-git-sha>
```

The script refuses to deploy when `/` is at least 85% full. It pulls the exact
SHA image, tests it on `127.0.0.1:3101`, verifies the `/data` bind mount, replaces
the production container on `127.0.0.1:3100`, checks both the local and public
HTTP endpoints, and restores the old image automatically if verification fails.

After success, only the current and immediately previous application images are
retained. Cleanup is restricted to stopped containers beginning with known
`11scat-web` deployment prefixes, the local/GHCR `11scat-web` image repositories,
`/tmp/11scat-*`, and legacy artifacts directly inside `/opt/11scat-web`.
No global Docker prune command is used.

## Roll back

```bash
/opt/11scat-web/rollback.sh
```

The rollback target is tested on port 3101 before the production container is
recreated. The same environment file, persistent data mount, log limits, and
health checks are used. The current and previous image references are then
swapped, so the operation can be reversed once more if required.
