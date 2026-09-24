import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/** Network guard shared by the API and the browser worker: only public addresses are reachable. */
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

/** Thrown when a destination is private, reserved or otherwise not allowed. */
export class BlockedDestinationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedDestinationError";
  }
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

/**
 * Resolve a host once and check every address. Callers connect to the returned addresses, so
 * a second lookup cannot rebind the name to an internal host.
 */
export async function resolvePublic(
  hostname: string,
  options: { allowPrivate?: boolean; timeoutMs?: number } = {},
): Promise<ResolvedAddress[]> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (!options.allowPrivate && /(^|\.)(localhost|local|internal|home|lan|intranet)$/i.test(host))
    throw new BlockedDestinationError(`${host} is a private host name`);
  const literal = isIP(host);
  const addresses: ResolvedAddress[] = literal
    ? [{ address: host, family: literal as 4 | 6 }]
    : ((await withTimeout(
        lookup(host, { all: true, verbatim: true }),
        options.timeoutMs ?? 5000,
        `Could not resolve ${host}`,
      )) as ResolvedAddress[]);
  if (!addresses.length) throw new BlockedDestinationError(`Could not resolve ${host}`);
  if (!options.allowPrivate && addresses.some((a) => !isPublicAddress(a.address)))
    throw new BlockedDestinationError(`${host} resolves to a private or reserved address`);
  return addresses;
}

/** Only plain http(s) URLs without embedded credentials. */
export function parseWebUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedDestinationError("That is not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new BlockedDestinationError("Only http and https URLs are allowed");
  if (url.username || url.password)
    throw new BlockedDestinationError("URLs with credentials are not allowed");
  return url;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new BlockedDestinationError(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
