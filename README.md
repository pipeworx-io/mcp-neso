# mcp-neso

NESO MCP — Great Britain electricity grid open data (api.neso.energy)

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1856+ live data sources. This is an independent, unofficial integration — not affiliated with, endorsed by, or published by the upstream provider.

## Tools

| Tool | Description |
|------|-------------|
| `neso_search_datasets` | Search NESO (National Energy System Operator, ex National Grid ESO) open data for UK electricity grid datasets — GB power demand forecasts, wind generation forecasts, carbon intensity, balancing costs, historic demand, energy system data. Returns dataset slug/id, title, summary, and resource count. Example: neso_search_datasets({ query: "wind forecast" }) |
| `neso_dataset_resources` | List the resources (data files/tables) inside one NESO UK electricity grid dataset by its id or slug (from neso_search_datasets). Returns the dataset title/description plus each resource's resource_id, name, format, datastore availability, and last_modified — pick a resource_id with datastore_active for neso_query_data. Example: neso_dataset_resources({ id: "14-days-ahead-wind-forecasts" }) |
| `neso_query_data` | Query rows from a NESO GB energy dataset resource (CKAN DataStore) by resource_id — UK electricity demand, wind generation forecasts, carbon intensity, balancing data. Supports exact-match filters (field->value object), full-text query, limit, offset. Returns field names/types plus records. Example: neso_query_data({ resource_id: "aec5601a-7f3e-4c4c-bf56-d8e4184d3c5b", limit: 20 }) |
| `neso_demand_forecast` | Current GB day-ahead national electricity demand forecast from NESO (National Grid ESO) — tomorrow's UK power demand in MW at each cardinal point (the daily peaks and troughs the grid operator forecasts, with start/end times). Answers "what is tomorrow's UK electricity demand", "GB power demand forecast", "National Grid demand peak". Example: neso_demand_forecast({}) |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "neso": {
      "url": "https://gateway.pipeworx.io/neso/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/neso/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1856+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/neso_search_datasets \
  -H 'Content-Type: application/json' \
  -d '{"query":"wind forecast"}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/neso_search_datasets`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

## Run it from npm

`@pipeworx/mcp-neso` is a local stdio bridge to the Pipeworx gateway: your MCP client
starts it with `npx`, and it forwards every call to the same
`https://gateway.pipeworx.io/neso/mcp` endpoint shown above. It needs network access;
there is no offline mode.

```json
{
  "mcpServers": {
    "neso": {
      "command": "npx",
      "args": ["-y", "@pipeworx/mcp-neso"]
    }
  }
}
```

Without a key it calls anonymously, capped at 50 calls a day. A free account
raises that to 200 a day: get a key at https://pipeworx.io/signup and add
`"env": { "PIPEWORX_API_KEY": "<your key>" }` to the server entry.
The key is sent as a Bearer token, the same way a hosted connection sends it,
so calls are metered and billed exactly as they are there.

It lists **only** this pack's tools by default. Set `PIPEWORX_META_TOOLS=1` to
also list `ask_pipeworx` and the other gateway-wide tools.

Behind an HTTPS proxy: Node's built-in `fetch` does not read `HTTPS_PROXY` by
default. Newer Node releases honour it when `NODE_USE_ENV_PROXY=1` is set; check
your Node version's documentation.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Neso data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
