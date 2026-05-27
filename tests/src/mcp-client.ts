// tests/src/mcp-client.ts
const MCP_URL = "https://mcp.inflight.co";

export interface McpCallResult<T = unknown> {
  result?: T;
  error?: { code: number; message: string };
}

export class McpClient {
  constructor(private readonly token: string) {}

  static fromEnv(): McpClient | null {
    const token = process.env.INFLIGHT_CI_TOKEN;
    return token ? new McpClient(token) : null;
  }

  async callTool<T = unknown>(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    const res = await fetch(MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });

    if (!res.ok) {
      throw new Error(`MCP HTTP ${res.status}: ${await res.text()}`);
    }

    const payload = (await res.json()) as McpCallResult<{
      content: Array<{ type: string; text?: string }>;
      structuredContent?: T;
    }>;

    if (payload.error) {
      throw new Error(`MCP tool error ${payload.error.code}: ${payload.error.message}`);
    }

    // MCP tools may return data either via structuredContent (preferred)
    // or as JSON-stringified text in content[0].text. Support both.
    const result = payload.result;
    if (!result) throw new Error("MCP response missing result");

    if (result.structuredContent !== undefined) {
      return result.structuredContent;
    }
    const text = result.content?.[0]?.text;
    if (typeof text === "string") {
      return JSON.parse(text) as T;
    }
    throw new Error(`MCP response had no parseable content: ${JSON.stringify(result)}`);
  }
}
