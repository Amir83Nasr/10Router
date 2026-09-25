# Docker

Run 10Router in a container. Published image: [`amir83nasr/10router`](https://hub.docker.com/r/amir83nasr/10router) — multi-platform `linux/amd64` + `linux/arm64`.

---

# 👤 For Users

## Quick start

```bash
docker run -d \
  -p 20128:20128 \
  -v "$HOME/.10router:/app/data" \
  -v "$HOME:/host-home:rw" \
  -e DATA_DIR=/app/data \
  -e HOST_HOME=/host-home \
  --name 10router \
  amir83nasr/10router:latest
```

The `/host-home` mount + `HOST_HOME` let the `CLI Tools` page detect and
configure the host's CLIs (see below). Without them that page falls back to
manual copy mode.

App listens on port `20128`. Open: http://localhost:20128

## Manage container

```bash
docker logs -f 10router        # view logs
docker stop 10router           # stop
docker start 10router          # start again
docker rm -f 10router          # remove
```

## Data persistence

```bash
-v "$HOME/.10router:/app/data" \
-e DATA_DIR=/app/data
```

Without `DATA_DIR`, the app falls back to `~/.10router/` (macOS/Linux) or `%APPDATA%\10router\` (Windows). In the container, `DATA_DIR=/app/data` makes the bind mount work.

Data layout under `$DATA_DIR/`:

```text
$DATA_DIR/
├── db/
│   ├── data.sqlite       # main SQLite database
│   └── backups/          # auto backups
└── ...                   # certs, logs, runtime configs
```

Host path: `$HOME/.10router/db/data.sqlite`
Container path: `/app/data/db/data.sqlite`

## Optional env vars

```bash
docker run -d \
  -p 20128:20128 \
  -v "$HOME/.10router:/app/data" \
  -e DATA_DIR=/app/data \
  -e PORT=20128 \
  -e HOSTNAME=0.0.0.0 \
  -e DEBUG=true \
  --name 10router \
  amir83nasr/10router:latest
```

## CLI tools page (manual setup in Docker)

The `CLI Tools` dashboard page works in Docker via a host-home mount.
`compose.yml` mounts `$HOME:/host-home:rw` and sets
`HOST_HOME=/host-home`, so detection + Apply/Reset operate on the host's real
configs (`~/.claude/settings.json`, `~/.codex/config.toml`, …). Without
`HOST_HOME` (plain `docker run` without the mount) the page shows
"Manual setup" with a copyable config, and Apply/Reset are disabled
(HTTP 409).

> ⚠️ The container writes directly into your host home. Keep the bind mount;
> removing it reverts the page to manual mode.

## Optional Headroom sidecar

The 10Router image does not bundle Python or Headroom. To use Headroom in Docker, run it as a separate service and point 10Router at that proxy:

```yaml
services:
  10router:
    image: amir83nasr/10router:latest
    ports:
      - "20128:20128"
    volumes:
      - "$HOME/.10router:/app/data"
    environment:
      DATA_DIR: /app/data
      HEADROOM_URL: http://headroom:8787
    depends_on:
      - headroom

  headroom:
    image: ghcr.io/chopratejas/headroom:latest
    ports:
      - "8787:8787"
```

In the dashboard, open `Endpoint` → `Token Saver` → `Headroom`, confirm the URL is `http://headroom:8787`, recheck status, then enable Headroom.

If Headroom runs on the Docker host instead of as a sidecar, use `http://host.docker.internal:8787` on macOS/Windows. On Linux, add `--add-host=host.docker.internal:host-gateway` or the equivalent compose `extra_hosts` entry.

## Update to latest

npm (recommended):

```bash
npm install -g @amir83nasr/10router@latest
10router stop && 10router start
```

Docker:

```bash
docker pull amir83nasr/10router:latest
docker rm -f 10router
# re-run the quick start command
```

---

# 🛠 For Developers

## Dev with hot-reload (`compose.dev.yml`)

Production (`compose.yml`) serves the prebuilt standalone image — every
code change needs a rebuild. For local dev, use the overlay file:

```bash
docker compose -f compose.dev.yml up -d --build   # first time (installs deps)
docker logs -f 10router-dev                        # watch Next dev output
```

What it does:

- Mounts the repo (`.`) into `/app` and runs `next dev` — host edits
  hot-reload in seconds, no rebuild.
- `node_modules` / `.next` stay in named volumes: the container's Linux
  natives don't get clobbered by the host's macOS binaries and vice versa.
- Same mounts as prod (`$HOME/.10router:/app/data`, `$HOME:/host-home:rw` +
  `HOST_HOME`) so DATA_DIR and the CLI Tools page behave identically.
- `WATCHPACK_POLLING=true` — bind mounts don't emit fs events reliably, so
  Next polls for changes instead.
- Separate container name (`10router-dev`) and image tag (`10router:dev`) —
  dev and prod never fight over the same container.

```bash
docker compose -f compose.dev.yml down              # stop dev
docker compose up -d                                # back to prod
docker compose -f compose.dev.yml down -v           # stop + drop dev volumes (fresh install next time)
```

> First `up` still runs `pnpm install` inside the container (slow once).
> Later runs reuse the `10router-dev-node_modules` volume and start fast.

## Build image locally (test)

```bash
docker build -t 10router .   # from repo root
docker run --rm -p 20128:20128 \
  -v "$HOME/.10router:/app/data" \
  -e DATA_DIR=/app/data \
  10router
```

## Publish (automatic via CI)

Push a git tag `v*` → GitHub Actions builds multi-platform (amd64+arm64) and pushes to:

- `ghcr.io/amir83nasr/10router:v{version}` + `:latest`
- `amir83nasr/10router:v{version}` + `:latest`

```bash
git tag v0.4.x && git push origin v0.4.x
```

Workflow: `.github/workflows/docker-publish.yml`
