"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * Root-level error boundary. Captures any uncaught client error and renders
 * a friendly recovery page instead of a blank screen.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In production this would forward to Sentry / a server-side logger.
    // For testnet we just write to the console so devs can grab the trace.
    // eslint-disable-next-line no-console
    console.error("[LitPump] uncaught error:", error);
  }, [error]);

  return (
    <div className="max-w-xl mx-auto card p-10 text-center mt-12">
      <div className="w-12 h-12 mx-auto rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center justify-center">
        <AlertTriangle size={22} />
      </div>
      <h1 className="mt-4 text-xl font-bold">Something broke</h1>
      <p className="mt-2 text-sm text-zinc-500 max-w-sm mx-auto leading-relaxed">
        The page hit an unexpected error. We've logged it for review. You can
        try again, or head back to explore.
      </p>
      {error?.digest && (
        <p className="mt-3 text-[11px] font-mono text-zinc-700">
          Reference: {error.digest}
        </p>
      )}
      <div className="mt-6 flex items-center justify-center gap-2">
        <button onClick={reset} className="btn btn-primary">
          <RefreshCw size={14} /> Try again
        </button>
        <Link href="/" className="btn btn-ghost">← Back to explore</Link>
      </div>
    </div>
  );
}
