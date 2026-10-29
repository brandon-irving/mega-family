// v0.17b (G5 review S1): which hosts a server-side fetch of a user-supplied link may reach. A Convex action can't
// resolve names to IPs, so this blocks IP literals by range and host names that only make sense inside a network
// (localhost, .local, .internal, …). The WHATWG URL parser has already normalized decimal/hex/octal IPv4 and
// IPv6 forms by the time a hostname reaches here. Lists come from config (ICS.blocked*).

type Lists = { hostnames: readonly string[]; suffixes: readonly string[]; ipv4: readonly string[]; ipv6: readonly string[] };

function ipv4ToInt(s: string): number | null {
  const parts = s.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p) || Number(p) > 255) return null;
    n = n * 256 + Number(p);
  }
  return n;
}

function inIpv4Range(ip: number, cidr: string): boolean {
  const [base, bits] = cidr.split('/');
  const b = ipv4ToInt(base);
  if (b === null) return false;
  const size = 2 ** (32 - Number(bits));
  return Math.floor(ip / size) === Math.floor(b / size);
}

/** An IPv6 address (no brackets) → 8 groups, or null. Handles `::` and a trailing dotted IPv4. */
function ipv6Groups(s: string): number[] | null {
  let text = s.toLowerCase();
  const dotted = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const v4 = ipv4ToInt(dotted[2]);
    if (v4 === null) return null;
    text = `${dotted[1]}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const parse = (h: string) => (h ? h.split(':') : []);
  const head = parse(halves[0]);
  const tail = halves.length === 2 ? parse(halves[1]) : [];
  const fill = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : fill < 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? fill : 0).fill('0'), ...tail];
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

function inIpv6Range(groups: number[], cidr: string): boolean {
  const [base, bitsText] = cidr.split('/');
  const b = ipv6Groups(base);
  if (!b) return false;
  let bits = Number(bitsText);
  for (let i = 0; i < 8 && bits > 0; i++, bits -= 16) {
    const take = Math.min(16, bits);
    const mask = (0xffff << (16 - take)) & 0xffff;
    if ((groups[i] & mask) !== (b[i] & mask)) return false;
  }
  return true;
}

/** True when a server-side fetch must not go to this URL hostname (as `URL.hostname` gives it). */
export function isBlockedHost(hostname: string, lists: Lists): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (lists.hostnames.includes(host) || lists.suffixes.some((s) => host.endsWith(s))) return true;
  const v4 = ipv4ToInt(host);
  if (v4 !== null) return lists.ipv4.some((c) => inIpv4Range(v4, c));
  if (host.startsWith('[') && host.endsWith(']')) {
    const g = ipv6Groups(host.slice(1, -1));
    if (!g) return true;
    // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) addresses are judged as the IPv4 inside.
    if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0) && (g[6] || g[7] || g[5] === 0xffff)) {
      const inner = g[6] * 65536 + g[7];
      if (lists.ipv4.some((c) => inIpv4Range(inner, c))) return true;
    }
    return lists.ipv6.some((c) => inIpv6Range(g, c));
  }
  return false;
}
