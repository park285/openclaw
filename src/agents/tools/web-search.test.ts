import { describe, expect, it } from "vitest";
import { __testing as exaTesting } from "./exa-mcp-client.js";
import { __testing } from "./web-search.js";

const {
  inferPerplexityBaseUrlFromApiKey,
  resolvePerplexityBaseUrl,
  normalizeFreshness,
  freshnessToDateRange,
} = __testing;
const { parseExaResults } = exaTesting;

describe("web_search perplexity baseUrl defaults", () => {
  it("detects a Perplexity key prefix", () => {
    expect(inferPerplexityBaseUrlFromApiKey("pplx-123")).toBe("direct");
  });

  it("detects an OpenRouter key prefix", () => {
    expect(inferPerplexityBaseUrlFromApiKey("sk-or-v1-123")).toBe("openrouter");
  });

  it("returns undefined for unknown key formats", () => {
    expect(inferPerplexityBaseUrlFromApiKey("unknown-key")).toBeUndefined();
  });

  it("prefers explicit baseUrl over key-based defaults", () => {
    expect(resolvePerplexityBaseUrl({ baseUrl: "https://example.com" }, "config", "pplx-123")).toBe(
      "https://example.com",
    );
  });

  it("defaults to direct when using PERPLEXITY_API_KEY", () => {
    expect(resolvePerplexityBaseUrl(undefined, "perplexity_env")).toBe("https://api.perplexity.ai");
  });

  it("defaults to OpenRouter when using OPENROUTER_API_KEY", () => {
    expect(resolvePerplexityBaseUrl(undefined, "openrouter_env")).toBe(
      "https://openrouter.ai/api/v1",
    );
  });

  it("defaults to direct when config key looks like Perplexity", () => {
    expect(resolvePerplexityBaseUrl(undefined, "config", "pplx-123")).toBe(
      "https://api.perplexity.ai",
    );
  });

  it("defaults to OpenRouter when config key looks like OpenRouter", () => {
    expect(resolvePerplexityBaseUrl(undefined, "config", "sk-or-v1-123")).toBe(
      "https://openrouter.ai/api/v1",
    );
  });

  it("defaults to OpenRouter for unknown config key formats", () => {
    expect(resolvePerplexityBaseUrl(undefined, "config", "weird-key")).toBe(
      "https://openrouter.ai/api/v1",
    );
  });
});

describe("web_search freshness normalization", () => {
  it("accepts Brave shortcut values", () => {
    expect(normalizeFreshness("pd")).toBe("pd");
    expect(normalizeFreshness("PW")).toBe("pw");
  });

  it("accepts valid date ranges", () => {
    expect(normalizeFreshness("2024-01-01to2024-01-31")).toBe("2024-01-01to2024-01-31");
  });

  it("rejects invalid date ranges", () => {
    expect(normalizeFreshness("2024-13-01to2024-01-31")).toBeUndefined();
    expect(normalizeFreshness("2024-02-30to2024-03-01")).toBeUndefined();
    expect(normalizeFreshness("2024-03-10to2024-03-01")).toBeUndefined();
  });
});

describe("freshnessToDateRange", () => {
  it("converts pd shortcut to 1-day range", () => {
    const result = freshnessToDateRange("pd");
    expect(result).toBeDefined();
    expect(result!.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result!.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // start는 end보다 1일 전
    const startDate = new Date(result!.start);
    const endDate = new Date(result!.end);
    const diffDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(1, 0);
  });

  it("converts pw shortcut to 7-day range", () => {
    const result = freshnessToDateRange("pw");
    expect(result).toBeDefined();
    const startDate = new Date(result!.start);
    const endDate = new Date(result!.end);
    const diffDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(7, 0);
  });

  it("passes through date ranges as-is", () => {
    const result = freshnessToDateRange("2024-01-01to2024-06-30");
    expect(result).toEqual({ start: "2024-01-01", end: "2024-06-30" });
  });

  it("returns undefined for invalid input", () => {
    expect(freshnessToDateRange("invalid")).toBeUndefined();
  });
});

describe("exa MCP result parsing", () => {
  it("parses JSON array results", () => {
    const json = JSON.stringify([
      {
        title: "Test",
        url: "https://example.com",
        snippet: "A test result",
        publishedDate: "2024-01-01",
      },
      { title: "Another", url: "https://other.com", text: "Other result" },
    ]);
    const results = parseExaResults(json);
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe("Test");
    expect(results[0].url).toBe("https://example.com");
    expect(results[0].description).toBe("A test result");
    expect(results[0].published).toBe("2024-01-01");
    expect(results[0].siteName).toBe("example.com");
    expect(results[1].description).toBe("Other result");
  });

  it("falls back to single text result for non-JSON", () => {
    const results = parseExaResults("plain text results");
    expect(results).toHaveLength(1);
    expect(results[0].description).toBe("plain text results");
    expect(results[0].title).toBe("Exa Search Results");
  });
});
