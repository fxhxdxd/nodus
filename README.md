# Nodus

Cross-platform MCP context server: a shared, persistent memory brain for
**Cursor**, **Claude Code**, and **Codex** (or any MCP-capable agent), backed
by SQLite and served over both MCP transports, with a built-in web dashboard.

Ask one AI surface to remember something; every other connected surface can
read it.

## Architecture

```
┌─────────┐  ┌─────────────┐  ┌───────┐        ┌─────────────────┐
│ Cursor  │  │ Claude Code │  │ Codex │        │  Browser (you)  │
└────┬────┘  └──────┬──────┘  └───┬───┘        └────────┬────────┘
     │ SSE          │ SSE         │ streamable HTTP     │ REST + static
     ▼              ▼             ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Express server (:3939)                       │
│  /sse + /messages   /mcp        /api/*        / (dashboard)     │
│         └──────────────┴─── MCP tools ───┐                      │
│              query_nodus_state           │                      │
│              update_nodus_state          ▼                      │
│                                   SQLite (data/nodus.db)        │
└─────────────────────────────────────────────────────────────────┘
```

**The Registry Pattern.** Exactly two MCP tools are exposed, so LLM clients
pay a minimal, constant context cost no matter how much is stored:

| Tool | Input | Purpose |
| --- | --- | --- |
| `query_nodus_state` | `{ domain, query }` | Read context. Exact key match, `"*"` lists a domain, anything else is a substring search. |
| `update_nodus_state` | `{ domain, key, value }` | Upsert context by `(domain, key)`. |

## Project layout

```
src/
  index.ts          entrypoint
  app.ts            Express assembly (middleware, routes, static)
  config.ts         env-driven configuration (port, paths, log level)
  logger.ts         structured, level-based logging
  db.ts             SQLite persistence layer
  mcp/
    server.ts       MCP server factory (the two registry tools)
    transports.ts   SSE (legacy) + streamable HTTP transports
  api/
    router.ts       dashboard REST API + eval SSE stream
  eval/
    suite.ts        shared 10-case benchmark suite
    harness.ts      CLI harness (npm run eval)
ui/                 React + Vite + Tailwind dashboard
scripts/            generate-configs.js
deploy/             macOS LaunchAgent for always-on serving
examples/           generated client config samples
data/               SQLite database (gitignored, created on boot)
```

## Quickstart

```bash
npm install
npm --prefix ui install
npm run build        # compile backend (tsc) + build dashboard (vite)
npm start            # MCP endpoints + dashboard on http://localhost:3939
```

Open **http://localhost:3939** for the dashboard:

- **Connect** — copyable install snippets for every client
- **Memory Explorer** — live view of the store, with delete controls
- **Eval Harness** — one-click benchmark with a live latency/payload chart

## Connecting clients

| Client | Transport | Setup |
| --- | --- | --- |
| Cursor | SSE | `.cursor/mcp.json` in this repo (auto-detected for this workspace) |
| Claude Code | SSE | `claude mcp add --transport sse nodus http://localhost:3939/sse` |
| Codex (CLI or app) | Streamable HTTP | `codex mcp add nodus --url http://localhost:3939/mcp` |
| Claude Desktop | stdio → SSE bridge | merge `examples/claude_desktop_config.json` into the app's config |

Regenerate the config files with `npm run generate-configs`. For raw-protocol
integration (custom agents), the server speaks standard MCP: legacy HTTP+SSE
on `GET /sse` + `POST /messages?sessionId=...`, and streamable HTTP on `/mcp`.

## HTTP surface

| Route | Purpose |
| --- | --- |
| `GET /sse`, `POST /messages` | MCP over legacy HTTP+SSE |
| `ALL /mcp` | MCP over streamable HTTP |
| `GET /health` | liveness + active session counts |
| `GET /api/nodes` | list all context nodes |
| `DELETE /api/nodes/:id` | delete a node |
| `GET /api/stats` | node/domain counts + DB size |
| `GET /api/eval/stream` | run the benchmark, streamed as SSE |
| `GET /` | dashboard (built `ui/dist`) |

## Evaluation

`npm run eval` (server must be running) connects as a real MCP client and
runs the 10-case suite, reporting per-call round-trip latency and the exact
byte-size of each JSON payload, plus summary percentiles. The dashboard's
Eval Harness tab streams the same suite via `/api/eval/stream`.

## Development

```bash
npm run dev                # backend with tsx (same as start)
npm --prefix ui run dev    # dashboard with hot reload on :5173 (proxies /api + MCP)
npm run typecheck          # strict TS across the backend
```

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `NODUS_PORT` | `3939` | HTTP port |
| `NODUS_DATA_DIR` | `./data` | directory for the SQLite DB |
| `NODUS_DB_PATH` | `<data dir>/nodus.db` | exact DB file path |
| `NODUS_LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |

## Always-on serving (macOS)

Clients can only connect while the server runs. To start it at login and
keep it alive:

```bash
cp deploy/com.nodus.server.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.nodus.server.plist
```

Logs: `~/Library/Logs/nodus.log`. Remove with
`launchctl bootout gui/$(id -u)/com.nodus.server`.
