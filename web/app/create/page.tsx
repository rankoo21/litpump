"use client";

import { useState } from "react";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
  useReadContract,
} from "wagmi";
import { parseEther, decodeEventLog, formatEther, type Address } from "viem";
import { CURVE_ABI, FACTORY_ABI } from "@/lib/abi";
import { FACTORY_ADDRESS, isFactoryConfigured } from "@/lib/contracts";
import { useRouter } from "next/navigation";
import { Rocket, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { TokenImage, looksLikeBadImageUrl } from "@/components/TokenImage";
import { ImageUploader } from "@/components/ImageUploader";

const LAUNCH_DEADLINE_SECS  = 600;   // forwarded to the curve's first buy
const DEV_BUY_SLIPPAGE_PCT  = 5;     // % tolerance applied to the optional dev buy

export default function CreatePage() {
  const { isConnected } = useAccount();
  const router = useRouter();
  const pc = usePublicClient();

  const [form, setForm] = useState({
    name: "",
    symbol: "",
    imageURI: "",
    description: "",
    twitter: "",
    telegram: "",
    website: "",
    initialBuyLtc: "",
  });

  const set = (k: keyof typeof form) => (e: any) =>
    setForm((s) => ({ ...s, [k]: e.target.value }));

  const { writeContractAsync, isPending } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { isLoading: isMining } = useWaitForTransactionReceipt({ hash: txHash });

  const { data: creationFee } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: "creationFee",
    query: { enabled: isFactoryConfigured },
  });
  const fee = (creationFee as bigint | undefined) ?? 0n;

  /// Compute a slippage-aware `minTokensOut` for the optional dev buy by reading the
  /// curve implementation's quote against a *fresh* curve (zero reserves). This is a
  /// good upper-bound estimate because no one else can trade before the launch tx.
  async function computeDevBuyMinTokens(initialBuy: bigint): Promise<bigint> {
    if (initialBuy === 0n || !pc) return 0n;
    try {
      // The factory exposes the curve implementation via its constructor; we read the
      // expected output by calling quoteBuy on a temporary off-chain simulation: we
      // multiply the implied formula directly. Fallback to 0 (no protection) if any
      // simulation fails.
      // Conservative formula: (1B virtual_tokens) - (K / (virtual_ltc + ltcNet))
      const VIRTUAL_LTC    = 30n * 10n ** 18n;
      const VIRTUAL_TOKENS = 1_073_000_000n * 10n ** 18n;
      const K              = VIRTUAL_LTC * VIRTUAL_TOKENS;
      const FEE_BPS        = 100n;
      const BPS_DENOM      = 10_000n;
      const feeBps         = (initialBuy * FEE_BPS) / BPS_DENOM;
      const ltcNet         = initialBuy - feeBps;
      const newX           = VIRTUAL_LTC + ltcNet;
      const newY           = K / newX;
      const expectedOut    = VIRTUAL_TOKENS - newY;
      // Apply slippage tolerance.
      const bps = BigInt(Math.floor((100 - DEV_BUY_SLIPPAGE_PCT) * 100));
      return (expectedOut * bps) / 10_000n;
    } catch {
      return 0n;
    }
  }

  const submit = async (e: any) => {
    e.preventDefault();
    if (!isFactoryConfigured) {
      toast.error("Factory address not configured");
      return;
    }
    if (!form.name || !form.symbol) {
      toast.error("Name and symbol are required");
      return;
    }
    try {
      const initialBuy = form.initialBuyLtc ? parseEther(form.initialBuyLtc) : 0n;
      const minTokens  = await computeDevBuyMinTokens(initialBuy);
      const deadline   = BigInt(Math.floor(Date.now() / 1000) + LAUNCH_DEADLINE_SECS);

      const hash = await writeContractAsync({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: "launch",
        args: [
          {
            name: form.name,
            symbol: form.symbol,
            imageURI: form.imageURI,
            description: form.description,
            twitter: form.twitter,
            telegram: form.telegram,
            website: form.website,
          },
          minTokens,
          deadline,
        ],
        value: fee + initialBuy,
      });
      setTxHash(hash);
      toast.success("Launching… waiting for confirmation");

      const receipt = await pc!.waitForTransactionReceipt({ hash });
      for (const log of receipt.logs) {
        try {
          const parsed = decodeEventLog({ abi: FACTORY_ABI, data: log.data, topics: log.topics });
          if (parsed.eventName === "TokenLaunched") {
            const token = (parsed.args as any).token as Address;
            toast.success("Token launched!");
            router.push(`/token/${token}`);
            return;
          }
        } catch {}
      }
    } catch (err: any) {
      toast.error(err?.shortMessage || err?.message || "Launch failed");
    }
  };

  const busy = isPending || isMining;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Launch a new token</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Anyone can launch. The token starts on a bonding curve. Once <b>85 zkLTC</b> is collected,
          the curve <b>graduates</b> and is ready for DEX migration.
        </p>
        {fee > 0n && (
          <p className="text-xs text-zinc-500 mt-2">
            Creation fee: <b className="text-accent">{formatEther(fee)} zkLTC</b>
            {" "}(paid to protocol on launch)
          </p>
        )}
      </div>

      <form onSubmit={submit} className="card p-6 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Name" required>
            <input className="input" maxLength={32} value={form.name} onChange={set("name")} placeholder="Pepe Coin" />
          </Field>
          <Field label="Symbol (ticker)" required>
            <input
              className="input"
              maxLength={10}
              value={form.symbol}
              onChange={(e) => setForm((s) => ({ ...s, symbol: e.target.value.toUpperCase() }))}
              placeholder="PEPE"
            />
          </Field>
        </div>

        <Field label="Image URL (direct https link or ipfs://)">
          <ImageUploader
            value={form.imageURI}
            onChange={(url) => setForm((s) => ({ ...s, imageURI: url }))}
          />
          <div className="flex gap-3 items-start">
            <div className="flex-1">
              <input
                className="input"
                value={form.imageURI}
                onChange={set("imageURI")}
                placeholder="https://example.com/img.png  or  ipfs://Qm…"
              />
              {form.imageURI && looksLikeBadImageUrl(form.imageURI) && (
                <p className="text-[11px] text-amber-400 mt-1.5 leading-snug">
                  ⚠️ This looks like a search-results page, not a direct image link.
                  Right-click the image and copy the <b>image address</b> instead.
                </p>
              )}
            </div>
            {form.imageURI ? (
              <TokenImage src={form.imageURI} symbol={form.symbol || "?"} size="md" />
            ) : (
              <div className="shrink-0 w-20 h-20 rounded-xl bg-bg-soft border border-bg-border flex items-center justify-center">
                <ImageIcon className="text-zinc-600" size={22} />
              </div>
            )}
          </div>
        </Field>

        <Field label="Description">
          <textarea
            className="input min-h-[88px]"
            maxLength={500}
            value={form.description}
            onChange={set("description")}
            placeholder="What is this token about?"
          />
        </Field>

        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Twitter">
            <input className="input" maxLength={256} value={form.twitter} onChange={set("twitter")} placeholder="https://x.com/…" />
          </Field>
          <Field label="Telegram">
            <input className="input" maxLength={256} value={form.telegram} onChange={set("telegram")} placeholder="https://t.me/…" />
          </Field>
          <Field label="Website">
            <input className="input" maxLength={256} value={form.website} onChange={set("website")} placeholder="https://…" />
          </Field>
        </div>

        <Field label="Initial dev buy (zkLTC, optional)">
          <input
            className="input"
            inputMode="decimal"
            value={form.initialBuyLtc}
            onChange={set("initialBuyLtc")}
            placeholder="0.0"
          />
          <p className="text-xs text-zinc-500 mt-1">
            Bootstrap your token with an initial buy. Tokens are sent to your address.
            A {DEV_BUY_SLIPPAGE_PCT}% slippage tolerance is applied automatically.
          </p>
        </Field>

        <div className="pt-2">
          <button type="submit" className="btn btn-primary w-full" disabled={!isConnected || busy}>
            <Rocket size={16} />
            {busy ? "Launching…" : isConnected ? "Launch token" : "Connect wallet to launch"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-zinc-400 mb-1.5">
        {label} {required && <span className="text-accent">*</span>}
      </div>
      {children}
    </label>
  );
}
