"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { FiShield } from "react-icons/fi";
import { Brand } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";

/** Two-column public layout for the importer portal: branded context on the left, the task on the right. */
export function ImporterSplitLayout({ kicker, title, body, aside, topLink, children }: {
  kicker: string; title: ReactNode; body: string; aside?: ReactNode; topLink?: ReactNode; children: ReactNode;
}) {
  return <main className="iv-split">
    <section className="iv-hero" aria-label="Importer portal">
      <Link href="/" className="iv-hero-brand"><Brand compact /></Link>
      <div className="iv-hero-copy"><p className="iv-hero-kicker">{kicker}</p><h1>{title}</h1><p>{body}</p></div>
      {aside && <div className="iv-hero-aside">{aside}</div>}
      <p className="iv-hero-foot">ETHIOPIA CUSTOMS COMMISSION</p>
    </section>
    <section className="iv-main">
      <div className="iv-topbar"><span className="iv-topbar-label">IMPORTER PORTAL</span><div>{topLink}<ThemeToggle /></div></div>
      <div className="iv-main-body">{children}</div>
      <footer className="iv-footer"><span>© 2026 Ethiopia Customs Commission</span><span><FiShield aria-hidden="true" /> Information is used only for customs verification.</span></footer>
    </section>
  </main>;
}
