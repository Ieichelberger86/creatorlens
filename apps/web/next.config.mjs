/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@creatorlens/db", "@creatorlens/shared"],
  typedRoutes: true,
  outputFileTracingRoot: new URL("../..", import.meta.url).pathname,
  webpack: (config) => {
    // Allow workspace packages to use `.js` import specifiers that point to `.ts` source
    // (required because the packages themselves are NodeNext-friendly for the API/agent builds).
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
