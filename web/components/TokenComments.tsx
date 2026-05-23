"use client";

import { useEffect, useState } from "react";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { type Address } from "viem";
import { COMMENTS_ABI } from "@/lib/abi";
import { COMMENTS_ADDRESS, isCommentsConfigured } from "@/lib/contracts";
import { shortAddr, timeAgo } from "@/lib/format";
import { MessageCircle, SendHorizontal } from "lucide-react";
import { toast } from "sonner";

type CommentItem = {
  author: Address;
  token: Address;
  createdAt: bigint;
  text: string;
};

export function TokenComments({ token }: { token: Address }) {
  const { isConnected } = useAccount();
  const [text, setText] = useState("");
  const [hash, setHash] = useState<`0x${string}` | undefined>();

  const { data, refetch, isLoading } = useReadContract({
    address: COMMENTS_ADDRESS,
    abi: COMMENTS_ABI,
    functionName: "getComments",
    args: [token, 0n, 50n],
    query: { enabled: isCommentsConfigured, refetchInterval: 10_000 },
  });

  const comments = ((data as CommentItem[] | undefined) ?? []).slice().reverse();
  const { writeContractAsync, isPending } = useWriteContract();
  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) {
      toast.success("Comment posted");
      setText("");
      setHash(undefined);
      refetch();
    }
  }, [isSuccess, refetch]);

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (trimmed.length > 280) {
      toast.error("Comment max is 280 characters");
      return;
    }
    try {
      const h = await writeContractAsync({
        address: COMMENTS_ADDRESS,
        abi: COMMENTS_ABI,
        functionName: "postComment",
        args: [token, trimmed],
      });
      setHash(h);
      toast.success("Posting comment…");
    } catch (err: any) {
      toast.error(err?.shortMessage || err?.message || "Failed to post comment");
    }
  }

  if (!isCommentsConfigured) {
    return (
      <div className="card p-5 text-sm text-zinc-500">
        <div className="flex items-center gap-2 font-semibold text-zinc-300 mb-1">
          <MessageCircle size={16} /> Comments
        </div>
        Deploy `TokenComments.sol` and set `NEXT_PUBLIC_COMMENTS_ADDRESS` to enable comments.
      </div>
    );
  }

  const busy = isPending || isMining;

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-bg-border flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold">
          <MessageCircle size={16} /> Comments
        </div>
        <span className="text-xs text-zinc-500">{comments.length}</span>
      </div>

      <div className="p-4 border-b border-bg-border space-y-2">
        <textarea
          className="input min-h-[78px] resize-none"
          maxLength={280}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={isConnected ? "Say something about this token…" : "Connect wallet to comment"}
          disabled={!isConnected || busy}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-zinc-600">{text.length}/280</span>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!isConnected || busy || !text.trim()}
            onClick={submit}
          >
            <SendHorizontal size={15} /> {busy ? "Posting…" : "Post"}
          </button>
        </div>
      </div>

      <div className="divide-y divide-bg-border">
        {isLoading ? (
          <div className="p-6 text-center text-sm text-zinc-500">Loading comments…</div>
        ) : comments.length === 0 ? (
          <div className="p-6 text-center text-sm text-zinc-500">No comments yet. Be first.</div>
        ) : (
          comments.map((c, i) => (
            <div key={`${c.author}-${c.createdAt}-${i}`} className="p-4">
              <div className="flex items-center justify-between gap-3 text-xs mb-1">
                <span className="font-mono text-zinc-300">{shortAddr(c.author)}</span>
                <span className="text-zinc-600">{timeAgo(c.createdAt)}</span>
              </div>
              <p className="text-sm text-zinc-300 whitespace-pre-wrap break-words">{c.text}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
