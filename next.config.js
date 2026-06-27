/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  async redirects() {
    return [
      // Admin-only app: send the root straight to the admin portal (no camp code).
      // The dormant teacher flow remains reachable at /teacher.
      { source: '/', destination: '/admin', permanent: false },
    ];
  },
  async headers() {
    // The public staff-link surface carries camper PII (name + dorm). Make sure
    // it is never indexed, never leaks a referrer, and is never cached by a
    // shared cache. Matches BOTH the HTML viewer (/r/*) and the JSON it fetches
    // (/api/r/*) — the JSON is what actually carries the PII.
    const antiLeak = [
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Cache-Control', value: 'no-store' },
    ];
    return [
      { source: '/r/:token*', headers: antiLeak },
      { source: '/api/r/:token*', headers: antiLeak },
    ];
  },
};

module.exports = nextConfig;
