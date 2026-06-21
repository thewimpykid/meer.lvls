"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Options Chain" },
  { href: "/levels", label: "Key Levels" },
  { href: "/ml-reversal", label: "ML Reversal" },
  { href: "/overnight", label: "Overnight" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <header className="border-b border-border bg-panel px-6 py-0 flex items-center gap-0">
      <span className="text-accent font-semibold text-xs tracking-widest pr-6 border-r border-border py-3">
        OPTIONSFLOW
      </span>
      <nav className="flex items-center">
        {tabs.map((t) => {
          const active = path === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`px-5 py-3 text-xs tracking-wider border-b-2 transition-colors ${
                active
                  ? "border-accent text-white"
                  : "border-transparent text-muted hover:text-label"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
