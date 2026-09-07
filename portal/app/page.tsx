"use client";
import Link from "next/link";
import { useTranslation } from "react-i18next";
export default function Dashboard() {
  const { t } = useTranslation();
  return <><p className="eyebrow">{t("phase")}</p><h1>{t("title")}</h1><p className="lead">{t("decisionSupport")}</p>
    <Link className="primary-link" href="/hs-codes">{t("start")} →</Link><h2>{t("separatePools")}</h2><p>{t("poolBody")}</p>
    <div className="cards">{[["01","international"],["02","local"],["03","historical"]].map(([n,key]) => <section className="card" key={key}><span className="number">{n}</span><h3>{t(key)}</h3><span className="badge">{t("planned")}</span></section>)}</div></>;
}
