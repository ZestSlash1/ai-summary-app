import { createMCPClient } from "@ai-sdk/mcp";

export async function POST(request: Request) {
  const { url, authHeader } = (await request.json()) as {
    url?: string;
    authHeader?: string;
  };

  if (!url?.trim()) {
    return Response.json({ error: "Server URL is required." }, { status: 400 });
  }

  let client;
  try {
    client = await createMCPClient({
      transport: {
        type: "http",
        url: url.trim(),
        headers: authHeader?.trim()
          ? { Authorization: authHeader.trim() }
          : undefined,
      },
    });
    const { tools } = await client.listTools();
    return Response.json({
      serverName: client.serverInfo?.name,
      tools: tools.map((t) => ({ name: t.name, description: t.description })),
    });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error
            ? `Couldn't connect: ${err.message}`
            : "Couldn't connect to that MCP server.",
      },
      { status: 502 }
    );
  } finally {
    await client?.close();
  }
}
