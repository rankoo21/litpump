"use client";

import Link from "next/link";
import { ShieldCheck, Lock, Zap, Users, Pause, Hash, Sparkles, FileText } from "lucide-react";

export default function SecurityPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-10">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-bg-soft/60 bg-grid">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none" />
        <div className="relative px-6 sm:px-10 py-12">
          <span className="badge badge-success">
            <ShieldCheck size={11} /> Internal pre-audit complete
          </span>
          <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight">
            Security at <span className="text-accent">LitPump</span>
          </h1>
          <p className="mt-3 text-zinc-400 max-w-2xl">
            We've shipped LitPump on a foundation of OpenZeppelin v5 building blocks,
            invariant-tested math, and a public self-audit report. An external audit is
            on the roadmap before any mainnet deployment.
          </p>
        </div>
      </section>

      {/* Pillars */}
      <section className="grid sm:grid-cols-2 gap-4">
        <Pillar
          icon={<Lock size={16} />}
          title="Reentrancy & CEI"
          body="Every state-mutating entry point (buy, sell, launch) is wrapped in OpenZeppelin's nonReentrant guard, and all external calls happen after state updates."
        />
        <Pillar
          icon={<Zap size={16} />}
          title="Anti-snipe protection"
          body="During the first 3 blocks after launch, no single address can buy more than 0.5 zkLTC. This protects retail from front-running bots."
        />
        <Pillar
          icon={<Users size={16} />}
          title="Creator fee share"
          body="50% of the 1% trading fee goes directly to the token creator. Fair-launch incentive without hidden taxes or upgradeable contracts."
        />
        <Pillar
          icon={<Pause size={16} />}
          title="Kill-switch & 2-step admin"
          body="The factory is Pausable for emergency response and uses OpenZeppelin's Ownable2Step so privileges can never be lost to a typo."
        />
        <Pillar
          icon={<Hash size={16} />}
          title="EIP-1167 minimal proxies"
          body="Tokens and curves are deployed as deterministic CREATE2 clones. No nonce-prediction tricks; deployment cost is constant and addresses are pre-known."
        />
        <Pillar
          icon={<Sparkles size={16} />}
          title="49 tests + invariants"
          body="Our Foundry suite covers happy paths, every revert path, fuzz tests, and four invariant checks (K, balance==reserves, supply==sold, sale-cap)."
        />
      </section>

      {/* Audit details */}
      <section id="audit" className="card p-6 sm:p-8 space-y-4">
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-emerald-300" />
          <h2 className="text-xl font-bold">Self-audit report</h2>
        </div>
        <p className="text-sm text-zinc-400">
          Before opening the contracts to external review, we ran a structured internal
          pass classifying findings as Critical / High / Medium / Low / Info and shipped
          a fix for every actionable item. Highlights:
        </p>

        <ul className="space-y-2 text-sm text-zinc-300">
          <FixRow label="Buy overpay near supply cap" detail="Fixed — quoteBuy now returns ltcConsumed and buy refunds the surplus." />
          <FixRow label="Sell underflow on excess input"   detail="Fixed — quoteSell and sell revert with InsufficientTokens." />
          <FixRow label="Brittle nonce-prediction CREATE"   detail="Replaced with EIP-1167 + CREATE2 minimal-proxy clones." />
          <FixRow label="Reentrancy via fee recipient"     detail="Fixed — nonReentrant + CEI; fee transfer is the last interaction." />
          <FixRow label="No deadline parameter on trades"  detail="Added; bounded at 30 days into the future." />
          <FixRow label="Anonymous IPFS upload endpoint"   detail="Wallet-signature gated, per-signer rate limit." />
          <FixRow label="javascript: XSS via metadata"     detail="safeUrl helper enforces an http(s) allowlist before render." />
          <FixRow label="N+1 RPC reads on event scanners"  detail="Block timestamps are batched via Promise.all per unique block." />
        </ul>

        <p className="text-sm text-zinc-500">
          The full inventory and rationale lives in <code className="text-zinc-300">AUDIT.md</code>{" "}
          alongside <code className="text-zinc-300">SECURITY.md</code>, our responsible-disclosure policy.
        </p>
      </section>

      <div className="flex justify-center">
        <Link href="/" className="btn btn-ghost">← Back to explore</Link>
      </div>
    </div>
  );
}

function Pillar({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-300">
          {icon}
        </span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <p className="text-sm text-zinc-400 leading-relaxed">{body}</p>
    </div>
  );
}

function FixRow({ label, detail }: { label: string; detail: string }) {
  return (
    <li className="flex gap-3">
      <span className="text-emerald-400 mt-0.5">✓</span>
      <span>
        <span className="font-semibold text-zinc-100">{label}.</span>{" "}
        <span className="text-zinc-400">{detail}</span>
      </span>
    </li>
  );
}
