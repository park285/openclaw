import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../../config/config.js";
import type { AnyAgentTool } from "./common.js";
import { wrapWebContent } from "../../security/external-content.js";
import { jsonResult, readNumberParam, readStringParam } from "./common.js";
import { callExaSearch } from "./exa-mcp-client.js";
import { callSerperSearch, resolveSerperApiKeys } from "./serper-client.js";
import {
  CacheEntry,
  DEFAULT_CACHE_TTL_MINUTES,
  DEFAULT_TIMEOUT_SECONDS,
  normalizeCacheKey,
  readCache,
  resolveCacheTtlMs,
  resolveTimeoutSeconds,
  writeCache,
} from "./web-shared.js";

const DEFAULT_SEARCH_COUNT = 5;
const MAX_SEARCH_COUNT = 10;
const DEFAULT_REALTIME_CACHE_TTL_MINUTES = 5;

const SEARCH_CACHE = new Map<string, CacheEntry<Record<string, unknown>>>();
const SEARCH_FRESHNESS_SHORTCUTS = new Set(["pd", "pw", "pm", "py"]);
const SEARCH_FRESHNESS_RANGE = /^(\d{4}-\d{2}-\d{2})to(\d{4}-\d{2}-\d{2})$/;

const WebSearchSchema = Type.Object({
  query: Type.String({ description: "Search query string." }),
  count: Type.Optional(
    Type.Number({
      description: "Number of results to return (1-10).",
      minimum: 1,
      maximum: MAX_SEARCH_COUNT,
    }),
  ),
  country: Type.Optional(
    Type.String({
      description:
        "2-letter country code for region-specific results (e.g., 'DE', 'US', 'ALL'). Default: 'US'.",
    }),
  ),
  search_lang: Type.Optional(
    Type.String({
      description: "ISO language code for search results (e.g., 'de', 'en', 'fr').",
    }),
  ),
  ui_lang: Type.Optional(
    Type.String({
      description: "ISO language code for UI elements.",
    }),
  ),
  freshness: Type.Optional(
    Type.String({
      description:
        "Time filter is only supported in web_search_realtime: pd, pw, pm, py, or YYYY-MM-DDtoYYYY-MM-DD.",
    }),
  ),
});

const RealtimeSearchSchema = Type.Object({
  query: Type.String({ description: "Search query string." }),
  count: Type.Optional(
    Type.Number({
      description: "Results to return (1-10).",
      minimum: 1,
      maximum: MAX_SEARCH_COUNT,
    }),
  ),
  country: Type.Optional(
    Type.String({
      description: "2-letter country code (e.g., 'KR', 'US').",
    }),
  ),
  search_lang: Type.Optional(
    Type.String({
      description: "ISO language code (e.g., 'ko', 'en').",
    }),
  ),
  freshness: Type.Optional(
    Type.String({
      description:
        "Time filter: 'pd' (24h), 'pw' (week), 'pm' (month), 'py' (year), or 'YYYY-MM-DDtoYYYY-MM-DD'.",
    }),
  ),
});

type WebSearchConfig = NonNullable<OpenClawConfig["tools"]>["web"] extends infer Web
  ? Web extends { search?: infer Search }
    ? Search
    : undefined
  : undefined;

type SerperSearchConfig = {
  enabled?: boolean;
  cacheTtlMinutes?: number;
};

function resolveSearchConfig(cfg?: OpenClawConfig): WebSearchConfig {
  const search = cfg?.tools?.web?.search;
  if (!search || typeof search !== "object") {
    return undefined;
  }
  return search as WebSearchConfig;
}

function resolveSearchEnabled(params: { search?: WebSearchConfig; sandboxed?: boolean }): boolean {
  if (typeof params.search?.enabled === "boolean") {
    return params.search.enabled;
  }
  if (params.sandboxed) {
    return true;
  }
  return true;
}

function resolveSerperConfig(search?: WebSearchConfig): SerperSearchConfig | undefined {
  if (!search || typeof search !== "object") {
    return undefined;
  }
  const serper = "serper" in search ? search.serper : undefined;
  if (!serper || typeof serper !== "object") {
    return undefined;
  }
  return serper as SerperSearchConfig;
}

function resolveExaApiKey(search?: WebSearchConfig): string | undefined {
  const exaCfg =
    search && "exa" in search && typeof search.exa === "object"
      ? (search.exa as Record<string, unknown>)
      : undefined;
  const fromConfig = exaCfg && typeof exaCfg.apiKey === "string" ? exaCfg.apiKey.trim() : "";
  const fromEnv = (process.env.EXA_API_KEY ?? "").trim();
  return fromConfig || fromEnv || undefined;
}

function missingSerperKeyPayload() {
  return {
    error: "missing_serper_api_key",
    message:
      "web_search_realtime needs a Serper API key. Set SERPER_API_KEYS or SERPER_API_KEY in the Gateway environment.",
    docs: "https://docs.openclaw.ai/tools/web",
  };
}

function resolveSearchCount(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const clamped = Math.max(1, Math.min(MAX_SEARCH_COUNT, Math.floor(parsed)));
  return clamped;
}

function normalizeFreshness(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const lower = trimmed.toLowerCase();
  if (SEARCH_FRESHNESS_SHORTCUTS.has(lower)) {
    return lower;
  }

  const match = trimmed.match(SEARCH_FRESHNESS_RANGE);
  if (!match) {
    return undefined;
  }

  const [, start, end] = match;
  if (!isValidIsoDate(start) || !isValidIsoDate(end)) {
    return undefined;
  }
  if (start > end) {
    return undefined;
  }

  return `${start}to${end}`;
}

function isoDateToUsDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${month}/${day}/${year}`;
}

type FreshnessDateRange = {
  start: string;
  end: string;
};

function todayUtcIsoDate(): string {
  const now = new Date();
  const utcDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return utcDate.toISOString().slice(0, 10);
}

function offsetUtcIsoDate(dateIso: string, dayOffset: number): string {
  const [year, month, day] = dateIso.split("-").map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

export function freshnessToDateRange(freshness: string): FreshnessDateRange | undefined {
  const normalized = normalizeFreshness(freshness);
  if (!normalized) {
    return undefined;
  }

  if (normalized === "pd") {
    const end = todayUtcIsoDate();
    return { start: offsetUtcIsoDate(end, -1), end };
  }
  if (normalized === "pw") {
    const end = todayUtcIsoDate();
    return { start: offsetUtcIsoDate(end, -7), end };
  }
  if (normalized === "pm") {
    const end = todayUtcIsoDate();
    return { start: offsetUtcIsoDate(end, -30), end };
  }
  if (normalized === "py") {
    const end = todayUtcIsoDate();
    return { start: offsetUtcIsoDate(end, -365), end };
  }

  const match = normalized.match(SEARCH_FRESHNESS_RANGE);
  if (!match) {
    return undefined;
  }

  return { start: match[1], end: match[2] };
}

export function freshnessToSerperTbs(freshness: string): string | undefined {
  const normalized = normalizeFreshness(freshness);
  if (!normalized) {
    return undefined;
  }

  if (normalized === "pd") {
    return "qdr:d";
  }
  if (normalized === "pw") {
    return "qdr:w";
  }
  if (normalized === "pm") {
    return "qdr:m";
  }
  if (normalized === "py") {
    return "qdr:y";
  }

  const match = normalized.match(SEARCH_FRESHNESS_RANGE);
  if (!match) {
    return undefined;
  }
  const [, start, end] = match;
  return `cdr:1,cd_min:${isoDateToUsDate(start)},cd_max:${isoDateToUsDate(end)}`;
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

async function runWebSearch(params: {
  query: string;
  count: number;
  apiKey?: string;
  timeoutSeconds: number;
  cacheTtlMs: number;
  country?: string;
  search_lang?: string;
  ui_lang?: string;
}): Promise<Record<string, unknown>> {
  const cacheKey = normalizeCacheKey(
    `exa:${params.query}:${params.count}:${params.country || "default"}:${params.search_lang || "default"}:${params.ui_lang || "default"}`,
  );
  const cached = readCache(SEARCH_CACHE, cacheKey);
  if (cached) {
    return { ...cached.value, cached: true };
  }

  const start = Date.now();
  const results = await callExaSearch({
    query: params.query,
    numResults: params.count,
    apiKey: params.apiKey,
    timeoutMs: params.timeoutSeconds * 1000,
  });

  const mapped = results.map((result) => ({
    title: result.title ? wrapWebContent(result.title, "web_search") : "",
    url: result.url,
    description: result.description ? wrapWebContent(result.description, "web_search") : "",
    published: result.published || undefined,
    siteName: result.siteName || undefined,
  }));

  const payload = {
    query: params.query,
    provider: "exa",
    count: mapped.length,
    tookMs: Date.now() - start,
    externalContent: {
      untrusted: true,
      source: "web_search",
      provider: "exa",
      wrapped: true,
    },
    results: mapped,
  };
  writeCache(SEARCH_CACHE, cacheKey, payload, params.cacheTtlMs);
  return payload;
}

export function createWebSearchTool(options?: {
  config?: OpenClawConfig;
  sandboxed?: boolean;
}): AnyAgentTool | null {
  const search = resolveSearchConfig(options?.config);
  if (!resolveSearchEnabled({ search, sandboxed: options?.sandboxed })) {
    return null;
  }

  return {
    label: "Web Search",
    name: "web_search",
    description:
      "Search the web using Exa AI. Returns titles, URLs, and snippets with semantic search capabilities.",
    parameters: WebSearchSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const query = readStringParam(params, "query", { required: true });
      const count =
        readNumberParam(params, "count", { integer: true }) ?? search?.maxResults ?? undefined;
      const country = readStringParam(params, "country");
      const search_lang = readStringParam(params, "search_lang");
      const ui_lang = readStringParam(params, "ui_lang");
      const rawFreshness = readStringParam(params, "freshness");
      if (rawFreshness) {
        return jsonResult({
          error: "unsupported_freshness",
          message: "freshness is only supported by web_search_realtime.",
          docs: "https://docs.openclaw.ai/tools/web",
        });
      }

      const result = await runWebSearch({
        query,
        count: resolveSearchCount(count, DEFAULT_SEARCH_COUNT),
        apiKey: resolveExaApiKey(search),
        timeoutSeconds: resolveTimeoutSeconds(search?.timeoutSeconds, DEFAULT_TIMEOUT_SECONDS),
        cacheTtlMs: resolveCacheTtlMs(search?.cacheTtlMinutes, DEFAULT_CACHE_TTL_MINUTES),
        country,
        search_lang,
        ui_lang,
      });
      return jsonResult(result);
    },
  };
}

export function createRealtimeSearchTool(options?: {
  config?: OpenClawConfig;
  sandboxed?: boolean;
}): AnyAgentTool | null {
  const search = resolveSearchConfig(options?.config);
  if (!resolveSearchEnabled({ search, sandboxed: options?.sandboxed })) {
    return null;
  }

  const serper = resolveSerperConfig(search);
  if (serper?.enabled !== true) {
    return null;
  }

  const apiKeys = resolveSerperApiKeys(search);
  const cacheTtlMs = resolveCacheTtlMs(serper?.cacheTtlMinutes, DEFAULT_REALTIME_CACHE_TTL_MINUTES);

  return {
    label: "Realtime Web Search",
    name: "web_search_realtime",
    description:
      "Search the web for real-time, fresh information via Serper. " +
      "Best for: breaking news, weather, live scores, stock prices, recent releases, today's events. " +
      "Use web_search instead for deep research, conceptual queries, or when freshness is not critical.",
    parameters: RealtimeSearchSchema,
    execute: async (_toolCallId, args) => {
      if (apiKeys.length === 0) {
        return jsonResult(missingSerperKeyPayload());
      }

      const params = args as Record<string, unknown>;
      const query = readStringParam(params, "query", { required: true });
      const rawCount = readNumberParam(params, "count", { integer: true }) ?? DEFAULT_SEARCH_COUNT;
      const count = resolveSearchCount(rawCount, DEFAULT_SEARCH_COUNT);
      const country = readStringParam(params, "country");
      const search_lang = readStringParam(params, "search_lang");
      const rawFreshness = readStringParam(params, "freshness");
      const tbs = rawFreshness ? freshnessToSerperTbs(rawFreshness) : undefined;
      if (rawFreshness && !tbs) {
        return jsonResult({
          error: "invalid_freshness",
          message: "freshness must be one of pd, pw, pm, py, or YYYY-MM-DDtoYYYY-MM-DD.",
          docs: "https://docs.openclaw.ai/tools/web",
        });
      }

      const cacheKey = normalizeCacheKey(
        `serper:${query}:${count}:${country || "default"}:${search_lang || "default"}:${tbs || "default"}`,
      );
      const cached = readCache(SEARCH_CACHE, cacheKey);
      if (cached) {
        return jsonResult({ ...cached.value, cached: true });
      }

      const start = Date.now();
      const results = await callSerperSearch({
        query,
        numResults: count,
        apiKeys,
        timeoutMs: resolveTimeoutSeconds(search?.timeoutSeconds, DEFAULT_TIMEOUT_SECONDS) * 1000,
        country,
        searchLang: search_lang,
        tbs,
      });

      const payload = {
        query,
        provider: "serper",
        count: results.length,
        tookMs: Date.now() - start,
        externalContent: {
          untrusted: true,
          source: "web_search",
          provider: "serper",
          wrapped: true,
        },
        results,
      };
      writeCache(SEARCH_CACHE, cacheKey, payload, cacheTtlMs);
      return jsonResult(payload);
    },
  };
}

export const __testing = {
  normalizeFreshness,
  freshnessToDateRange,
  freshnessToSerperTbs,
} as const;
