"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useFeed } from "@/lib/useFeed";
import { useWatchlist } from "@/lib/useWatchlist";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";

const PERMISSION_KEY  = "litpump:notif:permission-asked";
const SEEN_KEY_PREFIX = "litpump:graduated-seen:";

/**
 * Mounted globally (in the layout). Polls the cached feed and fires a desktop
 * notification — plus an in-app toast — the first time a watched token is
 * observed in the `graduated` state.
 *
 * - Notifications are opt-in via a small footer banner the first time the user
 *   visits with at least one watched token.
 * - "Seen" graduation events are persisted in localStorage so the same token
 *   never alerts twice across sessions.
 */
export function GraduationWatcher() {
  const { feed } = useFeed();
  const watch = useWatchlist();

  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [askedBefore, setAskedBefore] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());

  // Load permission + "asked-before" flag once on mount.
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setPermission(Notification.permission);
    setAskedBefore(localStorage.getItem(PERMISSION_KEY) === "1");
    // Seed the "seen" set from localStorage so we don't re-notify across reloads.
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(SEEN_KEY_PREFIX)) seenRef.current.add(k.slice(SEEN_KEY_PREFIX.length));
    }
  }, []);

  // Watch the feed for newly-graduated tokens the user is following.
  useEffect(() => {
    if (!feed || !watch.hydrated) return;
    for (const t of feed.tokens) {
      if (!t.graduated) continue;
      if (!watch.has(t.token)) continue;
      const key = t.token.toLowerCase();
      if (seenRef.current.has(key)) continue;

      // Mark seen *before* notifying so a slow Notification API call can't double-fire.
      seenRef.current.add(key);
      try {
        localStorage.setItem(SEEN_KEY_PREFIX + key, String(Date.now()));
      } catch {}

      toast.success(`🎉 ${t.symbol} graduated`, {
        description: "The bonding curve is closed; trading moves to the DEX.",
        action: {
          label: "Open",
          onClick: () => {
            window.location.href = `/token/${t.token}`;
          },
        },
        duration: 8_000,
      });

      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        try {
          const n = new Notification(`🎉 ${t.symbol} graduated`, {
            body: `${t.name} reached the graduation threshold and is moving to the DEX.`,
            icon: "/icon",
            tag: `litpump-grad-${key}`,
          });
          n.onclick = () => {
            window.focus();
            window.location.href = `/token/${t.token}`;
            n.close();
          };
        } catch {
          /* notifications can fail on iOS PWA / restrictive browsers; non-fatal */
        }
      }
    }
  }, [feed, watch]);

  // Show the opt-in banner only when:
  //  - the API exists, permission is still "default", we haven't asked before,
  //  - and the user has actually started using watchlists.
  const canAsk =
    typeof window !== "undefined" &&
    "Notification" in window &&
    permission === "default" &&
    !askedBefore &&
    watch.hydrated &&
    watch.list.length > 0;

  if (!canAsk) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-sm card p-4 surface-glass shadow-xl">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-md bg-accent/10 border border-accent/30 text-accent flex items-center justify-center shrink-0">
          <Bell size={14} />
        </div>
        <div className="flex-1 text-xs">
          <div className="font-semibold text-zinc-100 text-sm">Get a ping when your watchlist graduates</div>
          <div className="text-zinc-400 mt-1 leading-snug">
            We'll send a desktop notification the moment any token you've starred
            crosses the graduation threshold.
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              className="btn btn-primary text-xs px-3 py-1.5"
              onClick={async () => {
                try {
                  const p = await Notification.requestPermission();
                  setPermission(p);
                } catch {}
                localStorage.setItem(PERMISSION_KEY, "1");
                setAskedBefore(true);
              }}
            >
              Enable
            </button>
            <button
              type="button"
              className="btn btn-ghost text-xs px-3 py-1.5"
              onClick={() => {
                localStorage.setItem(PERMISSION_KEY, "1");
                setAskedBefore(true);
              }}
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/// Minimal status badge for the Header — shows whether desktop notifications
/// are on, and lets the user revoke / re-enable from there.
export function NotificationToggle() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setPermission(Notification.permission);
  }, []);
  if (typeof window === "undefined" || !("Notification" in window)) return null;

  const enabled = permission === "granted";

  return (
    <button
      type="button"
      onClick={async () => {
        if (enabled) {
          // Browsers don't expose a programmatic revoke; just remind the user.
          toast("Notifications", {
            description: "To turn off, use your browser's site permission settings.",
          });
          return;
        }
        try {
          const p = await Notification.requestPermission();
          setPermission(p);
          if (p === "granted") toast.success("Notifications enabled");
        } catch {}
      }}
      title={enabled ? "Notifications enabled" : "Enable graduation notifications"}
      className={`btn btn-ghost ${enabled ? "text-emerald-300" : ""}`}
    >
      {enabled ? <Bell size={14} /> : <BellOff size={14} />}
    </button>
  );
}

// Re-export so `Link` import stays warning-free if upstream imports change.
export { Link };
