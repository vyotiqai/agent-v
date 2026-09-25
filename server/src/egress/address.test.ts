import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPublicAddress, type Lookup, resolvePublic } from './address.ts';

const NOT_PUBLIC = [
  // IPv4
  '0.0.0.0',
  '10.0.0.1',
  '10.255.255.255',
  '100.64.0.1',
  '100.127.255.254',
  '127.0.0.1',
  '127.1.2.3',
  '169.254.169.254',
  '172.16.0.1',
  '172.31.255.255',
  '192.0.0.8',
  '192.0.2.1',
  '192.88.99.1',
  '192.168.1.1',
  '198.18.0.1',
  '198.19.255.255',
  '198.51.100.7',
  '203.0.113.9',
  '224.0.0.1',
  '239.255.255.250',
  '240.0.0.1',
  '255.255.255.255',
  // IPv6
  '::',
  '::1',
  '[::1]',
  'fc00::1',
  'fd12:3456:789a::1',
  'fe80::1',
  'fe80::1%eth0',
  'fec0::1',
  'ff02::1',
  '::ffff:127.0.0.1',
  '::ffff:10.0.0.1',
  '::ffff:169.254.169.254',
  '::ffff:7f00:1',
  '0:0:0:0:0:ffff:7f00:1',
  '64:ff9b::a00:1',
  '100::1',
  '2001::1',
  '2001:0:4136:e378:8000:63bf:3fff:fdd2',
  '2001:db8::1',
  '2002:c000:0204::1',
  '3fff::1',
  // Not addresses at all
  '',
  'localhost',
  '1.2.3',
  '999.1.1.1',
];

const PUBLIC = [
  '1.1.1.1',
  '8.8.8.8',
  '93.184.215.14',
  '100.63.255.255',
  '100.128.0.1',
  '172.15.255.255',
  '172.32.0.1',
  '192.169.0.1',
  '198.17.255.255',
  '223.255.255.254',
  '::ffff:8.8.8.8',
  '2606:4700:4700::1111',
  '[2606:4700:4700::1111]',
  '2a00:1450:4001:80e::200e',
];

test('addresses outside the public internet are refused', () => {
  for (const a of NOT_PUBLIC) assert.equal(isPublicAddress(a), false, a);
});

test('public addresses are allowed', () => {
  for (const a of PUBLIC) assert.equal(isPublicAddress(a), true, a);
});

const table: Record<string, string[]> = {
  'example.com': ['93.184.215.14', '2606:2800:21f:cb07:6820:80da:af6b:8b2c'],
  'internal.example': ['10.1.2.3'],
  'half.example': ['93.184.215.14', '127.0.0.1'],
  'metadata.google.internal': ['169.254.169.254'],
  'empty.example': [],
};
const fakeLookup: Lookup = async (host) => {
  const found = table[host];
  if (!found) throw new Error('ENOTFOUND');
  return found;
};

test('a name is allowed only when every address it has is public', async () => {
  assert.deepEqual(await resolvePublic('example.com', fakeLookup), {
    ok: true,
    address: '93.184.215.14',
  });
  for (const host of ['internal.example', 'half.example', 'metadata.google.internal']) {
    assert.deepEqual(
      await resolvePublic(host, fakeLookup),
      { ok: false, kind: 'private-address' },
      host,
    );
  }
});

test('a name that does not resolve is a DNS failure', async () => {
  assert.deepEqual(await resolvePublic('nowhere.example', fakeLookup), { ok: false, kind: 'dns' });
  assert.deepEqual(await resolvePublic('empty.example', fakeLookup), { ok: false, kind: 'dns' });
});

test('address literals are judged without DNS', async () => {
  const noDns: Lookup = async () => {
    throw new Error('DNS must not be used for a literal');
  };
  assert.deepEqual(await resolvePublic('8.8.8.8', noDns), { ok: true, address: '8.8.8.8' });
  assert.deepEqual(await resolvePublic('[2606:4700:4700::1111]', noDns), {
    ok: true,
    address: '2606:4700:4700::1111',
  });
  assert.deepEqual(await resolvePublic('[::1]', noDns), { ok: false, kind: 'private-address' });
  assert.deepEqual(await resolvePublic('[fe80::1%eth0]', noDns), {
    ok: false,
    kind: 'private-address',
  });
});

test('the system resolver: localhost and numeric tricks resolve to loopback and are refused', async () => {
  // These go through the real resolver, which reads /etc/hosts and parses numeric forms itself.
  for (const host of ['localhost', '2130706433', '0x7f000001', '127.1']) {
    const r = await resolvePublic(host);
    assert.equal(r.ok, false, host);
  }
});
