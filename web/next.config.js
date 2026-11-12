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
  // These are public LiteForge testnet contract addresses. Keeping the
  // deployment defaults here prevents a fresh host from rendering an empty
  // factory while still allowing each value to be overridden through env.
  env: {
    NEXT_PUBLIC_FACTORY_ADDRESS:
      process.env.NEXT_PUBLIC_FACTORY_ADDRESS || "0x74e648c412EE36E543D208E7c2c9552a81AFe47c",
    NEXT_PUBLIC_COMMENTS_ADDRESS:
      process.env.NEXT_PUBLIC_COMMENTS_ADDRESS || "0x5c4D46F6b089fE6b4bd8E4f4B621D15B5EC87E99",
    NEXT_PUBLIC_DEX_ROUTER:
      process.env.NEXT_PUBLIC_DEX_ROUTER || "0x1926cA6dcD165Bcea9912Eae51F0279b3AD16541",
    NEXT_PUBLIC_DEX_FACTORY:
      process.env.NEXT_PUBLIC_DEX_FACTORY || "0xeAb6b1eDB3b5eF2254119235eA7f9b6B4426A924",
    NEXT_PUBLIC_WLTC:
      process.env.NEXT_PUBLIC_WLTC || "0xAe17Ee3EEA585a1FEE19b41A6d76F8DAcf87aC50",
  },
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
