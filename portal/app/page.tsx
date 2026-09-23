"use client";

import Link from "next/link";
import { useState } from "react";
import {
  FiArrowRight, FiBarChart2, FiCheck, FiFileText, FiLayers, FiMenu,
  FiPlayCircle, FiShield, FiUser, FiX,
} from "react-icons/fi";
import { Brand } from "@/components/Brand";

const services = [
  { icon: FiFileText, title: "HS Code & Tariff Management", items: ["HS revisions", "National tariff codes", "Classification history", "Tariff rules"] },
  { icon: FiLayers, title: "Price Intelligence", items: ["International reference prices", "Local market prices", "Historical prices", "Price sources"] },
  { icon: FiBarChart2, title: "Analytics", items: ["Price statistics", "Historical trends", "Country comparisons", "Outlier detection"] },
  { icon: FiShield, title: "Decision Support", items: ["Evidence review", "Reference-value selection", "Officer justification", "Decision history"] },
];

const steps = [
  ["01", "Search", "Search by HS code, tariff item, description, or related product information."],
  ["02", "Review", "Review classification and reference-price information."],
  ["03", "Compare", "Examine available evidence and compare price information."],
  ["04", "Decide", "Use the evidence to support an informed valuation decision."],
];

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  return <main className="landing-page" id="home">
    <header className="landing-nav">
      <Link href="/" className="landing-brand" aria-label="Ethiopia Customs Commission home"><Brand variant="dark" /></Link>
      <button className="landing-menu-toggle" type="button" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="landing-navigation" onClick={() => setMenuOpen(open => !open)}>{menuOpen ? <FiX /> : <FiMenu />}</button>
      <nav id="landing-navigation" className={menuOpen ? "is-open" : ""} aria-label="Main navigation"><a className="is-active" href="#home" onClick={() => setMenuOpen(false)}>Home</a><a href="#platform" onClick={() => setMenuOpen(false)}>Platform</a><a href="#process" onClick={() => setMenuOpen(false)}>How it works</a><a href="#contact" onClick={() => setMenuOpen(false)}>Contact</a></nav>
      <Link href="/login" className="nav-sign-in"><FiUser aria-hidden="true" /> Sign in</Link>
    </header>

    <section className="landing-hero">
      <div className="landing-wrap landing-hero-copy">
        <p className="landing-kicker">Customs Valuation Portal <span /></p>
        <h1>Better evidence.<br /><em>Smarter valuation.</em></h1>
        <p className="landing-tagline">Secure borders. Prosperous nation.</p>
        <div className="landing-hero-actions"><Link href="/login" className="landing-primary"><FiUser /> Sign in to workspace <FiArrowRight /></Link><a className="landing-secondary" href="#platform"><FiPlayCircle /> Learn about the system</a></div>
      </div>
    </section>

    <section className="landing-section" id="platform">
      <SectionTitle title="What the platform provides" subtitle="Everything you need for accurate and transparent customs valuation." />
      <div className="landing-wrap landing-card-grid">
        {services.map(({ icon: Icon, title, items }) => <article className="service-card" key={title}><div className="service-icon"><Icon /></div><h3>{title}</h3><ul>{items.map(item => <li key={item}><FiCheck />{item}</li>)}</ul></article>)}
      </div>
    </section>

    <section className="landing-section landing-how" id="process">
      <SectionTitle title="How the system works" subtitle="From search to decision." />
      <div className="landing-wrap landing-step-grid">
        {steps.map(([number, title, description]) => <article className="step-card" key={number}><span className="step-number">{number}</span><h3>{title}</h3><p>{description}</p></article>)}
      </div>
    </section>

    <section className="landing-evidence" aria-label="Accountable customs operations">
      <div className="landing-wrap evidence-inner"><div><p className="evidence-kicker">Built for accountable customs operations</p><h2>Reliable evidence for<br />customs professionals.</h2></div><div className="evidence-points">{["Centralized information", "Consistent reference data", "Evidence-based decisions", "Role-based access", "Traceable valuation activities"].map(point => <span key={point}><FiCheck />{point}</span>)}</div></div>
    </section>

    <section className="landing-access" id="contact"><div className="landing-wrap access-inner"><div className="access-avatar"><FiUser /></div><div><h3>Ready to access the workspace?</h3><p>Sign in to access customs valuation evidence.</p></div><Link href="/login" className="landing-primary"><FiUser /> Sign in to workspace <FiArrowRight /></Link></div></section>

    <footer className="landing-footer"><div className="landing-wrap footer-main"><div><Brand variant="light" /><p className="footer-portal">Customs Valuation Portal</p></div><div><h4>Explore</h4><a href="#home">Home</a><a href="#platform">Platform</a><a href="#process">How it works</a></div><div><h4>Workspace</h4><Link href="/login">Officer sign in</Link><Link href="/signup">Request an account</Link></div><div><h4>Purpose</h4><span>Fair trade</span><span>Evidence-led valuation</span><span>Accountable decisions</span></div></div><div className="landing-wrap footer-bottom"><span>© 2026 Ethiopia Customs Commission</span><span>Secure borders. Prosperous nation.</span></div></footer>
  </main>;
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) { return <div className="section-title"><div><span /><h2>{title}</h2><span /></div><p>{subtitle}</p></div>; }
