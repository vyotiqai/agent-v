import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import { AppError } from "../errors.ts";

// Separate lists: a BlockList also matches IPv4 addresses against IPv4-mapped IPv6 rules.
const blockedV4 = new BlockList();
const blockedV6 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const)
  blockedV4.addSubnet(network, prefix, "ipv4");
// Addresses outside 2000::/3 (loopback, mapped, NAT64, ULA, link-local…) are rejected below.
for (const [network, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
] as const)
  blockedV6.addSubnet(network, prefix, "ipv6");

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blockedV4.check(address, "ipv4");
  if (family === 6) {
    // Only global unicast (2000::/3) is public; everything else is special-purpose.
    const first = Number.parseInt(address.split(":")[0] || "0", 16);
    return (
      !address.includes(".") && (first & 0xe000) === 0x2000 && !blockedV6.check(address, "ipv6")
    );
  }
  return false;
}

export interface SafeFetchOptions {
  allowPrivate?: boolean;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
}

export interface SafeResponse {
  url: string;
  status: number;
  contentType: string;
  body: string;
  truncated: boolean;
}

function validateUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError("That is not a valid URL", 422);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new AppError("Only http and https URLs are allowed", 422);
  if (url.username || url.password)
    throw new AppError("URLs with credentials are not allowed", 422);
  return url;
}

/**
 * Fetch a URL on behalf of the agent without letting it reach private networks. DNS is resolved
 * once, every address is checked, and the socket connects to the checked address, so a second
 * lookup cannot rebind the name. Redirects are followed manually and re-checked.
 */
export async function safeFetch(
  raw: string,
  options: SafeFetchOptions = {},
): Promise<SafeResponse> {
  const {
    allowPrivate = false,
    timeoutMs = 15_000,
    maxBytes = 2_000_000,
    maxRedirects = 5,
  } = options;
  const lookup: LookupFunction = (hostname, lookupOptions, callback) => {
    dnsLookup(hostname, { all: true, verbatim: true })
      .then((addresses) => {
        const usable = allowPrivate
          ? addresses
          : addresses.filter((a) => isPublicAddress(a.address));
        if (!usable.length || (!allowPrivate && usable.length !== addresses.length))
          throw new AppError(`${hostname} resolves to a private or reserved address`, 422);
        if (lookupOptions.all) callback(null, usable);
        else callback(null, usable[0]?.address ?? "", usable[0]?.family ?? 4);
      })
      .catch((error: Error) => callback(error as NodeJS.ErrnoException, ""));
  };
  const dispatcher = new Agent({ connect: { lookup, timeout: timeoutMs } });
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    let url = validateUrl(raw);
    for (let hop = 0; ; hop++) {
      if (isIP(url.hostname.replace(/^\[|\]$/g, "")) && !allowPrivate) {
        if (!isPublicAddress(url.hostname.replace(/^\[|\]$/g, "")))
          throw new AppError("That address is private or reserved", 422);
      }
      const response = await undiciFetch(url, {
        dispatcher,
        signal,
        redirect: "manual",
        method: options.method ?? "GET",
        headers: {
          "user-agent": "AgentV/0.1 (+https://github.com/vyotiqai/agent-v)",
          ...options.headers,
        },
        body: hop === 0 ? options.body : undefined,
      });
      if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
        await response.body?.cancel();
        if (hop >= maxRedirects) throw new AppError("Too many redirects", 422);
        url = validateUrl(new URL(response.headers.get("location") ?? "", url).toString());
        continue;
      }
      const chunks: Uint8Array[] = [];
      let size = 0;
      let truncated = false;
      if (response.body)
        for await (const chunk of response.body) {
          const remaining = maxBytes - size;
          if (chunk.byteLength > remaining) {
            chunks.push(chunk.subarray(0, remaining));
            size = maxBytes;
            truncated = true;
            break;
          }
          chunks.push(chunk);
          size += chunk.byteLength;
        }
      return {
        url: url.toString(),
        status: response.status,
        contentType: response.headers.get("content-type") ?? "",
        body: Buffer.concat(chunks).toString("utf8"),
        truncated,
      };
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    const cause = (error as { cause?: unknown }).cause;
    if (cause instanceof AppError) throw cause;
    if (signal.aborted) throw new AppError("The page took too long to respond", 504);
    throw new AppError(`Could not fetch the page: ${(error as Error).message}`, 502);
  } finally {
    await dispatcher.close();
  }
}

/** Turn HTML into readable text. Good enough for reading articles; the browser comes later. */
export function htmlToText(html: string): { title: string; text: string } {
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").trim();
  const text = decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(
        /<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article|\/title|\/header|\/nav)[^>]*>/gi,
        "\n",
      )
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, text };
}

function decodeEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1]?.toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
    }
    return named[code.toLowerCase()] ?? match;
  });
}
