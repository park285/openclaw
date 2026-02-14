import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const callSerperSearchMock = vi.fn();
const resolveSerperApiKeysMock = vi.fn();

vi.mock("./serper-client.js", () => ({
  callSerperSearch: (params: unknown) => callSerperSearchMock(params),
  resolveSerperApiKeys: (search: unknown) => resolveSerperApiKeysMock(search),
}));

import { createRealtimeSearchTool } from "./web-search.js";

function withSerperConfig(params?: { enabled?: boolean; cacheTtlMinutes?: number }) {
  return {
    tools: {
      web: {
        search: {
          provider: "exa" as const,
          ...(params ? { serper: params } : {}),
        },
      },
    },
  };
}

describe("web_search_realtime", () => {
  beforeEach(() => {
    callSerperSearchMock.mockReset();
    resolveSerperApiKeysMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns tool when serper.enabled=true", () => {
    resolveSerperApiKeysMock.mockReturnValue(["key-1"]);

    const tool = createRealtimeSearchTool({
      config: withSerperConfig({ enabled: true }),
      sandboxed: false,
    });

    expect(tool?.name).toBe("web_search_realtime");
  });

  it("returns null when serper.enabled=false or missing", () => {
    resolveSerperApiKeysMock.mockReturnValue(["key-1"]);

    const disabled = createRealtimeSearchTool({
      config: withSerperConfig({ enabled: false }),
      sandboxed: false,
    });
    const missing = createRealtimeSearchTool({
      config: withSerperConfig(),
      sandboxed: false,
    });

    expect(disabled).toBeNull();
    expect(missing).toBeNull();
  });

  it("returns missing_serper_api_key when no API key is configured", async () => {
    resolveSerperApiKeysMock.mockReturnValue([]);

    const tool = createRealtimeSearchTool({
      config: withSerperConfig({ enabled: true }),
      sandboxed: false,
    });

    const result = await tool?.execute?.("call", { query: "today weather" });
    expect(result?.details).toMatchObject({ error: "missing_serper_api_key" });
    expect(callSerperSearchMock).not.toHaveBeenCalled();
  });

  it("returns invalid_freshness for unsupported freshness", async () => {
    resolveSerperApiKeysMock.mockReturnValue(["key-1"]);
    callSerperSearchMock.mockResolvedValue([]);

    const tool = createRealtimeSearchTool({
      config: withSerperConfig({ enabled: true }),
      sandboxed: false,
    });

    const result = await tool?.execute?.("call", { query: "news", freshness: "xyz" });
    expect(result?.details).toMatchObject({ error: "invalid_freshness" });
    expect(callSerperSearchMock).not.toHaveBeenCalled();
  });

  it("clamps count to [1, 10]", async () => {
    resolveSerperApiKeysMock.mockReturnValue(["key-1"]);
    callSerperSearchMock.mockResolvedValue([]);

    const tool = createRealtimeSearchTool({
      config: withSerperConfig({ enabled: true }),
      sandboxed: false,
    });

    await tool?.execute?.("call-1", { query: "high", count: 100 });
    await tool?.execute?.("call-2", { query: "low", count: -1 });

    expect(callSerperSearchMock.mock.calls[0]?.[0]).toMatchObject({ numResults: 10 });
    expect(callSerperSearchMock.mock.calls[1]?.[0]).toMatchObject({ numResults: 1 });
  });

  it("attaches externalContent metadata for realtime results", async () => {
    resolveSerperApiKeysMock.mockReturnValue(["key-1"]);
    callSerperSearchMock.mockResolvedValue([
      {
        title: "Example",
        url: "https://example.com",
        description: "snippet",
      },
    ]);

    const tool = createRealtimeSearchTool({
      config: withSerperConfig({ enabled: true }),
      sandboxed: false,
    });

    const result = await tool?.execute?.("call-meta", { query: "latest news" });
    expect(result?.details).toMatchObject({
      provider: "serper",
      externalContent: {
        untrusted: true,
        source: "web_search",
        provider: "serper",
        wrapped: true,
      },
    });
  });

  it("includes tbs in cache key by separating freshness-specific cache entries", async () => {
    resolveSerperApiKeysMock.mockReturnValue(["key-1"]);
    callSerperSearchMock.mockResolvedValue([]);

    const tool = createRealtimeSearchTool({
      config: withSerperConfig({ enabled: true }),
      sandboxed: false,
    });

    await tool?.execute?.("call-1", { query: "seoul weather", freshness: "pd" });
    const cached = await tool?.execute?.("call-2", { query: "seoul weather", freshness: "pd" });
    await tool?.execute?.("call-3", { query: "seoul weather", freshness: "pw" });

    expect(cached?.details).toMatchObject({ cached: true });
    expect(callSerperSearchMock).toHaveBeenCalledTimes(2);
    expect(callSerperSearchMock.mock.calls[0]?.[0]).toMatchObject({ tbs: "qdr:d" });
    expect(callSerperSearchMock.mock.calls[1]?.[0]).toMatchObject({ tbs: "qdr:w" });
  });

  it("uses serper.cacheTtlMinutes for cache expiration", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-07T00:00:00Z"));

    resolveSerperApiKeysMock.mockReturnValue(["key-1"]);
    callSerperSearchMock.mockResolvedValue([]);

    const tool = createRealtimeSearchTool({
      config: withSerperConfig({ enabled: true, cacheTtlMinutes: 3 }),
      sandboxed: false,
    });

    await tool?.execute?.("call-1", { query: "ttl-check" });
    vi.advanceTimersByTime(2 * 60 * 1000);
    const stillCached = await tool?.execute?.("call-2", { query: "ttl-check" });
    vi.advanceTimersByTime(61 * 1000);
    await tool?.execute?.("call-3", { query: "ttl-check" });

    expect(stillCached?.details).toMatchObject({ cached: true });
    expect(callSerperSearchMock).toHaveBeenCalledTimes(2);
  });
});
