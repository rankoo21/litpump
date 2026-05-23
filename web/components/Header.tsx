"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Rocket, Receipt, Briefcase, Menu, X } from "lucide-react";
import { TransactionsDrawer } from "./TransactionsDrawer";
import { Logo } from "./Logo";
import { NotificationToggle } from "./GraduationWatcher";

export function Header() {
  const [mounted, setMounted] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setMounted(true), []);
  // Close mobile nav on route change
  useEffect(() => setMobileNavOpen(false), [pathname]);

  const navItems = [
    { href: "/",            label: "Explore" },
    { href: "/leaderboard", label: "Leaderboard" },
    { href: "/portfolio",   label: "Portfolio", icon: <Briefcase size={14} /> },
  ] as const;

  return (
    <header className="sticky top-0 z-30 border-b border-bg-border bg-bg/75 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="flex items-center gap-2.5 group shrink-0">
            <Logo size={32} className="group-hover:scale-105 transition-transform" />
            <div className="font-bold tracking-tight text-lg leading-none">
              Lit<span className="text-accent">Pump</span>
            </div>
          </Link>
          <span className="badge hidden md:inline-flex">LiteForge Testnet</span>
        </div>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-1">
          {navItems.map((it) => {
            const active = pathname === it.href;
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`tab inline-flex items-center gap-1.5 ${active ? "" : ""}`}
                data-active={active}
              >
                {("icon" in it && it.icon) || null}
                {it.label}
              </Link>
            );
          })}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {mounted && (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="btn btn-ghost hidden md:inline-flex"
              title="My transactions"
            >
              <Receipt size={14} />
              <span className="hidden lg:inline">Activity</span>
            </button>
          )}

          {mounted && <span className="hidden md:inline-flex"><NotificationToggle /></span>}

          <Link href="/create" className="btn btn-primary">
            <Rocket size={15} />
            <span className="hidden sm:inline">Launch</span>
          </Link>

          {mounted ? (
            <ConnectButton
              chainStatus="icon"
              showBalance={{ smallScreen: false, largeScreen: true }}
              accountStatus={{ smallScreen: "avatar", largeScreen: "address" }}
            />
          ) : (
            <button className="btn btn-ghost" disabled>Connect</button>
          )}

          {/* Mobile menu trigger */}
          <button
            type="button"
            onClick={() => setMobileNavOpen((v) => !v)}
            className="btn btn-ghost lg:hidden"
            aria-label="Toggle menu"
          >
            {mobileNavOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>

      {/* Mobile nav drawer */}
      {mobileNavOpen && (
        <nav className="lg:hidden border-t border-bg-border bg-bg-soft/80 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col gap-1">
            {navItems.map((it) => {
              const active = pathname === it.href;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                    active
                      ? "bg-accent text-bg"
                      : "text-zinc-300 hover:bg-bg-elev hover:text-white"
                  }`}
                >
                  {it.label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setDrawerOpen(true);
                setMobileNavOpen(false);
              }}
              className="px-3 py-2 rounded-md text-sm font-medium text-left text-zinc-300 hover:bg-bg-elev hover:text-white transition inline-flex items-center gap-2"
            >
              <Receipt size={14} /> Activity
            </button>
          </div>
        </nav>
      )}

      <TransactionsDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </header>
  );
}
