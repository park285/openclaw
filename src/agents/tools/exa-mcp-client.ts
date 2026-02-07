import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const DEFAULT_EXA_MCP_ENDPOINT = "https://mcp.exa.ai/mcp";

type CachedClient = {
  endpoint: string;
  client: Client;
  transport: StreamableHTTPClientTransport;
};

// 모듈 레벨 클라이언트 캐시
let cached: CachedClient | null = null;

export type ExaSearchResult = {
  title: string;
  url: string;
  description: string;
  published?: string;
  siteName?: string;
};

async function getClient(endpoint: string, apiKey: string | undefined): Promise<Client> {
  if (cached && cached.endpoint === endpoint) {
    return cached.client;
  }

  // 기존 연결 정리
  await closeClient();

  const headers: Record<string, string> = {};
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    requestInit: { headers },
  });

  const client = new Client({ name: "openclaw", version: "1.0.0" });
  await client.connect(transport);

  cached = { endpoint, client, transport };
  return client;
}

async function closeClient(): Promise<void> {
  if (!cached) return;
  try {
    await cached.transport.close();
  } catch {
    // 연결 종료 실패 무시
  }
  cached = null;
}

function parseExaResults(text: string): ExaSearchResult[] {
  // Exa MCP는 JSON 배열이나 structured text를 반환할 수 있음
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map((item: Record<string, unknown>) => ({
        title: String(item.title ?? ""),
        url: String(item.url ?? ""),
        description: String(item.snippet ?? item.description ?? item.text ?? ""),
        published: item.publishedDate ? String(item.publishedDate) : undefined,
        siteName: extractSiteName(String(item.url ?? "")),
      }));
    }
  } catch {
    // JSON 파싱 실패 — text 그대로 단일 결과 반환
  }

  return [
    {
      title: "Exa Search Results",
      url: "",
      description: text,
    },
  ];
}

function extractSiteName(url: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

type McpToolContent = {
  type: string;
  text?: string;
};

export async function callExaSearch(params: {
  query: string;
  numResults: number;
  endpoint?: string;
  apiKey?: string;
  timeoutMs: number;
  startPublishedDate?: string;
  endPublishedDate?: string;
}): Promise<ExaSearchResult[]> {
  const endpoint = params.endpoint || DEFAULT_EXA_MCP_ENDPOINT;

  const toolArgs: Record<string, unknown> = {
    query: params.query,
    numResults: params.numResults,
  };
  if (params.startPublishedDate) {
    toolArgs.startPublishedDate = params.startPublishedDate;
  }
  if (params.endPublishedDate) {
    toolArgs.endPublishedDate = params.endPublishedDate;
  }

  let client: Client;
  try {
    client = await getClient(endpoint, params.apiKey);
  } catch {
    // 초기 연결 실패 시 캐시 정리 후 재시도
    await closeClient();
    client = await getClient(endpoint, params.apiKey);
  }

  let result;
  try {
    result = await client.callTool({ name: "web_search_exa", arguments: toolArgs }, undefined, {
      timeout: params.timeoutMs,
    });
  } catch {
    // 세션 만료 등 오류 시 재연결 1회 시도
    await closeClient();
    client = await getClient(endpoint, params.apiKey);
    result = await client.callTool({ name: "web_search_exa", arguments: toolArgs }, undefined, {
      timeout: params.timeoutMs,
    });
  }

  const content = result?.content as McpToolContent[] | undefined;
  const textContent = content?.find((c) => c.type === "text");
  if (!textContent?.text) {
    return [];
  }

  return parseExaResults(textContent.text);
}

export const DEFAULT_EXA_ENDPOINT = DEFAULT_EXA_MCP_ENDPOINT;

export const __testing = {
  parseExaResults,
  closeClient,
} as const;
