import { createServer, request } from "node:http";
import { type AddressInfo, connect } from "node:net";
import { BlockedDestinationError, parseWebUrl, resolvePublic } from "@agent-v/net";

/** Marks responses the proxy refused, so the worker can tell them apart from a site's own 403. */
export const blockedHeader = "x-agent-v-blocked";

export interface EgressProxy {
  url: string;
  close(): Promise<void>;
}

const hopByHop = new Set([
  "connection",
  "keep-alive",
  "proxy-connection",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function splitHostPort(target: string): { host: string; port: number } | null {
  const match = /^\[?([^\]]+?)\]?:(\d+)$/.exec(target);
  if (!match?.[1] || !match[2]) return null;
  return { host: match[1], port: Number(match[2]) };
}

/**
 * Chromium's only way out. Every request is resolved here once, checked against the network
 * guard, and connected to the checked address, so pages cannot reach private networks or
 * cloud metadata even through DNS rebinding. Only ports 80 and 443 are allowed.
 */
export async function startEgressProxy(options: { allowPrivate: boolean }): Promise<EgressProxy> {
  const allowedPort = (port: number) => options.allowPrivate || port === 80 || port === 443;

  const server = createServer(async (req, res) => {
    try {
      const url = parseWebUrl(req.url ?? "");
      if (url.protocol !== "http:") throw new BlockedDestinationError("Use CONNECT for https");
      const port = Number(url.port || 80);
      if (!allowedPort(port)) throw new BlockedDestinationError(`Port ${port} is not allowed`);
      const [address] = await resolvePublic(url.hostname, { allowPrivate: options.allowPrivate });
      if (!address) throw new BlockedDestinationError("No address");
      const headers: Record<string, string | string[]> = {};
      for (const [key, value] of Object.entries(req.headers))
        if (value !== undefined && !hopByHop.has(key.toLowerCase())) headers[key] = value;
      headers.host = url.host;
      const upstream = request(
        {
          host: address.address,
          family: address.family,
          port,
          method: req.method,
          path: `${url.pathname}${url.search}`,
          headers,
          setHost: false,
          timeout: 30_000,
        },
        (response) => {
          res.writeHead(response.statusCode ?? 502, response.headers);
          response.pipe(res);
        },
      );
      upstream.on("timeout", () => upstream.destroy());
      upstream.on("error", () => {
        if (!res.headersSent) res.writeHead(502).end();
        else res.destroy();
      });
      req.pipe(upstream);
    } catch (error) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8", [blockedHeader]: "1" });
      res.end(`Blocked by Agent V: ${(error as Error).message}`);
    }
  });

  server.on("connect", async (req, client, head) => {
    const target = splitHostPort(req.url ?? "");
    try {
      if (!target) throw new BlockedDestinationError("Bad CONNECT target");
      if (!allowedPort(target.port)) throw new BlockedDestinationError("Port not allowed");
      const [address] = await resolvePublic(target.host, { allowPrivate: options.allowPrivate });
      if (!address) throw new BlockedDestinationError("No address");
      const upstream = connect({
        host: address.address,
        port: target.port,
        family: address.family,
      });
      upstream.setTimeout(60_000, () => upstream.destroy());
      upstream.once("connect", () => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        upstream.pipe(client);
        client.pipe(upstream);
      });
      upstream.on("error", () => client.destroy());
      client.on("error", () => upstream.destroy());
    } catch {
      client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    }
  });
  server.on("clientError", (_error, socket) => socket.destroy());

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
