"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { FiArrowRight, FiBarChart2, FiCheck, FiExternalLink, FiFileText, FiGlobe, FiLayers, FiLogIn, FiMapPin, FiMenu, FiUser, FiUserPlus, FiX } from "react-icons/fi";
import { Brand } from "@/components/Brand";
import { LandingLanguageSelect } from "@/components/LandingLanguageSelect";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LiveIcon, type AnimatedIcon } from "@/components/landing/LiveIcon";
import { ActivityIcon } from "@/components/landing/icons/activity";
import { BellIcon } from "@/components/landing/icons/bell";
import { CpuIcon } from "@/components/landing/icons/cpu";
import { DollarSignIcon } from "@/components/landing/icons/dollar-sign";
import { EarthIcon } from "@/components/landing/icons/earth";
import { FileTextIcon } from "@/components/landing/icons/file-text";
import { LayersIcon } from "@/components/landing/icons/layers";
import { LockIcon } from "@/components/landing/icons/lock";
import { MapPinIcon } from "@/components/landing/icons/map-pin";
import { SearchIcon } from "@/components/landing/icons/search";
import { UserCheckIcon } from "@/components/landing/icons/user-check";
import { UserPlusIcon } from "@/components/landing/icons/user-plus";
import { UsersIcon } from "@/components/landing/icons/users";
import { importerApiBase } from "@/lib/importer";

// Representative regional centres until branches carry their own coordinates.
const REGION_CENTERS: Record<string, readonly [number, number]> = {
  ADDIS_ABABA: [9.03, 38.74], AFAR: [11.75, 40.75], AMHARA: [11.5, 38.5], BENISHANGUL_GUMUZ: [10.75, 35.8], CENTRAL_ETHIOPIA: [8.2, 38.3],
  DIRE_DAWA: [9.6, 41.85], GAMBELA: [8.25, 34.6], HARARI: [9.31, 42.13], OROMIA: [7.55, 39.0], SIDAMA: [6.7, 38.4], SOMALI: [6.5, 44.5],
  SOUTH_ETHIOPIA: [6.0, 37.5], SOUTH_WEST_ETHIOPIA_PEOPLES: [7.0, 35.6], TIGRAY: [14.1, 38.5],
};
const HEAD_OFFICE_QUERY = "Ethiopian Customs Commission, Addis Ababa";

type Region = { id: string; name: string; officialCode: string };
type Branch = { id: string; name: string; parentLocationId: string | null };
type NetworkRegion = { code: string; name: string; branches: string[]; center: readonly [number, number] };

/** Google Maps embed (no API key): the head office by name, or a region centred and zoomed. */
const mapUrl = (region: NetworkRegion | null) => region
  ? `https://maps.google.com/maps?q=${region.center[0]},${region.center[1]}&z=7&output=embed`
  : `https://maps.google.com/maps?q=${encodeURIComponent(HEAD_OFFICE_QUERY)}&z=14&output=embed`;
const mapLink = (region: NetworkRegion | null) => region
  ? `https://www.google.com/maps/search/?api=1&query=${region.center[0]},${region.center[1]}`
  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(HEAD_OFFICE_QUERY)}`;

/** Loads the public region and branch lists for the offices section. */
function useCustomsNetwork() {
  const [regions, setRegions] = useState<NetworkRegion[] | null>(null);
  useEffect(() => {
    let active = true;
    const json = <T,>(url: string) => fetch(url).then(response => (response.ok ? (response.json() as Promise<T>) : Promise.reject()));
    Promise.all([json<Region[]>(`${importerApiBase}/auth/importer-regions`), json<Branch[]>(`${importerApiBase}/auth/registration-locations`).catch(() => [] as Branch[])])
      .then(([regionList, branches]) => {
        if (!active) return;
        setRegions(regionList.filter(region => REGION_CENTERS[region.officialCode]).map(region => ({
          code: region.officialCode, name: region.name, center: REGION_CENTERS[region.officialCode],
          branches: branches.filter(branch => branch.parentLocationId === region.id).map(branch => branch.name),
        })));
      })
      .catch(() => { if (active) setRegions([]); });
    return () => { active = false; };
  }, []);
  return regions;
}

/** A card whose animated icon replays every time the card is hovered or focused. */
function useReplay() {
  const [play, setPlay] = useState(0);
  const replay = () => setPlay(count => count + 1);
  return { play, handlers: { onMouseEnter: replay, onFocus: replay } };
}

function Step({ icon, title, text, index }: { icon: AnimatedIcon; title: string; text: string; index: number }) {
  const { play, handlers } = useReplay();
  return <li className="lp-step" {...handlers}>
    <span className="lp-step-num">{String(index + 1).padStart(2, "0")}</span>
    <span className="lp-step-icon"><LiveIcon icon={icon} play={play} delay={index * 180} /></span>
    <h3>{title}</h3><p>{text}</p>
  </li>;
}

function Feature({ icon, title, text, index }: { icon: AnimatedIcon; title: string; text: string; index: number }) {
  const { play, handlers } = useReplay();
  return <article className="lp-feature" tabIndex={-1} {...handlers}>
    <span className="lp-feature-icon"><LiveIcon icon={icon} play={play} delay={(index % 3) * 150} /></span>
    <h3>{title}</h3><p>{text}</p>
  </article>;
}

function PortalIcon({ icon, play }: { icon: AnimatedIcon; play: number }) {
  return <span className="lp-portal-icon"><LiveIcon icon={icon} size={26} play={play} /></span>;
}

export default function LandingPage() {
  const { t } = useTranslation();
  const page = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const importerCard = useReplay();
  const staffCard = useReplay();
  const regions = useCustomsNetwork();

  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuOpen(false); menuButton.current?.focus(); }
    };
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, [menuOpen]);

  // Page choreography. Everything is skipped for people who ask for reduced motion; the page is complete without it.
  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);
    const context = gsap.context(() => {
      // Header slides in, then gains a shadow once the page scrolls.
      gsap.from(".lp-nav", { yPercent: -100, duration: 0.7, ease: "power3.out" });
      ScrollTrigger.create({ start: 24, end: "max", toggleClass: { targets: ".lp-nav", className: "is-scrolled" } });

      // Hero: the film settles in, the headline rises line by line, then the rest follows.
      const hero = gsap.timeline({ defaults: { ease: "power3.out" } });
      hero.from(".lp-hero-scene", { scale: 1.14, duration: 2.4, ease: "power2.out" }, 0)
        .from(".lp-kicker", { x: -24, autoAlpha: 0, duration: 0.6 }, 0.25)
        .from(".lp-kicker span", { scaleX: 0, transformOrigin: "left center", duration: 0.8 }, 0.45)
        .from(".lp-line-inner", { yPercent: 110, duration: 0.9, stagger: 0.12 }, 0.35)
        .from(".lp-lead", { y: 24, autoAlpha: 0, duration: 0.7 }, 0.75)
        .from(".lp-hero-actions .lp-btn", { y: 22, scale: 0.94, autoAlpha: 0, duration: 0.6, stagger: 0.1, ease: "back.out(1.7)" }, 0.9)
        .from(".lp-hero-proof li", { y: 16, autoAlpha: 0, duration: 0.5, stagger: 0.1 }, 1.1)
        .from(".lp-hero-motto", { autoAlpha: 0, x: -16, duration: 0.6 }, 1.3)
        .from(".lp-hero-caption", { x: 60, autoAlpha: 0, duration: 0.8 }, 1.2);

      // Scrolling past the hero: the film drifts slower than the page and the copy lifts away.
      gsap.to(".lp-hero-scene", { yPercent: 14, ease: "none", scrollTrigger: { trigger: ".lp-hero", start: "top top", end: "bottom top", scrub: true } });
      gsap.to(".lp-hero-copy", { y: -70, autoAlpha: 0.15, ease: "none", scrollTrigger: { trigger: ".lp-hero", start: "35% top", end: "bottom top", scrub: true } });

      // Section headings.
      gsap.utils.toArray<HTMLElement>(".lp-section-head").forEach(head => {
        gsap.from(head.children, { y: 34, autoAlpha: 0, duration: 0.8, stagger: 0.1, ease: "power3.out", scrollTrigger: { trigger: head, start: "top 85%", once: true } });
      });

      // Journey: steps rise in turn while a gold line draws across them as you scroll.
      gsap.from(".lp-step", { y: 50, autoAlpha: 0, duration: 0.8, stagger: 0.12, ease: "power3.out", scrollTrigger: { trigger: ".lp-steps", start: "top 82%", once: true } });
      gsap.fromTo(".lp-steps-progress", { scaleX: 0 }, { scaleX: 1, ease: "none", scrollTrigger: { trigger: ".lp-steps", start: "top 75%", end: "bottom 45%", scrub: 0.6 } });

      // Portals slide in from either side; their checklists tick in.
      gsap.from(".lp-portal.is-importer", { x: -80, rotate: -2, autoAlpha: 0, duration: 1, ease: "power3.out", scrollTrigger: { trigger: ".lp-portals", start: "top 80%", once: true } });
      gsap.from(".lp-portal.is-staff", { x: 80, rotate: 2, autoAlpha: 0, duration: 1, ease: "power3.out", scrollTrigger: { trigger: ".lp-portals", start: "top 80%", once: true } });
      gsap.from(".lp-portal li", { x: -14, autoAlpha: 0, duration: 0.45, stagger: 0.06, delay: 0.45, ease: "power2.out", scrollTrigger: { trigger: ".lp-portals", start: "top 80%", once: true } });

      // Features pop in as a grid.
      gsap.from(".lp-feature", { y: 46, scale: 0.94, autoAlpha: 0, duration: 0.7, stagger: { each: 0.09, grid: "auto", from: "start" }, ease: "power3.out", scrollTrigger: { trigger: ".lp-features", start: "top 82%", once: true } });

      // Offices: text and map reveal; the map unrolls from the top.
      gsap.from(".lp-office-panel > *", { y: 26, autoAlpha: 0, duration: 0.6, stagger: 0.08, ease: "power3.out", scrollTrigger: { trigger: ".lp-offices", start: "top 80%", once: true } });
      gsap.fromTo(".lp-map", { clipPath: "inset(0 0 100% 0 round 22px)" }, { clipPath: "inset(0 0 0% 0 round 22px)", duration: 1.2, ease: "power3.inOut", scrollTrigger: { trigger: ".lp-offices", start: "top 78%", once: true } });

      // Call to action: the route artwork drifts, the text rises.
      gsap.fromTo(".lp-cta-art", { yPercent: -10, scale: 1.1 }, { yPercent: 10, scale: 1, ease: "none", scrollTrigger: { trigger: ".lp-cta", start: "top bottom", end: "bottom top", scrub: true } });
      gsap.from(".lp-cta-inner > *", { y: 34, autoAlpha: 0, duration: 0.8, stagger: 0.15, ease: "power3.out", scrollTrigger: { trigger: ".lp-cta", start: "top 82%", once: true } });
      gsap.from(".lp-footer-main > div", { y: 24, autoAlpha: 0, duration: 0.6, stagger: 0.08, ease: "power2.out", scrollTrigger: { trigger: ".lp-footer", start: "top 92%", once: true } });
    }, page);
    return () => context.revert();
  }, []);

  // Office counts and region chips arrive after the page mounts, so they animate once the data is in.
  useLayoutEffect(() => {
    if (!regions?.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);
    const context = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>(".lp-count").forEach(node => {
        const target = Number(node.dataset.value ?? 0);
        const counter = { value: 0 };
        gsap.to(counter, { value: target, duration: 1.4, ease: "power2.out", onUpdate: () => { node.textContent = String(Math.round(counter.value)); },
          scrollTrigger: { trigger: node, start: "top 90%", once: true } });
      });
      gsap.from(".lp-region-list li", { y: 14, autoAlpha: 0, duration: 0.4, stagger: 0.035, ease: "power2.out", scrollTrigger: { trigger: ".lp-region-list", start: "top 88%", once: true } });
    }, page);
    return () => context.revert();
  }, [regions]);

  const journey = useMemo(() => [
    { icon: UserPlusIcon as AnimatedIcon, title: t("landing.journey.s1Title", "Register and get verified"), text: t("landing.journey.s1", "Importers, businesses and customs agents open an account with their licence, TIN and ID. Officers in their region verify it.") },
    { icon: FileTextIcon as AnimatedIcon, title: t("landing.journey.s2Title", "Declare the goods"), text: t("landing.journey.s2", "Describe the item, the price paid, freight and insurance, and upload the invoice, packing list and certificate of origin.") },
    { icon: CpuIcon as AnimatedIcon, title: t("landing.journey.s3Title", "Documents are checked"), text: t("landing.journey.s3", "An AI document scanner reads every upload and flags files that do not match the declaration for the officer.") },
    { icon: SearchIcon as AnimatedIcon, title: t("landing.journey.s4Title", "Classified and valued"), text: t("landing.journey.s4", "The officer confirms the HS tariff line and the customs value, backed by international price evidence.") },
    { icon: DollarSignIcon as AnimatedIcon, title: t("landing.journey.s5Title", "Official assessment"), text: t("landing.journey.s5", "Duties and taxes are computed from ERCA tariff rates and the importer receives the official assessment invoice.") },
  ], [t]);

  const features = useMemo(() => [
    { icon: CpuIcon as AnimatedIcon, title: t("landing.features.f1Title", "AI document checks"), text: t("landing.features.f1", "Invoices, licences and IDs are read automatically and flagged for tampering, expiry, wrong names or numbers.") },
    { icon: LayersIcon as AnimatedIcon, title: t("landing.features.f2Title", "ERCA tariff and taxes"), text: t("landing.features.f2", "Every national tariff line with its duty, excise, VAT, withholding and surtax rates, applied to the assessment.") },
    { icon: EarthIcon as AnimatedIcon, title: t("landing.features.f3Title", "International price evidence"), text: t("landing.features.f3", "Market and manufacturer prices, converted to birr, give officers a defensible reference value.") },
    { icon: ActivityIcon as AnimatedIcon, title: t("landing.features.f4Title", "Complete audit trail"), text: t("landing.features.f4", "Every decision, revision and document scan is recorded with who did it, where and why.") },
    { icon: LockIcon as AnimatedIcon, title: t("landing.features.f5Title", "Regional access control"), text: t("landing.features.f5", "Officers and administrators see only the offices and cases their role and region allow.") },
    { icon: BellIcon as AnimatedIcon, title: t("landing.features.f6Title", "Live notifications"), text: t("landing.features.f6", "Importers hear the moment an officer verifies, requests information or issues an assessment.") },
  ], [t]);

  const branchCount = regions?.reduce((sum, region) => sum + region.branches.length, 0) ?? 0;
  const selected = regions?.find(region => region.code === selectedRegion) ?? null;
  const close = () => setMenuOpen(false);
  // The logo takes you back to the top of the landing page (we are already on it, so the link alone would do nothing).
  const goHome = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    setMenuOpen(false);
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
    window.history.replaceState(null, "", "/");
    document.getElementById("home")?.focus({ preventScroll: true });
  };

  return <main className="lp" ref={page}>
    <a className="lp-skip-link" href="#home">{t("landing.nav.skip", "Skip to content")}</a>
    <header className="lp-nav">
      <div className="lp-wrap lp-nav-inner">
        <Link href="/#home" className="lp-brand" aria-label="Ethiopian Customs Commission home" onClick={goHome}><span className="lp-brand-on-light"><Brand variant="dark" /></span><span className="lp-brand-on-dark"><Brand variant="light" /></span></Link>
        <nav id="lp-navigation" className={menuOpen ? "is-open" : ""} aria-label="Main navigation">
          <a href="#how" onClick={close}>{t("landing.nav.how", "How it works")}</a>
          <a href="#portals" onClick={close}>{t("landing.nav.portals", "Portals")}</a>
          <a href="#offices" onClick={close}>{t("landing.nav.offices", "Offices")}</a>
          <Link href="/about" onClick={close}>{t("landing.nav.about", "About")}</Link>
          <Link href="/contact" onClick={close}>{t("landing.nav.contact", "Contact")}</Link>
          <Link href="/login" className="lp-nav-mobile-only" onClick={close}>{t("landing.nav.signIn", "Sign in")}</Link>
          <Link href="/importer/register" className="lp-nav-mobile-only" onClick={close}>{t("landing.nav.register", "Register")}</Link>
        </nav>
        <div className="lp-nav-actions">
          <LandingLanguageSelect />
          <Link href="/login" className="lp-btn is-ghost lp-nav-signin"><FiLogIn aria-hidden="true" />{t("landing.nav.signIn", "Sign in")}</Link>
          <Link href="/importer/register" className="lp-btn is-primary lp-nav-register">{t("landing.nav.register", "Register")}</Link>
          <button ref={menuButton} className="lp-menu" type="button" aria-label={menuOpen ? t("landing.nav.close", "Close navigation") : t("landing.nav.open", "Open navigation")} aria-expanded={menuOpen} aria-controls="lp-navigation" onClick={() => setMenuOpen(open => !open)}>{menuOpen ? <FiX /> : <FiMenu />}</button>
        </div>
      </div>
    </header>

    <section className="lp-hero" id="home" aria-labelledby="lp-hero-title" tabIndex={-1}>
      <div className="lp-hero-scene" aria-hidden="true">
        <Image src="/images/landing/inland-port-fade.png" alt="" fill priority sizes="100vw" quality={90} />
        <video className="lp-hero-video" autoPlay muted loop playsInline preload="auto" tabIndex={-1}>
          <source src="/images/landing/hero.mp4" type="video/mp4" />
        </video>
      </div>
      <div className="lp-wrap lp-hero-inner">
        <div className="lp-hero-copy">
          <p className="lp-kicker">{t("landing.hero.kicker", "Importer & Customs Portal")}<span aria-hidden="true" /></p>
          <h1 id="lp-hero-title">
            <span className="lp-line"><span className="lp-line-inner">{t("landing.hero.titleA", "Declare with confidence.")}</span></span>
            <em className="lp-line"><span className="lp-line-inner">{t("landing.hero.titleB", "Track every step.")}</span></em>
          </h1>
          <p className="lp-lead">{t("landing.hero.lead", "Register as an importer, submit your goods and documents, and follow your declaration through review to an official duty and tax assessment.")}</p>
          <div className="lp-hero-actions">
            <Link href="/importer/register" className="lp-btn is-primary is-large">{t("landing.hero.register", "Register as an Importer")}<FiArrowRight aria-hidden="true" /></Link>
            <Link href="/login" className="lp-btn is-outline is-large"><FiUser aria-hidden="true" />{t("landing.hero.signIn", "Sign In")}</Link>
          </div>
          <ul className="lp-hero-proof">
            <li><FiFileText aria-hidden="true" />{t("landing.hero.p1", "Verified registration")}</li>
            <li><FiLayers aria-hidden="true" />{t("landing.hero.p2", "Track your declaration")}</li>
            <li><FiBarChart2 aria-hidden="true" />{t("landing.hero.p3", "Official assessment")}</li>
          </ul>
          <p className="lp-hero-motto"><span aria-hidden="true" />{t("landing.hero.motto", "Secure borders. Prosperous nation.")}</p>
        </div>
      </div>
      <div className="lp-hero-caption"><FiGlobe aria-hidden="true" /><span>{t("landing.hero.caption", "From declaration to assessment.")}</span></div>
    </section>

    <section className="lp-section" id="how">
      <div className="lp-wrap">
        <header className="lp-section-head"><p className="lp-eyebrow">{t("landing.journey.eyebrow", "How it works")}</p><h2>{t("landing.journey.title", "From declaration to official invoice")}</h2><p>{t("landing.journey.subtitle", "Five steps, the same for every importer, with each decision recorded.")}</p></header>
        <div className="lp-steps-track">
          <span className="lp-steps-progress" aria-hidden="true" />
          <ol className="lp-steps">{journey.map((step, index) => <Step key={step.title} {...step} index={index} />)}</ol>
        </div>
      </div>
    </section>

    <section className="lp-section is-blue" id="portals">
      <div className="lp-wrap">
        <header className="lp-section-head"><p className="lp-eyebrow">{t("landing.portals.eyebrow", "Two portals, one process")}</p><h2>{t("landing.portals.title", "Built for importers and for Customs")}</h2></header>
        <div className="lp-portals">
          <article className="lp-portal is-importer" {...importerCard.handlers}>
            <PortalIcon icon={UsersIcon as AnimatedIcon} play={importerCard.play} />
            <h3>{t("landing.portals.importerTitle", "Importer portal")}</h3>
            <p>{t("landing.portals.importerText", "For businesses, individuals and licensed customs agents bringing goods into Ethiopia.")}</p>
            <ul>{[t("landing.portals.i1", "Register once, verified by your regional office"), t("landing.portals.i2", "Declare goods and upload documents online"), t("landing.portals.i3", "Track every declaration and answer officer requests"), t("landing.portals.i4", "Open, print or download the official invoice")].map(item => <li key={item}><FiCheck aria-hidden="true" />{item}</li>)}</ul>
            <div className="lp-portal-actions"><Link href="/importer/register" className="lp-btn is-primary"><FiUserPlus aria-hidden="true" />{t("landing.portals.importerCta", "Create importer account")}</Link><Link href="/login" className="lp-link">{t("landing.portals.importerSignIn", "I already have an account")}<FiArrowRight aria-hidden="true" /></Link></div>
          </article>
          <article className="lp-portal is-staff" {...staffCard.handlers}>
            <PortalIcon icon={UserCheckIcon as AnimatedIcon} play={staffCard.play} />
            <h3>{t("landing.portals.staffTitle", "Customs workspace")}</h3>
            <p>{t("landing.portals.staffText", "For Customs Officers, regional Customs Administrators and System Administrators.")}</p>
            <ul>{[t("landing.portals.s1", "Verify importers with scanned-document flags"), t("landing.portals.s2", "Review declarations, classify and value goods"), t("landing.portals.s3", "Assess duties and taxes and issue the invoice"), t("landing.portals.s4", "Manage offices, staff and the full audit trail")].map(item => <li key={item}><FiCheck aria-hidden="true" />{item}</li>)}</ul>
            <div className="lp-portal-actions"><Link href="/login" className="lp-btn is-light"><FiLogIn aria-hidden="true" />{t("landing.portals.staffCta", "Staff sign in")}</Link><Link href="/signup" className="lp-link">{t("landing.portals.staffApply", "Apply for officer access")}<FiArrowRight aria-hidden="true" /></Link></div>
          </article>
        </div>
      </div>
    </section>

    <section className="lp-section lp-features-section" id="features">
      <div className="lp-wrap">
        <header className="lp-section-head"><p className="lp-eyebrow">{t("landing.features.eyebrow", "What the system does")}</p><h2>{t("landing.features.title", "Evidence and controls behind every assessment")}</h2></header>
        <div className="lp-features">{features.map((feature, index) => <Feature key={feature.title} {...feature} index={index} />)}</div>
      </div>
    </section>

    <section className="lp-section is-tinted" id="offices">
      <div className="lp-wrap lp-offices">
        <div className="lp-office-panel">
          <p className="lp-eyebrow">{t("landing.offices.eyebrow", "Customs offices")}</p>
          <h2>{t("landing.offices.title", "A network across every region")}</h2>
          <p>{t("landing.offices.text", "Your declarations and verification are handled by the office in your region. Choose a region to see it on the map.")}</p>
          <dl className="lp-office-stats">
            <div><dt>{t("landing.offices.regions", "Regions & city administrations")}</dt><dd className="lp-count" data-value={regions?.length ?? 0}>{regions ? regions.length : "–"}</dd></div>
            <div><dt>{t("landing.offices.branches", "Active branches")}</dt><dd className="lp-count" data-value={branchCount}>{regions ? branchCount : "–"}</dd></div>
          </dl>
          <ul className="lp-region-list">
            <li><button type="button" className={selectedRegion === null ? "is-active" : ""} aria-pressed={selectedRegion === null} onClick={() => setSelectedRegion(null)}>
              <FiMapPin aria-hidden="true" /><span>{t("landing.offices.hq", "Head office")}</span><small>HQ</small></button></li>
            {(regions ?? []).map(region => <li key={region.code}><button type="button" className={region.code === selectedRegion ? "is-active" : ""} aria-pressed={region.code === selectedRegion} onClick={() => setSelectedRegion(current => current === region.code ? null : region.code)}>
              <FiMapPin aria-hidden="true" /><span>{region.name}</span><small>{region.branches.length}</small></button></li>)}
          </ul>
          {selected && <div className="lp-region-detail"><strong>{selected.name}</strong><span>{selected.branches.length ? selected.branches.join(" · ") : t("landing.offices.regional", "Regional office")}</span></div>}
          <div className="lp-office-hq"><span className="lp-office-hq-icon"><LiveIcon icon={MapPinIcon as AnimatedIcon} size={18} /></span><span><b>{t("landing.offices.hq", "Head office")}</b> · Ethiopian Customs Commission, Addis Ababa</span></div>
        </div>
        <div className="lp-map">
          <iframe key={selected?.code ?? "hq"} title={selected ? `${selected.name} on Google Maps` : "Ethiopian Customs Commission head office on Google Maps"} src={mapUrl(selected)} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
          <a className="lp-map-open" href={mapLink(selected)} target="_blank" rel="noopener noreferrer"><FiExternalLink aria-hidden="true" />{t("landing.offices.openMap", "Open in Google Maps")}</a>
        </div>
      </div>
    </section>

    <section className="lp-cta">
      <Image className="lp-cta-art" src="/images/landing/ethiopia-trade-routes.png" alt="" fill sizes="100vw" aria-hidden="true" />
      <div className="lp-wrap lp-cta-inner">
        <div><h2>{t("landing.cta.title", "Ready to declare your goods?")}</h2><p>{t("landing.cta.text", "Registration takes about ten minutes with your licence, TIN certificate and ID ready.")}</p></div>
        <div className="lp-cta-actions"><Link href="/importer/register" className="lp-btn is-light is-large"><FiUserPlus aria-hidden="true" />{t("landing.cta.register", "Register as an importer")}</Link><Link href="/login" className="lp-btn is-outline-light is-large"><FiLogIn aria-hidden="true" />{t("landing.cta.signIn", "Sign in")}</Link></div>
      </div>
    </section>

    <footer className="lp-footer">
      <div className="lp-wrap lp-footer-main">
        <div><a href="/#home" className="lp-footer-brand" aria-label="Back to the top" onClick={goHome}><Brand variant="light" /></a><p>{t("landing.footer.portal", "Customs Valuation & Declaration Portal")}</p></div>
        <div><h4>{t("landing.footer.importers", "Importers")}</h4><Link href="/importer/register">{t("landing.footer.register", "Register")}</Link><Link href="/login">{t("landing.footer.signIn", "Sign in")}</Link><a href="#how">{t("landing.footer.how", "How it works")}</a></div>
        <div><h4>{t("landing.footer.staff", "Customs staff")}</h4><Link href="/login">{t("landing.footer.staffSignIn", "Staff sign in")}</Link><Link href="/signup">{t("landing.footer.apply", "Apply for access")}</Link><a href="#offices">{t("landing.footer.offices", "Offices")}</a></div>
        <div><h4>{t("landing.footer.commission", "Commission")}</h4><Link href="/about">{t("landing.footer.about", "About")}</Link><Link href="/contact">{t("landing.footer.contact", "Contact")}</Link></div>
      </div>
      <div className="lp-wrap lp-footer-bottom"><span>{t("landing.footer.copyright", "© 2026 Ethiopia Customs Commission")}</span><span>{t("landing.footer.tagline", "Secure borders. Prosperous nation.")}</span><div className="lp-footer-theme"><span>{t("landing.footer.appearance", "Appearance")}</span><ThemeToggle /></div></div>
    </footer>
  </main>;
}
