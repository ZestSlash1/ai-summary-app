import type { McpConnector } from "./mcp";

export type McpCatalogGroup = "web" | "docs" | "accounts";

export type McpCatalogEntry = {
  /** Stable id, saved on the connector as catalogId. */
  id: string;
  name: string;
  /** What the model can do with it, in a few words. */
  blurb: string;
  /** A remote MCP server over streamable HTTP, the only transport the chat route speaks. */
  url: string;
  group: McpCatalogGroup;
  /** Set when the server needs a key. It is sent as "Authorization: Bearer <key>". */
  key?: { label: string; placeholder: string; getUrl: string };
};

export const MCP_CATALOG_GROUPS: { id: McpCatalogGroup; title: string }[] = [
  { id: "web", title: "Search and read the web" },
  { id: "docs", title: "Code and docs" },
  { id: "accounts", title: "Your accounts" },
];

/**
 * Remote MCP servers that are ready to switch on. Each one was checked with the same client
 * the chat route uses: the ones without a key answered real tool calls, and the ones with a
 * key accept it as a Bearer token. Servers that only sign in through OAuth (Notion, Sentry,
 * Vercel) are left out, because connectors here carry a key, not a sign-in.
 */
export const MCP_CATALOG: McpCatalogEntry[] = [
  {
    id: "exa",
    name: "Exa",
    blurb: "Search the web and read pages. Free, rate limited.",
    url: "https://mcp.exa.ai/mcp",
    group: "web",
  },
  {
    id: "firecrawl",
    name: "Firecrawl",
    blurb: "Scrape any page to clean markdown, and search the web.",
    url: "https://mcp.firecrawl.dev/v2/mcp",
    group: "web",
    key: { label: "Firecrawl API key", placeholder: "fc-...", getUrl: "https://www.firecrawl.dev/app/api-keys" },
  },
  {
    id: "tavily",
    name: "Tavily",
    blurb: "Web search, extraction, and crawling built for agents.",
    url: "https://mcp.tavily.com/mcp/",
    group: "web",
    key: { label: "Tavily API key", placeholder: "tvly-...", getUrl: "https://app.tavily.com/home" },
  },
  {
    id: "jina",
    name: "Jina AI",
    blurb: "Read any URL, screenshot pages, search the web and arXiv.",
    url: "https://mcp.jina.ai/v1",
    group: "web",
    key: { label: "Jina API key", placeholder: "jina_...", getUrl: "https://jina.ai/api-dashboard" },
  },
  {
    id: "apify",
    name: "Apify",
    blurb: "Run ready-made scrapers for thousands of sites.",
    url: "https://mcp.apify.com",
    group: "web",
    key: { label: "Apify API token", placeholder: "apify_api_...", getUrl: "https://console.apify.com/settings/integrations" },
  },
  {
    id: "context7",
    name: "Context7",
    blurb: "Current docs and code examples for thousands of libraries.",
    url: "https://mcp.context7.com/mcp",
    group: "docs",
  },
  {
    id: "deepwiki",
    name: "DeepWiki",
    blurb: "Ask questions about any public GitHub repo.",
    url: "https://mcp.deepwiki.com/mcp",
    group: "docs",
  },
  {
    id: "grep",
    name: "Grep",
    blurb: "Search real code across public GitHub repos.",
    url: "https://mcp.grep.app",
    group: "docs",
  },
  {
    id: "microsoft-learn",
    name: "Microsoft Learn",
    blurb: "Microsoft and Azure docs, with code samples.",
    url: "https://learn.microsoft.com/api/mcp",
    group: "docs",
  },
  {
    id: "cloudflare-docs",
    name: "Cloudflare Docs",
    blurb: "Workers, Pages, R2, and the rest of Cloudflare's docs.",
    url: "https://docs.mcp.cloudflare.com/mcp",
    group: "docs",
  },
  {
    id: "aws-knowledge",
    name: "AWS Knowledge",
    blurb: "AWS docs, API references, and regional availability.",
    url: "https://knowledge-mcp.global.api.aws",
    group: "docs",
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    blurb: "Search models, datasets, and Spaces on the Hub.",
    url: "https://huggingface.co/mcp",
    group: "docs",
  },
  {
    id: "github",
    name: "GitHub",
    blurb: "Issues, pull requests, Actions, and code in your repos.",
    url: "https://api.githubcopilot.com/mcp/",
    group: "accounts",
    key: {
      label: "GitHub personal access token",
      placeholder: "github_pat_... (read-only is safest)",
      getUrl: "https://github.com/settings/personal-access-tokens",
    },
  },
  {
    id: "supabase",
    name: "Supabase",
    blurb: "Look through your projects and run read-only SQL.",
    url: "https://mcp.supabase.com/mcp?read_only=true",
    group: "accounts",
    key: { label: "Supabase access token", placeholder: "sbp_...", getUrl: "https://supabase.com/dashboard/account/tokens" },
  },
  {
    id: "stripe",
    name: "Stripe",
    blurb: "Customers, payments, and invoices in your Stripe account.",
    url: "https://mcp.stripe.com",
    group: "accounts",
    key: {
      label: "Stripe restricted key",
      placeholder: "rk_... (a restricted key is safest)",
      getUrl: "https://dashboard.stripe.com/apikeys",
    },
  },
  {
    id: "linear",
    name: "Linear",
    blurb: "Find, create, and update issues and projects.",
    url: "https://mcp.linear.app/mcp",
    group: "accounts",
    key: { label: "Linear API key", placeholder: "lin_api_...", getUrl: "https://linear.app/settings/account/security" },
  },
];

/** The saved connector for a catalog entry, once it has connected. */
export function catalogConnector(
  entry: McpCatalogEntry,
  { authHeader, toolNames }: { authHeader?: string; toolNames: string[] }
): McpConnector {
  return {
    id: `catalog:${entry.id}`,
    catalogId: entry.id,
    name: entry.name,
    url: entry.url,
    authHeader,
    enabled: true,
    toolNames,
  };
}
