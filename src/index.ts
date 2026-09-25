interface McpToolDefinition {
  name: string;
  description: string;
  /** Human-facing one-liner (fleet #1967). Optional; consumers fall back to
   *  description. Kept in step with shared/src/types.ts — scripts/lib/
   *  check-inlined-types.mjs reports drift at publish time. */
  summary?: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    anyOf?: Array<{ required: string[] }>;
    oneOf?: Array<{ required: string[] }>;
    allOf?: Array<{ required: string[] }>;
  };
  outputSchema?: Record<string, unknown>;
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * NESO MCP — Great Britain electricity grid open data (api.neso.energy)
 *
 * NESO (National Energy System Operator, formerly National Grid ESO) publishes
 * GB power-system datasets — demand forecasts, wind generation forecasts,
 * carbon intensity, balancing costs, historic demand — via a keyless CKAN API.
 *
 * Tools:
 * - neso_search_datasets: keyword search over the NESO data portal
 * - neso_dataset_resources: list a dataset's resources (resource_ids)
 * - neso_query_data: pull rows from a tabular resource (CKAN DataStore)
 * - neso_demand_forecast: convenience — current GB day-ahead national demand forecast
 *
 * Flow: search_datasets -> dataset_resources (pick a resource_id with
 * datastore_active) -> query_data. Keyless, no auth.
 */


const BASE = 'https://api.neso.energy';
const UA = 'pipeworx-mcp-neso/1.0 (+https://pipeworx.io)';
const TIMEOUT_MS = 8000;

// Dataset slug for the day-ahead national demand forecast. Resource ids are
// resolved at call time via package_show (the CSV behind it is re-uploaded
// twice daily), so only the stable dataset slug is hardcoded.
const DEMAND_FORECAST_DATASET = '1-day-ahead-demand-forecast';

const tools: McpToolExport['tools'] = [
  {
    name: 'neso_search_datasets',
    description:
      'Search NESO (National Energy System Operator, ex National Grid ESO) open data for UK electricity grid datasets — GB power demand forecasts, wind generation forecasts, carbon intensity, balancing costs, historic demand, energy system data. Returns dataset slug/id, title, summary, and resource count. Example: neso_search_datasets({ query: "wind forecast" })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Keyword(s), e.g. "demand forecast", "wind", "carbon intensity". Blank lists all datasets.' },
        limit: { type: 'number', description: 'Max datasets to return, 1-50 (default 10).' },
      },
    },
  },
  {
    name: 'neso_dataset_resources',
    description:
      'List the resources (data files/tables) inside one NESO UK electricity grid dataset by its id or slug (from neso_search_datasets). Returns the dataset title/description plus each resource\'s resource_id, name, format, datastore availability, and last_modified — pick a resource_id with datastore_active for neso_query_data. Example: neso_dataset_resources({ id: "14-days-ahead-wind-forecasts" })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Dataset id or slug from neso_search_datasets, e.g. "1-day-ahead-demand-forecast".' },
      },
      required: ['id'],
    },
  },
  {
    name: 'neso_query_data',
    description:
      'Query rows from a NESO GB energy dataset resource (CKAN DataStore) by resource_id — UK electricity demand, wind generation forecasts, carbon intensity, balancing data. Supports exact-match filters (field->value object), full-text query, limit, offset. Returns field names/types plus records. Example: neso_query_data({ resource_id: "aec5601a-7f3e-4c4c-bf56-d8e4184d3c5b", limit: 20 })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        resource_id: { type: 'string', description: 'Resource id from neso_dataset_resources (must have datastore_active true).' },
        filters: { type: 'object', description: 'Optional exact-match filters, e.g. { "DAYSAHEAD": 1 }.' },
        query: { type: 'string', description: 'Optional full-text search over the rows.' },
        limit: { type: 'number', description: 'Max rows, 1-200 (default 20).' },
        offset: { type: 'number', description: 'Pagination offset (default 0).' },
        sort: { type: 'string', description: 'Optional sort, e.g. "TARGETDATE desc".' },
      },
      required: ['resource_id'],
    },
  },
  {
    name: 'neso_demand_forecast',
    description:
      'Current GB day-ahead national electricity demand forecast from NESO (National Grid ESO) — tomorrow\'s UK power demand in MW at each cardinal point (the daily peaks and troughs the grid operator forecasts, with start/end times). Answers "what is tomorrow\'s UK electricity demand", "GB power demand forecast", "National Grid demand peak". Example: neso_demand_forecast({})',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max forecast rows, 1-48 (default 48 — the full current forecast).' },
      },
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'neso_search_datasets': {
      const q = typeof args.query === 'string' && args.query.trim() ? args.query.trim() : '*:*';
      const rows = clamp(numArg(args.limit, 10), 1, 50);
      const data = (await ckan(`/api/3/action/package_search?${new URLSearchParams({ q, rows: String(rows) })}`)) as {
        count: number;
        results: CkanDataset[];
      };
      return {
        total_matches: data.count,
        datasets: (data.results ?? []).map((d) => ({
          id: d.name,
          title: d.title,
          summary: truncate(d.notes, 200),
          resource_count: (d.resources ?? []).length,
          last_updated: d.metadata_modified,
        })),
      };
    }

    case 'neso_dataset_resources': {
      const id = reqStr(args, 'id', '"1-day-ahead-demand-forecast"');
      const d = await packageShow(id);
      return {
        id: d.name,
        title: d.title,
        description: truncate(d.notes, 600),
        last_updated: d.metadata_modified,
        resources: (d.resources ?? []).map((r) => ({
          resource_id: r.id,
          name: r.name,
          format: r.format,
          datastore_active: r.datastore_active === true,
          last_modified: r.last_modified,
        })),
        hint: 'Pass a resource_id with datastore_active=true to neso_query_data.',
      };
    }

    case 'neso_query_data': {
      const resourceId = reqStr(args, 'resource_id', '"aec5601a-7f3e-4c4c-bf56-d8e4184d3c5b"');
      const limit = clamp(numArg(args.limit, 20), 1, 200);
      const offset = Math.max(0, numArg(args.offset, 0));
      const result = await datastoreSearch(resourceId, {
        limit,
        offset,
        q: typeof args.query === 'string' && args.query.trim() ? args.query.trim() : undefined,
        filters: isPlainObject(args.filters) ? (args.filters as Record<string, unknown>) : undefined,
        sort: typeof args.sort === 'string' && args.sort.trim() ? args.sort.trim() : undefined,
      });
      return {
        resource_id: resourceId,
        total_rows: result.total,
        fields: (result.fields ?? [])
          .filter((f) => f.id !== '_full_text')
          .map((f) => ({ name: f.id, type: f.type })),
        records: (result.records ?? []).map(stripInternal),
        offset,
        returned: (result.records ?? []).length,
      };
    }

    case 'neso_demand_forecast': {
      const limit = clamp(numArg(args.limit, 48), 1, 48);
      const d = await packageShow(DEMAND_FORECAST_DATASET);
      const live = (d.resources ?? []).filter((r) => r.datastore_active === true && !/historic/i.test(r.name ?? ''));
      const resource =
        live.find((r) => /day ahead national demand/i.test(r.name ?? '')) ?? live[0];
      if (!resource) {
        throw new Error(
          `NESO: no live datastore resource found in dataset "${DEMAND_FORECAST_DATASET}". Use neso_dataset_resources({ id: "${DEMAND_FORECAST_DATASET}" }) to inspect what is available.`,
        );
      }
      const result = await datastoreSearch(resource.id, { limit });
      const records = (result.records ?? []).map((rec) => ({
        target_date: fmtDate(rec.TARGETDATE),
        days_ahead: rec.DAYSAHEAD ?? null,
        cardinal_point: rec.CARDINALPOINT ?? null,
        point_type: rec.CP_TYPE === 'P' ? 'peak' : rec.CP_TYPE === 'T' ? 'trough' : rec.CP_TYPE === 'F' ? 'fixed' : rec.CP_TYPE ?? null,
        start_time: fmtTime(rec.CP_ST_TIME),
        end_time: fmtTime(rec.CP_END_TIME),
        forecast_demand_mw: rec.FORECASTDEMAND ?? null,
      }));
      const demands = records.map((r) => r.forecast_demand_mw).filter((v): v is number => typeof v === 'number');
      return {
        source: 'NESO (National Energy System Operator) day-ahead national demand forecast, Great Britain',
        dataset: DEMAND_FORECAST_DATASET,
        resource: resource.name,
        forecast_published: resource.last_modified,
        unit: 'MW',
        peak_mw: demands.length ? Math.max(...demands) : null,
        min_mw: demands.length ? Math.min(...demands) : null,
        note: 'National Demand = GB generation requirement excluding station load, pumped-storage pumping, and interconnector exports. Cardinal points are the forecast daily peaks/troughs; times are GB clock time (HH:MM).',
        forecast: records,
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------

interface CkanResource {
  id: string;
  name?: string;
  format?: string;
  datastore_active?: boolean;
  last_modified?: string;
}
interface CkanDataset {
  name: string;
  title?: string;
  notes?: string;
  metadata_modified?: string;
  resources?: CkanResource[];
}
interface DatastoreResult {
  total?: number;
  fields?: Array<{ id: string; type: string }>;
  records?: Array<Record<string, unknown>>;
}

async function packageShow(id: string): Promise<CkanDataset> {
  try {
    return (await ckan(`/api/3/action/package_show?id=${encodeURIComponent(id)}`)) as CkanDataset;
  } catch (err) {
    if (err instanceof Error && /HTTP 404/.test(err.message)) {
      throw new Error(`NESO: dataset "${id}" not found. Find valid dataset ids with neso_search_datasets.`);
    }
    throw err;
  }
}

async function datastoreSearch(
  resourceId: string,
  opts: { limit: number; offset?: number; q?: string; filters?: Record<string, unknown>; sort?: string },
): Promise<DatastoreResult> {
  const p = new URLSearchParams({ resource_id: resourceId, limit: String(opts.limit) });
  if (opts.offset) p.set('offset', String(opts.offset));
  if (opts.q) p.set('q', opts.q);
  if (opts.filters && Object.keys(opts.filters).length > 0) p.set('filters', JSON.stringify(opts.filters));
  if (opts.sort) p.set('sort', opts.sort);
  try {
    return (await ckan(`/api/3/action/datastore_search?${p}`)) as DatastoreResult;
  } catch (err) {
    if (err instanceof Error && /HTTP 404/.test(err.message)) {
      throw new Error(
        `NESO: resource "${resourceId}" has no datastore (it may be a PDF/image/plain file). Pick a resource with datastore_active=true from neso_dataset_resources.`,
      );
    }
    throw err;
  }
}

async function ckan(path: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`NESO: request timed out after ${TIMEOUT_MS / 1000}s. The api.neso.energy portal may be slow — retry, or narrow the query with a smaller limit.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`NESO: HTTP ${res.status} from api.neso.energy — ${truncate(body.replace(/\s+/g, ' '), 160)}`);
  }
  const json = (await res.json()) as { success?: boolean; result?: unknown; error?: { message?: string } };
  if (json.success === false || json.result === undefined) {
    throw new Error(`NESO: CKAN API error — ${json.error?.message ?? 'unknown error'}`);
  }
  return json.result;
}

/** "20260716" | 20260716 -> "2026-07-16"; ISO date strings pass through. */
function fmtDate(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v);
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s;
}

/** HHMM integer (30, 2030) -> "00:30", "20:30". */
function fmtTime(v: unknown): string | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return v === null || v === undefined ? null : String(v);
  const s = String(Math.trunc(n)).padStart(4, '0');
  return `${s.slice(0, 2)}:${s.slice(2)}`;
}

function stripInternal(rec: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) if (k !== '_full_text') out[k] = v;
  return out;
}

function truncate(s: string | undefined | null, max: number): string {
  if (!s) return '';
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function reqStr(args: Record<string, unknown>, key: string, example: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`Required argument "${key}" is missing. Pass a string like ${example}.`);
  }
  return v.trim();
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function numArg(v: unknown, dflt: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : dflt;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

export default { tools, callTool } satisfies McpToolExport;
