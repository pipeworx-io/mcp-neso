# mcp-neso

NESO MCP — Great Britain electricity grid open data (api.neso.energy)

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

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

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Neso data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
