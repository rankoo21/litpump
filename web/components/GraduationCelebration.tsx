"use client";

import { useEffect, useRef, useState } from "react";

/**
 * One-shot celebratory burst that renders confetti when `graduated` flips to true.
 * Pure CSS + a small JS particle generator — no third-party dependency.
 *
 * Persists a "seen" flag in sessionStorage keyed on the token's curve address so
 * we don't show the celebration again every time the user reopens the same page.
 */
export function GraduationCelebration({
  graduated,
  storageKey,
}: {
  graduated: boolean;
  storageKey: string;
}) {
  const [active, setActive] = useState(false);
  const seen = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!graduated || seen.current) return;
    const flag = `litpump:graduated:${storageKey}`;
    if (sessionStorage.getItem(flag)) {
      seen.current = true;
      return;
    }
    seen.current = true;
    sessionStorage.setItem(flag, "1");
    setActive(true);
    const t = setTimeout(() => setActive(false), 4_500);
    return () => clearTimeout(t);
  }, [graduated, storageKey]);

  if (!active) return null;

  // Generate ~50 particles deterministically.
  const particles = Array.from({ length: 50 }, (_, i) => {
    const left = (i * 7919) % 100;
    const delay = ((i * 17) % 600) / 1000;
    const duration = 2.2 + ((i * 13) % 12) / 10;
    const colors = ["#a3ff12", "#facc15", "#22c55e", "#3b82f6", "#ef4444", "#a855f7"];
    const color = colors[i % colors.length];
    const drift = ((i * 31) % 80) - 40;
    return { left, delay, duration, color, drift, key: i };
  });

  return (
    <div
      className="fixed inset-0 pointer-events-none z-[60] overflow-hidden"
      aria-hidden
    >
      {/* Centred banner */}
      <div className="absolute top-24 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full bg-accent text-bg font-bold shadow-glow animate-bounce">
        🎉 Graduated! Curve closed.
      </div>

      {particles.map((p) => (
        <span
          key={p.key}
          className="absolute top-[-10px] block w-2 h-3 rounded-sm"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animation: `litpump-fall ${p.duration}s linear ${p.delay}s forwards`,
            // CSS variable consumed by the keyframes for horizontal drift.
            ["--drift" as any]: `${p.drift}vw`,
          }}
        />
      ))}

      <style jsx global>{`
        @keyframes litpump-fall {
          0%   { transform: translate3d(0, 0, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate3d(var(--drift), 110vh, 0) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
