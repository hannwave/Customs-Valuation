"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  FiActivity, FiArrowRight, FiBell, FiCheck, FiCheckCircle, FiClipboard, FiCpu, FiDollarSign, FiFileText, FiGlobe,
  FiLayers, FiLock, FiLogIn, FiMapPin, FiMenu, FiSearch, FiShield, FiUserCheck, FiUserPlus, FiUsers, FiX,
} from "react-icons/fi";
import { Brand } from "@/components/Brand";
import { LandingLanguageSelect } from "@/components/LandingLanguageSelect";
import { ThemeToggle } from "@/components/ThemeToggle";
import { HEAD_OFFICE, type NetworkRegion } from "@/components/landing/network";
import { importerApiBase } from "@/lib/importer";

const CustomsNetworkMap = dynamic(() => import("@/components/landing/CustomsNetworkMap"), { ssr: false, loading: () => <div className="lp-map-loading">Loading map…</div> });

// Representative regional centres (as on the organisation map) until branches carry their own coordinates.
const REGION_CENTERS: Record<string, readonly [number, number]> = {
  ADDIS_ABABA: [9.03, 38.74], AFAR: [11.75, 40.75], AMHARA: [11.5, 38.5], BENISHANGUL_GUMUZ: [10.75, 35.8], CENTRAL_ETHIOPIA: [8.2, 38.3],
  DIRE_DAWA: [9.6, 41.85], GAMBELA: [8.25, 34.6], HARARI: [9.31, 42.13], OROMIA: [7.55, 39.0], SIDAMA: [6.7, 38.4], SOMALI: [6.5, 44.5],
  SOUTH_ETHIOPIA: [6.0, 37.5], SOUTH_WEST_ETHIOPIA_PEOPLES: [7.0, 35.6], TIGRAY: [14.1, 38.5],
};

type Region = { id: string; name: string; officialCode: string };
type Branch = { id: string; name: string; parentLocationId: string | null };

/** Loads the public region and branch lists for the office map. */
function useCustomsNetwork() {
  const [regions, setRegions] = useState<NetworkRegion[] | null>(null);
  const [boundaries, setBoundaries] = useState<unknown>(null);
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
    fetch("/maps/ethiopia-adm1.geojson").then(response => (response.ok ? response.json() : null)).then(data => { if (active) setBoundaries(data); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  return { regions, boundaries };
}

export default function LandingPage() {
  const { t } = useTranslation();
  const page = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const { regions, boundaries } = useCustomsNetwork();

  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);
    const context = gsap.context(() => {
      gsap.from(".lp-hero-copy > *", { y: 18, autoAlpha: 0, duration: 0.6, stagger: 0.08, ease: "power2.out" });
      gsap.from(".lp-hero-visual", { y: 24, autoAlpha: 0, duration: 0.8, delay: 0.2, ease: "power2.out" });
      [".lp-step", ".lp-portal", ".lp-feature", ".lp-office-panel", ".lp-cta-inner > *"].forEach(selector => {
        gsap.from(selector, { y: 16, autoAlpha: 0, duration: 0.5, stagger: 0.07, ease: "power2.out", scrollTrigger: { trigger: selector, start: "top 88%", once: true } });
      });
    }, page);
    return () => context.revert();
  }, []);

  const journey = useMemo(() => [
    { icon: FiUserPlus, title: t("landing.journey.s1Title", "Register and get verified"), text: t("landing.journey.s1", "Importers, businesses and customs agents open an account with their licence, TIN and ID. Officers in their region verify it.") },
    { icon: FiFileText, title: t("landing.journey.s2Title", "Declare the goods"), text: t("landing.journey.s2", "Describe the item, the price paid, freight and insurance, and upload the invoice, packing list and certificate of origin.") },
    { icon: FiCpu, title: t("landing.journey.s3Title", "Documents are checked"), text: t("landing.journey.s3", "An AI document scanner reads every upload and flags files that do not match the declaration for the officer.") },
    { icon: FiSearch, title: t("landing.journey.s4Title", "Classified and valued"), text: t("landing.journey.s4", "The officer confirms the HS tariff line and the customs value, backed by international price evidence.") },
    { icon: FiDollarSign, title: t("landing.journey.s5Title", "Official assessment"), text: t("landing.journey.s5", "Duties and taxes are computed from ERCA tariff rates and the importer receives the official assessment invoice.") },
  ], [t]);

  const features = useMemo(() => [
    { icon: FiCpu, title: t("landing.features.f1Title", "AI document checks"), text: t("landing.features.f1", "Invoices, licences and IDs are read automatically and flagged for tampering, expiry, wrong names or numbers.") },
    { icon: FiLayers, title: t("landing.features.f2Title", "ERCA tariff and taxes"), text: t("landing.features.f2", "Every national tariff line with its duty, excise, VAT, withholding and surtax rates, applied to the assessment.") },
    { icon: FiGlobe, title: t("landing.features.f3Title", "International price evidence"), text: t("landing.features.f3", "Market and manufacturer prices, converted to birr, give officers a defensible reference value.") },
    { icon: FiActivity, title: t("landing.features.f4Title", "Complete audit trail"), text: t("landing.features.f4", "Every decision, revision and document scan is recorded with who did it, where and why.") },
    { icon: FiLock, title: t("landing.features.f5Title", "Regional access control"), text: t("landing.features.f5", "Officers and administrators see only the offices and cases their role and region allow.") },
    { icon: FiBell, title: t("landing.features.f6Title", "Live notifications"), text: t("landing.features.f6", "Importers hear the moment an officer verifies, requests information or issues an assessment.") },
  ], [t]);

  const branchCount = regions?.reduce((sum, region) => sum + region.branches.length, 0) ?? 0;
  const selected = regions?.find(region => region.code === selectedRegion) ?? null;
  const close = () => setMenuOpen(false);

  return <main className="lp" ref={page}>
    <header className="lp-nav">
      <div className="lp-wrap lp-nav-inner">
        <Link href="/" className="lp-brand" aria-label="Ethiopian Customs Commission home"><span className="lp-brand-on-light"><Brand variant="dark" /></span><span className="lp-brand-on-dark"><Brand variant="light" /></span></Link>
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
          <ThemeToggle />
          <LandingLanguageSelect />
          <Link href="/login" className="lp-btn is-ghost lp-nav-signin"><FiLogIn aria-hidden="true" />{t("landing.nav.signIn", "Sign in")}</Link>
          <Link href="/importer/register" className="lp-btn is-primary lp-nav-register">{t("landing.nav.register", "Register")}</Link>
          <button className="lp-menu" type="button" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="lp-navigation" onClick={() => setMenuOpen(open => !open)}>{menuOpen ? <FiX /> : <FiMenu />}</button>
        </div>
      </div>
    </header>

    <section className="lp-hero" id="home">
      <div className="lp-wrap lp-hero-grid">
        <div className="lp-hero-copy">
          <p className="lp-kicker"><span aria-hidden="true" />{t("landing.hero.kicker", "Ethiopian Customs Commission")}</p>
          <h1>{t("landing.hero.titleA", "Declare your imports.")} <em>{t("landing.hero.titleB", "Get a fair, traceable assessment.")}</em></h1>
          <p className="lp-lead">{t("landing.hero.lead", "One portal for importers and Customs: register and get verified, declare goods with their documents, and receive the official duty and tax assessment — every step checked, valued on evidence and recorded.")}</p>
          <div className="lp-hero-actions">
            <Link href="/importer/register" className="lp-btn is-primary is-large"><FiUserPlus aria-hidden="true" />{t("landing.hero.register", "Register as an importer")}<FiArrowRight aria-hidden="true" /></Link>
            <Link href="/login" className="lp-btn is-outline is-large"><FiLogIn aria-hidden="true" />{t("landing.hero.signIn", "Sign in")}</Link>
          </div>
          <ul className="lp-hero-proof">
            <li><FiCheckCircle aria-hidden="true" />{t("landing.hero.p1", "Importers, businesses and customs agents")}</li>
            <li><FiCheckCircle aria-hidden="true" />{t("landing.hero.p2", "ERCA tariff rates built in")}</li>
            <li><FiCheckCircle aria-hidden="true" />{t("landing.hero.p3", "Official assessment invoice")}</li>
          </ul>
        </div>

        <div className="lp-hero-visual" aria-hidden="true">
          <div className="lp-mock">
            <div className="lp-mock-head"><div><small>Declaration</small><strong>IMP-20261016-4F2A</strong></div><span className="lp-chip is-success"><FiCheck />Assessed</span></div>
            <div className="lp-mock-item"><span className="lp-mock-icon"><FiClipboard /></span><div><strong>Smartphones, 5G · 120 pcs</strong><small>HS 8517.13 · Origin China · CIF</small></div></div>
            <ol className="lp-mock-steps">
              {["Submitted", "Documents checked", "Classified", "Valued", "Assessed"].map((step, index) => <li key={step} className={index < 5 ? "is-done" : ""}><span>{index + 1}</span>{step}</li>)}
            </ol>
            <div className="lp-mock-scan"><FiCpu /><span>Document scanner: <b>commercial invoice looks right</b></span></div>
            <div className="lp-mock-total"><div><small>Customs value (CIF)</small><strong>ETB 2,486,400</strong></div><div><small>Duties &amp; taxes payable</small><strong className="is-accent">ETB 1,042,118</strong></div></div>
          </div>
          <div className="lp-float is-a"><FiBell /><span><b>Assessment issued</b><small>Your invoice is ready</small></span></div>
          <div className="lp-float is-b"><FiShield /><span><b>Verified importer</b><small>Addis Ababa region</small></span></div>
        </div>
      </div>
    </section>

    <section className="lp-section" id="how">
      <div className="lp-wrap">
        <header className="lp-section-head"><p className="lp-eyebrow">{t("landing.journey.eyebrow", "How it works")}</p><h2>{t("landing.journey.title", "From declaration to official invoice")}</h2><p>{t("landing.journey.subtitle", "Five steps, the same for every importer, with each decision recorded.")}</p></header>
        <ol className="lp-steps">{journey.map(({ icon: Icon, title, text }, index) => <li className="lp-step" key={title}>
          <span className="lp-step-num">{String(index + 1).padStart(2, "0")}</span><span className="lp-step-icon"><Icon aria-hidden="true" /></span><h3>{title}</h3><p>{text}</p></li>)}</ol>
      </div>
    </section>

    <section className="lp-section is-tinted" id="portals">
      <div className="lp-wrap">
        <header className="lp-section-head"><p className="lp-eyebrow">{t("landing.portals.eyebrow", "Two portals, one process")}</p><h2>{t("landing.portals.title", "Built for importers and for Customs")}</h2></header>
        <div className="lp-portals">
          <article className="lp-portal is-importer">
            <span className="lp-portal-icon"><FiUsers aria-hidden="true" /></span>
            <h3>{t("landing.portals.importerTitle", "Importer portal")}</h3>
            <p>{t("landing.portals.importerText", "For businesses, individuals and licensed customs agents bringing goods into Ethiopia.")}</p>
            <ul>{[t("landing.portals.i1", "Register once, verified by your regional office"), t("landing.portals.i2", "Declare goods and upload documents online"), t("landing.portals.i3", "Track every declaration and answer officer requests"), t("landing.portals.i4", "Open, print or download the official invoice")].map(item => <li key={item}><FiCheck aria-hidden="true" />{item}</li>)}</ul>
            <div className="lp-portal-actions"><Link href="/importer/register" className="lp-btn is-primary"><FiUserPlus aria-hidden="true" />{t("landing.portals.importerCta", "Create importer account")}</Link><Link href="/login" className="lp-link">{t("landing.portals.importerSignIn", "I already have an account")}<FiArrowRight aria-hidden="true" /></Link></div>
          </article>
          <article className="lp-portal is-staff">
            <span className="lp-portal-icon"><FiUserCheck aria-hidden="true" /></span>
            <h3>{t("landing.portals.staffTitle", "Customs workspace")}</h3>
            <p>{t("landing.portals.staffText", "For Customs Officers, regional Customs Administrators and System Administrators.")}</p>
            <ul>{[t("landing.portals.s1", "Verify importers with scanned-document flags"), t("landing.portals.s2", "Review declarations, classify and value goods"), t("landing.portals.s3", "Assess duties and taxes and issue the invoice"), t("landing.portals.s4", "Manage offices, staff and the full audit trail")].map(item => <li key={item}><FiCheck aria-hidden="true" />{item}</li>)}</ul>
            <div className="lp-portal-actions"><Link href="/login" className="lp-btn is-light"><FiLogIn aria-hidden="true" />{t("landing.portals.staffCta", "Staff sign in")}</Link><Link href="/signup" className="lp-link">{t("landing.portals.staffApply", "Apply for officer access")}<FiArrowRight aria-hidden="true" /></Link></div>
          </article>
        </div>
      </div>
    </section>

    <section className="lp-section" id="features">
      <div className="lp-wrap">
        <header className="lp-section-head"><p className="lp-eyebrow">{t("landing.features.eyebrow", "What the system does")}</p><h2>{t("landing.features.title", "Evidence and controls behind every assessment")}</h2></header>
        <div className="lp-features">{features.map(({ icon: Icon, title, text }) => <article className="lp-feature" key={title}><span className="lp-feature-icon"><Icon aria-hidden="true" /></span><h3>{title}</h3><p>{text}</p></article>)}</div>
      </div>
    </section>

    <section className="lp-section is-tinted" id="offices">
      <div className="lp-wrap lp-offices">
        <div className="lp-office-panel">
          <p className="lp-eyebrow">{t("landing.offices.eyebrow", "Customs offices")}</p>
          <h2>{t("landing.offices.title", "A network across every region")}</h2>
          <p>{t("landing.offices.text", "Your declarations and verification are handled by the office in your region. Choose a region to see its branches.")}</p>
          <dl className="lp-office-stats"><div><dt>{t("landing.offices.regions", "Regions & city administrations")}</dt><dd>{regions ? regions.length : "–"}</dd></div><div><dt>{t("landing.offices.branches", "Active branches")}</dt><dd>{regions ? branchCount : "–"}</dd></div></dl>
          <ul className="lp-region-list">
            {(regions ?? []).map(region => <li key={region.code}><button type="button" className={region.code === selectedRegion ? "is-active" : ""} aria-pressed={region.code === selectedRegion} onClick={() => setSelectedRegion(current => current === region.code ? null : region.code)}>
              <FiMapPin aria-hidden="true" /><span>{region.name}</span><small>{region.branches.length}</small></button></li>)}
          </ul>
          {selected && <div className="lp-region-detail"><strong>{selected.name}</strong><span>{selected.branches.length ? selected.branches.join(" · ") : t("landing.offices.regional", "Regional office")}</span></div>}
          <p className="lp-office-hq"><FiMapPin aria-hidden="true" /><span><b>{t("landing.offices.hq", "Head office")}</b> · Ethiopian Customs Commission, Addis Ababa ({HEAD_OFFICE[0].toFixed(3)}, {HEAD_OFFICE[1].toFixed(3)})</span></p>
        </div>
        <div className="lp-map">{regions && <CustomsNetworkMap regions={regions} boundaries={boundaries} selected={selectedRegion} onSelect={setSelectedRegion} />}{!regions && <div className="lp-map-loading">Loading map…</div>}</div>
      </div>
    </section>

    <section className="lp-cta">
      <div className="lp-wrap lp-cta-inner">
        <div><h2>{t("landing.cta.title", "Ready to declare your goods?")}</h2><p>{t("landing.cta.text", "Registration takes about ten minutes with your licence, TIN certificate and ID ready.")}</p></div>
        <div className="lp-cta-actions"><Link href="/importer/register" className="lp-btn is-light is-large"><FiUserPlus aria-hidden="true" />{t("landing.cta.register", "Register as an importer")}</Link><Link href="/login" className="lp-btn is-outline-light is-large"><FiLogIn aria-hidden="true" />{t("landing.cta.signIn", "Sign in")}</Link></div>
      </div>
    </section>

    <footer className="lp-footer">
      <div className="lp-wrap lp-footer-main">
        <div><Brand variant="light" /><p>{t("landing.footer.portal", "Customs Valuation & Declaration Portal")}</p></div>
        <div><h4>{t("landing.footer.importers", "Importers")}</h4><Link href="/importer/register">{t("landing.footer.register", "Register")}</Link><Link href="/login">{t("landing.footer.signIn", "Sign in")}</Link><a href="#how">{t("landing.footer.how", "How it works")}</a></div>
        <div><h4>{t("landing.footer.staff", "Customs staff")}</h4><Link href="/login">{t("landing.footer.staffSignIn", "Staff sign in")}</Link><Link href="/signup">{t("landing.footer.apply", "Apply for access")}</Link><a href="#offices">{t("landing.footer.offices", "Offices")}</a></div>
        <div><h4>{t("landing.footer.commission", "Commission")}</h4><Link href="/about">{t("landing.footer.about", "About")}</Link><Link href="/contact">{t("landing.footer.contact", "Contact")}</Link></div>
      </div>
      <div className="lp-wrap lp-footer-bottom"><span>{t("landing.footer.copyright", "© 2026 Ethiopia Customs Commission")}</span><span>{t("landing.footer.tagline", "Secure borders. Prosperous nation.")}</span></div>
    </footer>
  </main>;
}
