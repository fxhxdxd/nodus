# Nodus

**One shared, persistent memory for all your AI coding tools.**

Nodus is a local [MCP](https://modelcontextprotocol.io) server that Cursor,
Claude Code, Codex, and any other MCP-capable agent can connect to at the
same time. Ask one tool to remember something — every other tool can recall
it. Context lives in SQLite on your machine and survives restarts, session
resets, and switching between tools.

A built-in web dashboard lets you browse the shared memory, delete stale
entries, benchmark the server, and copy ready-made connection snippets.

## Setup

**Prerequisite:** Node.js 20 or newer.

```bash
git clone https://github.com/fxhxdxd/nodus.git
cd nodus
npm install        # installs server + dashboard dependencies
npm run build      # compiles the server and builds the dashboard
npm start          # starts everything on http://localhost:3939
```

Then open **http://localhost:3939** in your browser. The **Connect** tab
walks you through hooking up each AI tool with copy-paste snippets that
already point at the right address — and the cards check themselves off
live as each tool connects, so you know setup worked.

> Different port? `NODUS_PORT=4000 npm start` — the dashboard and its
> snippets adapt automatically.

### Connect your tools (quick reference)

The dashboard shows these with copy buttons, pre-filled for your host/port:

| Tool | How |
| --- | --- |
| **Cursor** | `npm run generate-configs` writes `.cursor/mcp.json` for this workspace (Cursor detects it automatically) — or copy the snippet from the dashboard's Connect tab into any workspace |
| **Claude Code** | `claude mcp add --transport sse nodus http://localhost:3939/sse` |
| **Codex** (CLI or app) | `codex mcp add nodus --url http://localhost:3939/mcp` |
| **Claude Desktop** | `npm run connect:claude-desktop` — merges the app's config for you (macOS/Windows/Linux, backup kept), then fully quit and reopen the app |

<details>
<summary>Claude Desktop — manual setup instead</summary>

Merge the contents of `examples/claude_desktop_config.json` into the app's
config file yourself, then fully restart the app:

| OS | Config file |
| --- | --- |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

Tip: in the app, **Settings → Developer → Edit Config** opens this file's
location directly.

</details>

### Try it

1. In one connected tool: *“Save to nodus: the active task is fixing the login bug.”*
2. In a different tool: *“What does nodus say the active task is?”*
3. Later, from anywhere: *“Search nodus for anything about login.”* — global
   search works without knowing which domain the context lives in.

The second tool answers from the first tool's memory. Watch the write land
in real time in the dashboard's **Activity** tab, and browse, search, edit,
or delete anything in **Memory Explorer** (every entry shows which client
wrote it). One-click JSON **export/import** keeps backups easy.

## How it works

```
┌─────────┐  ┌─────────────┐  ┌───────┐        ┌─────────────────┐
│ Cursor  │  │ Claude Code │  │ Codex │        │  Browser (you)  │
└────┬────┘  └──────┬──────┘  └───┬───┘        └────────┬────────┘
     │ SSE          │ SSE         │ streamable HTTP     │ REST + static
     ▼              ▼             ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Express server                           │
│  /sse + /messages   /mcp        /api/*        / (dashboard)     │
│         └──────────────┴─── MCP tools ───┐                      │
│              query_nodus_state           │                      │
│              update_nodus_state          ▼                      │
│                                   SQLite (data/nodus.db)        │
└─────────────────────────────────────────────────────────────────┘
```

**The Registry Pattern.** A fixed, four-tool surface — the tool count never
grows with the store, so LLM clients pay a constant context cost no matter
how much is remembered:

| Tool | Input | Purpose |
| --- | --- | --- |
| `query_nodus_state` | `{ domain?, query, limit? }` | Read context. **Omit `domain` to search every domain at once.** With a domain: exact key match, `"*"` lists it, other text searches it. Responses include `total`/`truncated`. |
| `update_nodus_state` | `{ domain, key, value }` | Upsert context by `(domain, key)`. Idempotent. |
| `delete_nodus_state` | `{ domain, key }` | Remove one entry. A separate tool so clients can permission-gate deletion independently of writes. |
| `list_nodus_domains` | `{}` | Domain index with entry counts — "where should I look?" in one call. |

Tool descriptions are generated per connection with the **live domain
list**, so agents see the real namespace before their first call instead
of guessing. Context is organized into free-form **domains** (`tasks`,
`notes`, or anything an agent invents) holding **key → value** entries.

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

## HTTP surface

| Route | Purpose |
| --- | --- |
| `GET /sse`, `POST /messages` | MCP over legacy HTTP+SSE |
| `ALL /mcp` | MCP over streamable HTTP |
| `GET /health`, `GET /api/health` | liveness + active session counts |
| `GET /api/sessions`, `GET /api/clients` | live sessions + clients ever seen (with MCP clientInfo) |
| `GET /api/nodes?limit&offset&q&domain` | paginated, searchable context nodes |
| `POST /api/nodes` | create/update a node from the dashboard |
| `DELETE /api/nodes/:id` | delete a node |
| `GET /api/domains`, `GET /api/stats` | domain list, node counts + DB size |
| `GET /api/export`, `POST /api/import` | JSON backup / restore |
| `GET /api/activity`, `GET /api/activity/stream` | recent + live activity events |
| `GET /api/eval/stream`, `GET /api/eval/runs` | run the benchmark (SSE) + run history |
| `GET /` | dashboard |

## Benchmarking

`npm run eval` (server must be running) connects as a real MCP client and
runs a 10-case suite, reporting per-call round-trip latency and exact
payload byte-sizes, plus percentiles. The dashboard's **Eval Harness** tab
runs the same suite with a live chart.

## Development

```bash
npm run dev                # backend via tsx
npm --prefix ui run dev    # dashboard with hot reload on :5173 (proxies to the server)
npm run typecheck          # strict TS across the backend
```

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `NODUS_PORT` | `3939` | HTTP port |
| `NODUS_DATA_DIR` | `./data` | directory for the SQLite DB |
| `NODUS_DB_PATH` | `<data dir>/nodus.db` | exact DB file path |
| `NODUS_LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |

## Keep it always on (macOS, optional)

Clients can only connect while the server runs. To start it at login and
keep it alive:

```bash
cp deploy/com.nodus.server.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.nodus.server.plist
```

> The plist assumes the repo lives at `~/Desktop/nodus` — edit the paths
> inside if you cloned elsewhere. Logs: `~/Library/Logs/nodus.log`. Remove
> with `launchctl bootout gui/$(id -u)/com.nodus.server`.
