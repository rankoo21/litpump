import Link from "next/link";
import { BookOpen, Github } from "lucide-react";
import { Logo } from "./Logo";
import { XIcon } from "./icons";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-bg-border bg-bg-soft/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2.5">
              <Logo size={32} />
              <div className="font-bold tracking-tight text-lg">
                Lit<span className="text-accent">Pump</span>
              </div>
            </div>
            <p className="mt-3 text-xs text-zinc-500 leading-relaxed max-w-[240px]">
              Permissionless memecoin launchpad on LitVM. Fair launch, anti-snipe,
              creator-fee share, graduate to DEX.
            </p>
          </div>

          {/* Product */}
          <div>
            <div className="section-heading">Product</div>
            <ul className="mt-3 space-y-2 text-sm">
              <FooterLink href="/">Explore</FooterLink>
              <FooterLink href="/create">Launch token</FooterLink>
              <FooterLink href="/leaderboard">Leaderboard</FooterLink>
              <FooterLink href="/portfolio">Portfolio</FooterLink>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <div className="section-heading">Resources</div>
            <ul className="mt-3 space-y-2 text-sm">
              <FooterLink href="https://www.litvm.com" external>
                <BookOpen size={12} /> LitVM Docs
              </FooterLink>
              <FooterLink href="https://liteforge.hub.caldera.xyz/" external>
                Faucet
              </FooterLink>
              <FooterLink href="https://liteforge.explorer.caldera.xyz" external>
                Block explorer
              </FooterLink>
            </ul>
          </div>

          {/* Trust */}
          <div>
            <div className="section-heading">Trust</div>
            <ul className="mt-3 space-y-2 text-sm">
              <FooterLink href="https://github.com/rankoo21/litpump" external>
                <Github size={12} /> Source code
              </FooterLink>
              <FooterLink href="https://x.com/litpump_" external>
                <XIcon size={11} /> @litpump_
              </FooterLink>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-bg-border flex flex-wrap items-center justify-between gap-3 text-[11px] text-zinc-600">
          <span>
            © {new Date().getFullYear()} LitPump · Built on{" "}
            <a className="text-accent hover:underline" href="https://www.litvm.com">LitVM</a>
            {" "} · LiteForge testnet
          </span>
          <span className="text-zinc-700">
            Trading memecoins is high-risk. Do your own research. Not financial advice.
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({
  href,
  external,
  children,
}: {
  href: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  const cls = "inline-flex items-center gap-1.5 text-zinc-400 hover:text-zinc-100 transition";
  return (
    <li>
      {external ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
          {children}
        </a>
      ) : (
        <Link href={href} className={cls}>
          {children}
        </Link>
      )}
    </li>
  );
}
