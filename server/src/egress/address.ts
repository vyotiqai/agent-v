import { lookup as dnsLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

/**
 * Which addresses the outside world may be reached at (stage 6, section 5).
 *
 * Every call Agent V makes to the internet on someone's behalf, and every page a cloud browser
 * loads, may reach only public addresses: never our own network, the cloud's metadata server,
 * or anything else that isn't the open internet. This file is that rule, and nothing else.
 */

// IPv4 ranges that are not the public internet (IANA special-purpose registry, RFC 6890 and after).
const V4_SPECIAL: [string, number][] = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT, also used inside clouds
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, including the cloud metadata server 169.254.169.254
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.31.196.0', 24], // AS112
  ['192.52.193.0', 24], // AMT
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // private
  ['192.175.48.0', 24], // AS112 direct delegation
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, and 255.255.255.255
];

// Inside global unicast (2000::/3), the IPv6 ranges that are still not the public internet.
const V6_SPECIAL: [string, number][] = [
  ['2001::', 23], // IETF protocol assignments, including Teredo (2001::/32)
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4: wraps an IPv4 address we would have to check separately
  ['3fff::', 20], // documentation
];

const v4 = new BlockList();
for (const [net, prefix] of V4_SPECIAL) v4.addSubnet(net, prefix, 'ipv4');
const v6Global = new BlockList();
v6Global.addSubnet('2000::', 3, 'ipv6');
const v6 = new BlockList();
for (const [net, prefix] of V6_SPECIAL) v6.addSubnet(net, prefix, 'ipv6');

/** True only for an address on the public internet. Anything unusual is refused. */
export function isPublicAddress(address: string): boolean {
  const ip = address.startsWith('[') && address.endsWith(']') ? address.slice(1, -1) : address;
  if (ip.includes('%')) return false; // an IPv6 zone: only link-local addresses carry one
  const family = isIP(ip);
  if (family === 4) return !v4.check(ip, 'ipv4');
  if (family !== 6) return false;
  // IPv4 written as IPv6 (::ffff:10.0.0.1) is judged as the IPv4 address it is.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return isPublicAddress(mapped[1] as string);
  // Only global unicast is public; loopback, unique-local, link-local, multicast, NAT64 and the
  // rest all fall outside 2000::/3.
  return v6Global.check(ip, 'ipv6') && !v6.check(ip, 'ipv6');
}

export type Resolved =
  | { ok: true; address: string }
  | { ok: false; kind: 'private-address' | 'dns' };

export type Lookup = (host: string) => Promise<string[]>;

const systemLookup: Lookup = async (host) =>
  (await dnsLookup(host, { all: true, verbatim: true })).map((a) => a.address);

/**
 * Finds the one address to connect to for a host, or says why there is none. A name is refused
 * if any of its addresses is private, not just the one we'd pick, so a name can't be pointed half
 * at the internet and half at us. The caller connects to the returned address itself, never to
 * the name again, so the answer can't change between this check and the connection.
 */
export async function resolvePublic(
  host: string,
  lookup: Lookup = systemLookup,
): Promise<Resolved> {
  const literal = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (isIP(literal) !== 0 || literal.includes('%')) {
    return isPublicAddress(literal)
      ? { ok: true, address: literal }
      : { ok: false, kind: 'private-address' };
  }
  let addresses: string[];
  try {
    addresses = await lookup(literal);
  } catch {
    return { ok: false, kind: 'dns' };
  }
  if (addresses.length === 0) return { ok: false, kind: 'dns' };
  if (!addresses.every(isPublicAddress)) return { ok: false, kind: 'private-address' };
  return { ok: true, address: addresses[0] as string };
}
