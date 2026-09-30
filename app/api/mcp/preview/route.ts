import { createMCPClient } from "@ai-sdk/mcp";
import { isPublicHttpUrl } from "@/lib/safeUrl";
import { describeMcpError } from "@/lib/mcp";

export async function POST(request: Request) {
  const { url, authHeader } = (await request.json()) as {
    url?: string;
    authHeader?: string;
  };

  if (!url?.trim()) {
    return Response.json({ error: "Server URL is required." }, { status: 400 });
  }
  if (!isPublicHttpUrl(url.trim())) {
    return Response.json(
      { error: "Use a public http or https address. Local and private network addresses are not allowed." },
      { status: 400 }
    );
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
      { error: describeMcpError(err, { sentKey: Boolean(authHeader?.trim()) }) },
      { status: 502 }
    );
  } finally {
    await client?.close();
  }
}
