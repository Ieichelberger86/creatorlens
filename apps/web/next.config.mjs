/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@creatorlens/db", "@creatorlens/shared"],
  typedRoutes: true,
  outputFileTracingRoot: new URL("../..", import.meta.url).pathname,
  // apify-client uses dynamic requires for proxy-agent and node-fetch internals
  // that webpack can't statically analyze. Externalize so the serverless
  // bundle uses Node's runtime resolution against node_modules.
  serverExternalPackages: [
    "apify-client",
    "proxy-agent",
    "@anthropic-ai/sdk",
    "replicate",
  ],
  // Force proxy-agent + its proxy backends into the serverless bundle.
  // apify-client require()'s these dynamically, which Vercel's static tracer
  // misses, causing the cron functions to fail at runtime with "Cannot find
  // module 'proxy-agent'".
  outputFileTracingIncludes: {
    "/api/cron/competitor-watch": [
      "../../node_modules/.pnpm/proxy-agent@*/node_modules/**",
      "../../node_modules/.pnpm/pac-proxy-agent@*/node_modules/**",
      "../../node_modules/.pnpm/http-proxy-agent@*/node_modules/**",
      "../../node_modules/.pnpm/https-proxy-agent@*/node_modules/**",
      "../../node_modules/.pnpm/socks-proxy-agent@*/node_modules/**",
      "../../node_modules/.pnpm/agent-base@*/node_modules/**",
    ],
    "/api/cron/auto-postmortem": [
      "../../node_modules/.pnpm/proxy-agent@*/node_modules/**",
      "../../node_modules/.pnpm/pac-proxy-agent@*/node_modules/**",
      "../../node_modules/.pnpm/http-proxy-agent@*/node_modules/**",
      "../../node_modules/.pnpm/https-proxy-agent@*/node_modules/**",
      "../../node_modules/.pnpm/socks-proxy-agent@*/node_modules/**",
      "../../node_modules/.pnpm/agent-base@*/node_modules/**",
    ],
    "/api/chat": [
      "../../node_modules/.pnpm/proxy-agent@*/node_modules/**",
      "../../node_modules/.pnpm/pac-proxy-agent@*/node_modules/**",
      "../../node_modules/.pnpm/http-proxy-agent@*/node_modules/**",
      "../../node_modules/.pnpm/https-proxy-agent@*/node_modules/**",
      "../../node_modules/.pnpm/socks-proxy-agent@*/node_modules/**",
      "../../node_modules/.pnpm/agent-base@*/node_modules/**",
    ],
  },
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
