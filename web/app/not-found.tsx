import Link from "next/link";
import { Compass, Rocket } from "lucide-react";

export default function NotFound() {
  return (
    <div className="max-w-xl mx-auto card p-10 text-center mt-12">
      <div className="w-12 h-12 mx-auto rounded-full bg-accent/10 border border-accent/30 text-accent flex items-center justify-center">
        <Compass size={22} />
      </div>
      <h1 className="mt-4 text-2xl font-extrabold tracking-tight">404 · Lost in the curve</h1>
      <p className="mt-2 text-sm text-zinc-500 max-w-sm mx-auto leading-relaxed">
        That page doesn't exist on LitPump. The token might have been removed,
        or the link could be stale. Let's get you back on track.
      </p>
      <div className="mt-6 flex items-center justify-center gap-2">
        <Link href="/" className="btn btn-primary">Explore tokens</Link>
        <Link href="/create" className="btn btn-ghost">
          <Rocket size={14} /> Launch a token
        </Link>
      </div>
    </div>
  );
}
