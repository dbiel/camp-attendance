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
};

module.exports = nextConfig;
