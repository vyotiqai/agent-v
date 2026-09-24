import type { LookupFunction } from "node:net";
import { BlockedDestinationError, parseWebUrl, resolvePublic } from "@agent-v/net";
import { Agent, fetch as undiciFetch } from "undici";
import { AppError } from "../errors.ts";

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

export { isPublicAddress } from "@agent-v/net";

const blocked = (error: unknown) =>
  error instanceof BlockedDestinationError ? new AppError(error.message, 422) : null;

function validateUrl(raw: string): URL {
  try {
    return parseWebUrl(raw);
  } catch (error) {
    throw blocked(error) ?? error;
  }
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
    resolvePublic(hostname, { allowPrivate })
      .then((addresses) => {
        if (lookupOptions.all) callback(null, addresses);
        else callback(null, addresses[0]?.address ?? "", addresses[0]?.family ?? 4);
      })
      .catch((error: Error) => callback((blocked(error) ?? error) as NodeJS.ErrnoException, ""));
  };
  const dispatcher = new Agent({ connect: { lookup, timeout: timeoutMs } });
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    let url = validateUrl(raw);
    for (let hop = 0; ; hop++) {
      // Literal IPs never reach the lookup hook, so check them (and private names) here.
      await resolvePublic(url.hostname, { allowPrivate }).catch((error) => {
        throw blocked(error) ?? error;
      });
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
