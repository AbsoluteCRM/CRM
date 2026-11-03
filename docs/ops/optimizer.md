# Route optimizer (VROOM + OSRM)

Route Builder's **Optimize routes** button orders each open route's stops by real road travel time. The app does not solve anything itself: it calls a self-hosted [VROOM](https://github.com/VROOM-Project/vroom) solver, which uses an [OSRM](https://project-osrm.org/) road-network server for travel times. There are no per-request fees. Design: [ADR 0015](../database/decisions/0015-optimizer-integration.md); plan: [route-optimizer.md](../plans/route-optimizer.md).

Nothing here is required. With `OPTIMIZER_PROVIDER` unset (or `none`), the button is disabled with an explanation and routes keep the straight-line order from **Build routes**. Hosting is a separate decision: this page is a starting point, and the app was not tested against a live solver when it was written.

## What the app sends

For a date's `draft` and `optimized` routes: each crew's start and end location, the route's planned start (`default_start_time`), the shift length (`max_work_minutes`, 12 hours when unset), and each stop's property location, visit duration and arrival window. Stops stay with their crew. Locked stops keep their position. Published, in-progress and completed routes are never read for writing.

The request and the solver's answer are stored in `optimization_run_payloads` (service role only). Coordinates are not logged.

## Environment variables

Server only, in `.env.local` or the host's environment. See `.env.example`.

| Variable               | Meaning                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `OPTIMIZER_PROVIDER`   | `none` (default) or `vroom`                                                                                              |
| `VROOM_URL`            | VROOM's base URL, e.g. `http://vroom:3000`. Required for `vroom`                                                         |
| `OSRM_URL`             | OSRM's base URL, e.g. `http://osrm:5000`. Optional, but needed to re-time routes with locked stops, and used for drawing |
| `OPTIMIZER_TIMEOUT_MS` | Per-call timeout, 1000 to 120000. Default 30000                                                                          |

Also needed: `SUPABASE_SERVICE_ROLE_KEY`, because the runner records runs and writes results with the service role. Without `OSRM_URL`, a route that has locked stops is left unchanged and the run says so. Without a reachable solver the run is recorded as failed with a plain message and no route changes.

Keep VROOM and OSRM on a private network. They have no authentication. Only the app server needs to reach them.

The app runs the solver call in the server process after the request returns (single self-hosted Node server). A serverless host would cut it off; move the runner behind a queue if hosting changes.

## docker-compose example

Alberta is a single extract from Geofabrik ([download.geofabrik.de/north-america/canada/alberta.html](https://download.geofabrik.de/north-america/canada/alberta.html)). Use the Alberta file for Alberta crews, or `canada-latest` for wider coverage.

```bash
mkdir -p osrm-data && cd osrm-data
curl -LO https://download.geofabrik.de/north-america/canada/alberta-latest.osm.pbf

# One-time preparation (multi-level Dijkstra). Needs about 4 GB of RAM for Alberta.
docker run --rm -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-extract -p /opt/car.lua /data/alberta-latest.osm.pbf
docker run --rm -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-partition /data/alberta-latest.osrm
docker run --rm -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-customize /data/alberta-latest.osrm
```

```yaml
# docker-compose.yml
services:
  osrm:
    image: ghcr.io/project-osrm/osrm-backend:v5.27.1
    command: osrm-routed --algorithm mld --max-table-size 1000 /data/alberta-latest.osrm
    volumes:
      - ./osrm-data:/data:ro
    restart: unless-stopped
    # No published ports: only VROOM and the app reach it.

  vroom:
    image: ghcr.io/vroom-project/vroom-docker:v1.14.0
    environment:
      VROOM_ROUTER: osrm
    volumes:
      - ./vroom-conf:/conf
    depends_on:
      - osrm
    restart: unless-stopped
    ports:
      - '127.0.0.1:3000:3000'
```

Create `vroom-conf/config.yml` with the router pointing at the `osrm` service:

```yaml
cliArgs:
  geometry: true
  planmode: false
  threads: 4
  explore: 5
  limit: '1mb'
  logdir: '/..'
  logsize: '100M'
  maxlocations: 1000
  maxvehicles: 200
  override: true
  path: ''
  port: 3000
  router: 'osrm'
  timeout: 300000
routingServers:
  osrm:
    car:
      host: 'osrm'
      port: '5000'
```

Image tags above were current when this was written; check for newer releases. If the app runs outside Docker, publish OSRM on `127.0.0.1:5000` too and set:

```
OPTIMIZER_PROVIDER=vroom
VROOM_URL=http://localhost:3000
OSRM_URL=http://localhost:5000
```

Check it: `curl http://localhost:3000/health` should answer, and Optimize routes on a date with a draft route should finish in seconds.

## Data refresh

Roads change slowly. Rebuild the OSRM files from a fresh extract about **monthly** (Geofabrik updates daily), or when a major road opens or closes in the service area. To refresh: download the new `.osm.pbf`, run the three prepare commands into a new directory, then restart the `osrm` container on it. Routes already optimized keep their stored times; run Optimize again to refresh them.

## Resource sizing

- **OSRM, Alberta extract**: preparing needs roughly 4 to 8 GB of RAM and a few tens of minutes; serving needs about 2 to 4 GB RAM and little CPU. `canada-latest` needs several times more.
- **VROOM**: light. A day of a few crews and a few hundred stops solves in seconds on 1 to 2 vCPUs and under 1 GB.
- Start with a 2 vCPU, 8 GB machine for Alberta; prepare the data elsewhere if the host is smaller, then copy the `.osrm*` files over.

## Troubleshooting

| Symptom (run error)                            | Likely cause                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| "No route optimizer is set up on this server." | `OPTIMIZER_PROVIDER` is unset or `none`                                |
| "its address is not set"                       | `OPTIMIZER_PROVIDER=vroom` without `VROOM_URL`                         |
| "could not be reached" / "did not answer"      | Solver down, wrong URL, or a timeout too short for the day's size      |
| "returned an error (HTTP 4xx/5xx)"             | VROOM rejected the request, often a location off the OSRM map extract  |
| "unexpected response"                          | A proxy in the way, or a VROOM version with a different response shape |
| Routes with locked stops left as they were     | `OSRM_URL` is not set                                                  |

Run rows (with the raw request and response in `optimization_run_payloads`) are the audit trail; read them with the service role.
