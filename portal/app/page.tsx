"use client";

import Link from "next/link";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  FiArrowRight,
  FiBarChart2,
  FiCheck,
  FiFileText,
  FiLayers,
  FiMenu,
  FiShield,
  FiUser,
  FiX,
} from "react-icons/fi";
import { Brand } from "@/components/Brand";
import { LandingLanguageSelect } from "@/components/LandingLanguageSelect";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function LandingPage() {
  const { t } = useTranslation();
  const page = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);
    const context = gsap.context(() => {
      gsap.from(".landing-hero-copy > *", {
        y: 18,
        autoAlpha: 0,
        duration: 0.65,
        stagger: 0.1,
        ease: "power2.out",
      });
      [
        ".service-card",
        ".step-card",
        ".evidence-inner > *",
        ".access-inner > *",
        ".footer-main > div",
      ].forEach((selector) => {
        gsap.from(selector, {
          y: 16,
          autoAlpha: 0,
          duration: 0.5,
          stagger: 0.08,
          ease: "power2.out",
          scrollTrigger: { trigger: selector, start: "top 88%", once: true },
        });
      });
    }, page);
    return () => context.revert();
  }, []);

  const services = useMemo(
    () => [
      {
        icon: FiFileText,
        title: t("landing.services.s1Title", "HS Code & Tariff Management"),
        items: [
          t("landing.services.s1i1", "HS revisions"),
          t("landing.services.s1i2", "National tariff codes"),
          t("landing.services.s1i3", "Classification history"),
          t("landing.services.s1i4", "Tariff rules"),
        ],
      },
      {
        icon: FiLayers,
        title: t("landing.services.s2Title", "Price Intelligence"),
        items: [
          t("landing.services.s2i1", "International reference prices"),
          t("landing.services.s2i2", "Manufacturer prices"),
          t("landing.services.s2i3", "Historical prices"),
          t("landing.services.s2i4", "Price sources"),
        ],
      },
      {
        icon: FiBarChart2,
        title: t("landing.services.s3Title", "Analytics"),
        items: [
          t("landing.services.s3i1", "Price statistics"),
          t("landing.services.s3i2", "Historical trends"),
          t("landing.services.s3i3", "Country comparisons"),
          t("landing.services.s3i4", "Outlier detection"),
        ],
      },
      {
        icon: FiShield,
        title: t("landing.services.s4Title", "Decision Support"),
        items: [
          t("landing.services.s4i1", "Evidence review"),
          t("landing.services.s4i2", "Reference-value selection"),
          t("landing.services.s4i3", "Officer justification"),
          t("landing.services.s4i4", "Decision history"),
        ],
      },
    ],
    [t]
  );

  const steps = useMemo(
    () => [
      [
        "01",
        t("landing.steps.step1Title", "Search"),
        t(
          "landing.steps.step1Desc",
          "Search by HS code, tariff item, description, or related product information."
        ),
      ],
      [
        "02",
        t("landing.steps.step2Title", "Review"),
        t(
          "landing.steps.step2Desc",
          "Review classification and reference-price information."
        ),
      ],
      [
        "03",
        t("landing.steps.step3Title", "Compare"),
        t(
          "landing.steps.step3Desc",
          "Examine available evidence and compare price information."
        ),
      ],
      [
        "04",
        t("landing.steps.step4Title", "Decide"),
        t(
          "landing.steps.step4Desc",
          "Use the evidence to support an informed valuation decision."
        ),
      ],
    ],
    [t]
  );

  const evidencePoints = useMemo(
    () => [
      t("landing.evidence.p1", "Centralized information"),
      t("landing.evidence.p2", "Consistent reference data"),
      t("landing.evidence.p3", "Evidence-based decisions"),
      t("landing.evidence.p4", "Role-based access"),
      t("landing.evidence.p5", "Traceable valuation activities"),
    ],
    [t]
  );

  return (
    <main className="landing-page" ref={page}>
      <header className="landing-nav">
        <Link
          href="/"
          className="landing-brand"
          aria-label="Ethiopia Customs Commission home"
        >
          <Brand variant="dark" />
        </Link>
        <button
          className="landing-menu-toggle"
          type="button"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
          aria-controls="landing-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <FiX /> : <FiMenu />}
        </button>
        <nav
          id="landing-navigation"
          className={menuOpen ? "is-open" : ""}
          aria-label="Main navigation"
        >
          <a
            className="is-active"
            href="#home"
            onClick={() => setMenuOpen(false)}
          >
            {t("landing.nav.home", "Home")}
          </a>
          <Link href="/about" onClick={() => setMenuOpen(false)}>
            {t("landing.nav.about", "About")}
          </Link>
          <Link href="/contact" onClick={() => setMenuOpen(false)}>
            {t("landing.nav.contact", "Contact")}
          </Link>
        </nav>
        <div className="landing-nav-actions">
          <ThemeToggle />
          <LandingLanguageSelect />
          <Link href="/login" className="nav-sign-in">
            <FiUser /> {t("landing.nav.signIn", "Sign in")}
          </Link>
        </div>
      </header>

      <section className="landing-hero" id="home">
        <div className="landing-wrap landing-hero-copy">
          <p className="landing-kicker">
            {t("landing.hero.kicker", "Customs Valuation Portal")} <span />
          </p>
          <h1>
            {t("landing.hero.title1", "Better evidence.")}
            <br />
            <em>{t("landing.hero.title2", "Smarter valuation.")}</em>
          </h1>
          <p className="landing-tagline">
            {t("landing.hero.tagline", "Secure borders. Prosperous nation.")}
          </p>
          <div className="landing-hero-actions">
            <Link href="/importer" className="landing-primary">
              <FiFileText />{" "}
              {t("landing.hero.registerGoods", "Register Imported Goods")}{" "}
              <FiArrowRight />
            </Link>
            <Link href="/login" className="landing-secondary">
              <FiUser />{" "}
              {t("landing.hero.staffSignIn", "Customs staff sign in")}
            </Link>
          </div>
        </div>
      </section>

      <section className="landing-section" id="platform">
        <SectionTitle
          title={t("landing.services.title", "What the platform provides")}
          subtitle={t(
            "landing.services.subtitle",
            "Everything you need for accurate and transparent customs valuation."
          )}
        />
        <div className="landing-wrap landing-card-grid">
          {services.map(({ icon: Icon, title, items }) => (
            <article className="service-card" key={title}>
              <div className="service-icon">
                <Icon />
              </div>
              <h3>{title}</h3>
              <ul>
                {items.map((item) => (
                  <li key={item}>
                    <FiCheck />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-how" id="about">
        <SectionTitle
          title={t("landing.steps.title", "How the system works")}
          subtitle={t("landing.steps.subtitle", "From search to decision.")}
        />
        <div className="landing-wrap landing-step-grid">
          {steps.map(([number, title, description]) => (
            <article className="step-card" key={number}>
              <span className="step-number">{number}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        className="landing-evidence"
        aria-label="Accountable customs operations"
      >
        <div className="landing-wrap evidence-inner">
          <div>
            <p className="evidence-kicker">
              {t(
                "landing.evidence.kicker",
                "Built for accountable customs operations"
              )}
            </p>
            <h2>
              {t(
                "landing.evidence.title",
                "Reliable evidence for customs professionals."
              )}
            </h2>
          </div>
          <div className="evidence-points">
            {evidencePoints.map((point) => (
              <span key={point}>
                <FiCheck />
                {point}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-access" id="contact">
        <div className="landing-wrap access-inner">
          <div className="access-avatar">
            <FiUser />
          </div>
          <div>
            <h3>
              {t(
                "landing.access.title",
                "Ready to register imported goods?"
              )}
            </h3>
            <p>
              {t(
                "landing.access.desc",
                "Submit item details and documents for Customs Officer review."
              )}
            </p>
          </div>
          <Link href="/importer" className="landing-primary">
            <FiFileText /> {t("landing.access.button", "Importer Portal")}{" "}
            <FiArrowRight />
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-wrap footer-main">
          <div>
            <Brand variant="light" />
            <p className="footer-portal">
              {t("landing.footer.portal", "Customs Valuation Portal")}
            </p>
          </div>
          <div>
            <h4>{t("landing.footer.nav", "Navigation")}</h4>
            <a href="#home">{t("landing.footer.home", "Home")}</a>
            <a href="#about">{t("landing.footer.about", "About")}</a>
            <a href="#contact">{t("landing.footer.contact", "Contact")}</a>
          </div>
          <div>
            <h4>{t("landing.footer.support", "Support")}</h4>
            <a href="#contact">{t("landing.footer.help", "Help")}</a>
            <a href="#contact">{t("landing.footer.userGuide", "User Guide")}</a>
            <a href="#contact">{t("landing.footer.faqs", "FAQs")}</a>
          </div>
          <div>
            <h4>{t("landing.footer.legal", "Legal")}</h4>
            <a href="#contact">
              {t("landing.footer.privacy", "Privacy Policy")}
            </a>
            <a href="#contact">
              {t("landing.footer.terms", "Terms of Service")}
            </a>
          </div>
        </div>
        <div className="landing-wrap footer-bottom">
          <span>
            {t(
              "landing.footer.copyright",
              "© 2026 Ethiopia Customs Commission"
            )}
          </span>
          <span>
            {t(
              "landing.footer.tagline",
              "Secure borders. Prosperous nation."
            )}
          </span>
        </div>
      </footer>
    </main>
  );
}

function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="section-title">
      <div>
        <span />
        <h2>{title}</h2>
        <span />
      </div>
      <p>{subtitle}</p>
    </div>
  );
}
