"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

type Props = {
  value: string;
  onChange: (url: string) => void;
};

/**
 * Image upload widget. Posts the file to /api/pinata/upload which pins it to IPFS
 * via Pinata. Returns the resulting `ipfs://` URI for on-chain storage.
 *
 * Note: no wallet signature is required for image upload. The wallet popup only
 * appears at the actual launch / buy / sell transaction.
 */
export function ImageUploader({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/pinata/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Upload failed");
      // Prefer the ipfs:// URI on-chain so the gateway can be swapped client-side later.
      onChange(data.ipfsUri || data.gatewayUrl);
      toast.success("Image uploaded to IPFS");
    } catch (err: any) {
      toast.error(err?.shortMessage || err?.message || "IPFS upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-bg-border bg-bg-soft/40 p-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
        }}
      />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-bg border border-bg-border flex items-center justify-center text-zinc-500">
            <ImagePlus size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold">Upload image to IPFS</div>
            <div className="text-xs text-zinc-500 truncate">
              {value ? value : "PNG, JPG, GIF, WEBP · max 5MB"}
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="btn btn-ghost shrink-0"
        >
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
          {uploading ? "Uploading" : "Choose"}
        </button>
      </div>
    </div>
  );
}
