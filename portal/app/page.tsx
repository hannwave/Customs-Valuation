"use client";

import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { FiArrowRight, FiBarChart2, FiCheck, FiChevronDown, FiFileText, FiGlobe, FiLayers, FiPlayCircle, FiShield, FiUser } from "react-icons/fi";
import { Brand } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";

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
  const page = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);
    const context = gsap.context(() => {
      gsap.from(".landing-hero-copy > *", { y: 18, autoAlpha: 0, duration: .65, stagger: .1, ease: "power2.out" });
      [".service-card", ".step-card", ".evidence-inner > *", ".access-inner > *", ".footer-main > div"].forEach(selector => {
        gsap.from(selector, { y: 16, autoAlpha: 0, duration: .5, stagger: .08, ease: "power2.out", scrollTrigger: { trigger: selector, start: "top 88%", once: true } });
      });
    }, page);
    return () => context.revert();
  }, []);
  return <main className="landing-page" ref={page}>
    <header className="landing-nav">
      <Link href="/" className="landing-brand" aria-label="Ethiopia Customs Commission home"><Brand variant="dark" /></Link>
      <nav aria-label="Main navigation"><a className="is-active" href="#home">Home</a><Link href="/about">About</Link><Link href="/contact">Contact</Link></nav>
      <div className="landing-nav-actions"><ThemeToggle /><button className="landing-language" type="button"><FiGlobe /> EN <FiChevronDown /></button><Link href="/login" className="nav-sign-in"><FiUser /> Sign in</Link></div>
    </header>

    <section className="landing-hero" id="home">
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

    <section className="landing-section landing-how" id="about">
      <SectionTitle title="How the system works" subtitle="From search to decision." />
      <div className="landing-wrap landing-step-grid">
        {steps.map(([number, title, description]) => <article className="step-card" key={number}><span className="step-number">{number}</span><h3>{title}</h3><p>{description}</p></article>)}
      </div>
    </section>

    <section className="landing-evidence" aria-label="Accountable customs operations">
      <div className="landing-wrap evidence-inner"><div><p className="evidence-kicker">Built for accountable customs operations</p><h2>Reliable evidence for<br />customs professionals.</h2></div><div className="evidence-points">{["Centralized information", "Consistent reference data", "Evidence-based decisions", "Role-based access", "Traceable valuation activities"].map(point => <span key={point}><FiCheck />{point}</span>)}</div></div>
    </section>

    <section className="landing-access" id="contact"><div className="landing-wrap access-inner"><div className="access-avatar"><FiUser /></div><div><h3>Ready to access the workspace?</h3><p>Sign in to access customs valuation evidence.</p></div><Link href="/login" className="landing-primary"><FiUser /> Sign in to workspace <FiArrowRight /></Link></div></section>

    <footer className="landing-footer"><div className="landing-wrap footer-main"><div><Brand variant="light" /><p className="footer-portal">Customs Valuation Portal</p></div><div><h4>Navigation</h4><a href="#home">Home</a><a href="#about">About</a><a href="#contact">Contact</a></div><div><h4>Support</h4><a href="#contact">Help</a><a href="#contact">User Guide</a><a href="#contact">FAQs</a></div><div><h4>Legal</h4><a href="#contact">Privacy Policy</a><a href="#contact">Terms of Service</a></div></div><div className="landing-wrap footer-bottom"><span>© 2026 Ethiopia Customs Commission</span><span>Secure borders. Prosperous nation.</span></div></footer>
  </main>;
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) { return <div className="section-title"><div><span /><h2>{title}</h2><span /></div><p>{subtitle}</p></div>; }
