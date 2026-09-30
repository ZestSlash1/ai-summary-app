/**
 * Guards server-side fetches of user-supplied URLs (MCP connectors): only public http(s)
 * hosts, never loopback, private ranges, link-local metadata endpoints, or internal names.
 * It checks the URL as written; it does not resolve DNS, so it stops the obvious cases,
 * not a rebinding attack.
 */
export function isPublicHttpUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.username || url.password) return false;

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost")) return false;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")) return false;
  if (!host.includes(".") && !host.includes(":")) return false; // bare intranet names

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
    if (a >= 224) return false;
  }
  if (host.includes(":")) {
    // IPv6 literals: loopback, unspecified, unique-local, link-local, and mapped IPv4.
    if (host === "::1" || host === "::" || /^(fc|fd|fe8|fe9|fea|feb)/.test(host) || host.startsWith("::ffff:")) {
      return false;
    }
  }
  return true;
}
