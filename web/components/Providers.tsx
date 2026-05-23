"use client";

import { ReactNode, useEffect, useState } from "react";
import { WagmiProvider } from "wagmi";
import { hashFn } from "wagmi/query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { Toaster } from "sonner";
import { wagmiConfig } from "@/lib/wagmi";

export function Providers({ children }: { children: ReactNode }) {
  // Use wagmi's `hashFn` for query keys so BigInt arguments (very common in
  // contract reads like `[0n, 100n]`) don't blow up JSON.stringify during SSR.
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { queryKeyHashFn: hashFn },
        },
      })
  );

  // Strip injected stylesheets from extensions (e.g. Dark Reader) that mutate <body>
  // and break React hydration. Runs after mount + observes future mutations.
  useEffect(() => {
    const clean = () => {
      document
        .querySelectorAll<HTMLElement>('body style, body link[rel="stylesheet"]')
        .forEach((el) => {
          const cls = el.getAttribute("class") || "";
          const id = el.id || "";
          if (cls.includes("darkreader") || id.includes("darkreader")) el.remove();
        });
    };
    clean();
    const obs = new MutationObserver(clean);
    obs.observe(document.documentElement, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#a3ff12",
            accentColorForeground: "#0a0a0f",
            borderRadius: "medium",
          })}
        >
          {children}
          <Toaster theme="dark" position="bottom-right" richColors />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
