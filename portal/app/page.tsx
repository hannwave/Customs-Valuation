"use client";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { FiArrowRight, FiArchive, FiBookOpen, FiCheckCircle, FiGlobe, FiLayers, FiShoppingBag } from "react-icons/fi";
export default function Dashboard() {
  const { t } = useTranslation();
  const pools = [
    { href: "/international-prices", key: "international", icon: FiGlobe, number: "01", body: t("overview.internationalBody", "Explore overseas market prices with source, currency and product context."), action: t("overview.internationalAction", "Explore international prices") },
    { href: "/local-prices", key: "local", icon: FiShoppingBag, number: "02", body: t("overview.localBody", "Analyze Ethiopian marketplace observations and review comparable listings."), action: t("overview.localAction", "Analyze local prices") },
    { href: "/historical-customs-prices", key: "historical", icon: FiArchive, number: "03", body: t("overview.historicalBody", "A dedicated space for historical customs evidence. This module is planned."), action: t("overview.historicalAction", "View module details") },
  ];
  return <>
    <div className="page-heading"><div><p className="eyebrow">{t("overview.eyebrow", "CLASSIFICATION · EVIDENCE · REVIEW")}</p><h1>{t("overview.title", "Your valuation workspace")}</h1><p className="lead">{t("overview.intro", "Find the right classification. Build a clearer picture of value.")}</p></div><span className="workspace-tag"><FiLayers/>{t("overview.tag", "Reference workspace")}</span></div>
    <section className="overview-hero"><div><span className="hero-kicker">{t("overview.startLabel", "A WELL-INFORMED DECISION STARTS HERE")}</span><h2>{t("overview.hero", "Start with the right HS code.")}</h2><p>{t("overview.heroBody", "Search commodity classifications, check tariff details and establish the basis for your evidence review.")}</p><Link className="primary-link" href="/hs-codes"><FiBookOpen/>{t("start")}<FiArrowRight/></Link></div><div className="hero-watermark" aria-hidden="true"><FiBookOpen/></div></section>
    <div className="section-heading"><div><p className="eyebrow">{t("overview.evidence", "BUILD YOUR EVIDENCE")}</p><h2>{t("separatePools")}</h2><p>{t("overview.poolBody", "Each source has its own context. Keep the evidence distinct as you assess comparability.")}</p></div></div>
    <div className="evidence-cards">{pools.map(pool => <Link className="evidence-card" href={pool.href} key={pool.key}><div className="evidence-card-top"><span className="evidence-icon"><pool.icon/></span><span className="evidence-number">{pool.number}</span></div><h3>{t(pool.key)}</h3><p>{pool.body}</p><span className="card-action">{pool.action}<FiArrowRight/></span></Link>)}</div>
    <section className="decision-note"><FiCheckCircle aria-hidden="true"/><div><h3>{t("overview.officer", "Evidence informs. Officers decide.")}</h3><p>{t("decisionSupport")}</p></div></section>
  </>;
}
