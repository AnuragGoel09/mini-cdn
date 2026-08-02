# Mini CDN

A miniature, real multi-region CDN: real edge caching, real cross-region
latency-based routing, real cache invalidation and failover — with a live
dashboard that visualizes requests as they route across regions.

```
Client browser → Router (geo + latency routing) → Edge node (cache) → Origin
                        ↓ WebSocket events
                  Dashboard UI (live map)
```

Four services:

| Service | What it does | Local port |
|---|---|---|
| `origin-service` | Source of truth for files, computes ETags | 8080 |
| `edge-service` | LRU + TTL cache in front of the origin (run 3–4x, once per region) | 8091 / 8092 / 8093 (local) |
| `router-service` | Latency probing, routing decisions, WebSocket event stream, admin/failover | 8082 |
| `dashboard` | React/Leaflet live map + controls | 5173 |

---

## 1. Run it all locally

Requires **Java 17+**, **Maven 3.9+**, and **Node 18+**.

### 1.1 Start the origin

```bash
cd origin-service
mvn spring-boot:run
```

Verify: `curl http://localhost:8080/files` should list the sample files.

### 1.2 Start three edge nodes (different ports, "fake" regions)

Each edge node needs its own port + region label. Open three terminals:

```bash
# terminal 2 — "virginia"
cd edge-service
PORT=8091 REGION=virginia ORIGIN_URL=http://localhost:8080 \
CACHE_MAX_ENTRIES=200 CACHE_TTL_SECONDS=60 \
mvn spring-boot:run

# terminal 3 — "frankfurt"
cd edge-service
PORT=8092 REGION=frankfurt ORIGIN_URL=http://localhost:8080 \
CACHE_MAX_ENTRIES=200 CACHE_TTL_SECONDS=60 \
mvn spring-boot:run

# terminal 4 — "singapore"
cd edge-service
PORT=8093 REGION=singapore ORIGIN_URL=http://localhost:8080 \
CACHE_MAX_ENTRIES=200 CACHE_TTL_SECONDS=60 \
mvn spring-boot:run
```

Verify each: `curl http://localhost:8091/health`, then
`curl -i http://localhost:8091/cdn/hello.txt` twice — the first response
should have `X-Cache: MISS`, the second `X-Cache: HIT`.

### 1.3 Start the router

The router's `application.yml` already points at `localhost:8091/8092/8093`
for local runs, so no env vars are required:

```bash
cd router-service
mvn spring-boot:run
```

Verify: `curl http://localhost:8082/nodes` should list all three edges.
Give it ~5s for the first latency probe cycle, then:

```bash
curl -i "http://localhost:8082/route/hello.txt?overrideRegion=mumbai"
```

You should see `X-Cache-Node` telling you which edge served it, and the
router should have picked the lowest-latency (or, before the first probe,
geographically nearest) node.

### 1.4 Start the dashboard

```bash
cd dashboard
npm install
npm run dev
```

Open the printed local URL (usually `http://localhost:5173`). The default
`VITE_ROUTER_URL` is `http://localhost:8082`, matching the router above — no
`.env` needed for a local run. If you want the file dropdown to reflect the
real origin file list instead of the built-in fallback list, set:

```bash
# dashboard/.env
VITE_ORIGIN_URL=http://localhost:8080
```

**Demo flow:** pick a simulated client location → click "request file" →
watch the animated packet travel from the client marker to the chosen edge
node on the map, colored green (HIT) or amber (MISS) → click "invalidate
cache" and request again to see the MISS → click "kill" on a node to force
failover and request again to see the router pick a different node.

---

## 2. Deploy for real — genuinely $0

**Use Render.com, not Fly.io, unless you already have a pre-October-2024 Fly
account.** Fly removed its free tier for new accounts in October 2024; new
signups get a short trial and then pay per second. Render still has a real,
indefinite free tier (no credit card, 750 shared instance-hours/month) and
deploys straight from the Dockerfiles already in this repo.

**The one real tradeoff:** Render doesn't have a Mumbai region. The closest
is Singapore, so the edges below deploy to Virginia, Frankfurt, and
Singapore instead of the bom/fra/iad set used for local dev. This is fine —
arguably more realistic, since real CDNs don't have a PoP in every city
either. The dashboard's "simulate client location" dropdown still lets you
pick Mumbai; the router will correctly send that traffic to Singapore, the
nearest real deployed edge.

Also worth knowing: free Render web services **sleep after 15 minutes idle**
and take 30-60s to wake on the next request. If nobody's had the dashboard
open for a while, the first load after that will be slow across every
service that went to sleep — expected, not a bug. Once someone has the
dashboard open, the router's own health probe (every 5s) and the dashboard's
node polling (every 3s) keep everything else awake.

### 2.1 One-click-ish deploy via Blueprint

This repo includes `render.yaml` at the root, defining all 6 services
(origin, 3 edges, router, dashboard) at once.

1. Push this repo to GitHub (or GitLab).
2. Edit `render.yaml`: replace every `YOUR_GITHUB_USERNAME/YOUR_REPO_NAME`
   with your actual repo path.
3. In the Render dashboard: **New +** → **Blueprint** → select the repo.
   Render proposes all 6 services from `render.yaml`.
4. Deploy. Render will assign each service a URL immediately (even before
   the build finishes), like `https://mini-cdn-origin.onrender.com`.
5. Go back into `render.yaml`, replace every `REPLACE_AFTER_FIRST_DEPLOY`
   placeholder with the real URLs Render assigned, commit, and push again
   (or edit the env vars directly in each service's Render dashboard page —
   faster for a one-time setup, since it skips a full redeploy of services
   that don't need code changes).
6. Confirm: `curl https://mini-cdn-router.onrender.com/nodes` should list
   all three edges with real `lat`/`lon`. Open the dashboard's URL and give
   it 30-60s on first load if everything was asleep.

### 2.2 If you already have a legacy Fly.io account

The original per-region `fly.<region>.toml` files are still in
`edge-service/` (`fly.virginia.toml`, `fly.frankfurt.toml`,
`fly.singapore.toml`), plus `fly.toml` in `origin-service/` and
`router-service/`. These work exactly as documented in Fly's own docs —
`fly launch --no-deploy --config fly.<region>.toml`, set secrets for
`ORIGIN_URL` / `EDGE_*_URL`, then `fly deploy`. Only use this path if Fly
is actually free for your account; check `fly.io/docs/about/pricing` first
if you're unsure which plan you're on.

### 2.3 Optional hardening: Oracle Cloud Always Free

If the 30-60s cold start on Render bothers you later, Oracle Cloud's
Always Free tier gives a genuinely permanent, always-on VM (2 OCPU / 12GB
RAM as of mid-2026) with no sleep — but it's locked to a single region per
account, so it can't replace the multi-region edges. It's only useful as a
never-sleeping home for `origin-service` + `router-service` (install
Docker on the VM, `docker build` + `docker run` the existing Dockerfiles
directly — no changes needed), while the 3 edges stay on Render. Treat this
as a later upgrade, not a first step; it adds real VM-ops work (SSH,
security lists, systemd) for a benefit that only matters once you're
sharing the link outside of scheduled demos.

---

## 3. Cost notes

- Every JVM service caps heap at `-Xmx256m` and skips heavy starters (no
  JPA/DB), which fits comfortably inside both Render's free 512MB/0.1 CPU
  web-service tier and a legacy Fly free allowance, if you have one.
- **Render (recommended, $0):** free web services sleep after 15 minutes
  idle and cold-start in 30-60s on the next request. That's the real
  tradeoff for $0 — there's no way to keep 5 free services "always warm"
  without paying for at least one always-on tier somewhere. Once the
  dashboard is open, the router's 5s health probe and the dashboard's own
  3s node polling keep everything else awake for as long as someone's
  looking at it.
- **Fly.io (only if you have a legacy pre-Oct-2024 account):** genuinely
  $0 on the old Hobby/Launch/Scale allowances, and `min_machines_running = 1`
  in each `fly.toml` keeps one instance always warm per region — no
  cold-start tradeoff, but this path doesn't exist for new accounts anymore.
  Verify your plan at `fly.io/docs/about/pricing` before relying on it.

## 4. What's intentionally out of scope

- No real file chunking/streaming or TLS termination (CDN-vendor-level depth).
- No DNS-based GeoDNS — the application-level routing in `router-service` is
  the whole point of this project.
- No pluggable eviction policies — one clean LRU implementation.
