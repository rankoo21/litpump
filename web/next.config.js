/** @type {import('next').NextConfig} */
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
    ].join("; "),
  },
  { key: "X-Frame-Options",        value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy",        value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",     value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },

  // Turbopack (default in Next 16). Maps the same optional-dep stubs the
  // webpack config used to apply, so wagmi/walletconnect/metamask-sdk build
  // cleanly even though they reference React Native and Pino under the hood.
  turbopack: {
    resolveAlias: {
      "@react-native-async-storage/async-storage": { browser: "./empty-module.js" },
      "pino-pretty": { browser: "./empty-module.js" },
      "lokijs": { browser: "./empty-module.js" },
      "encoding": { browser: "./empty-module.js" },
    },
  },

  // Webpack fallback (kept for `next dev --webpack` mode if anyone forces it).
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve = config.resolve || {};
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
};

module.exports = nextConfig;
