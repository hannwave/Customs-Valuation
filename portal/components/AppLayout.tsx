"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
const links = [["/", "dashboard"], ["/hs-codes", "hsCodes"], ["/international-prices", "international"],
  ["/local-prices", "local"], ["/historical-customs-prices", "historical"], ["/analytics", "analytics"],
  ["/valuation-decisions", "decisions"], ["/integrations", "integrations"], ["/reports", "reports"],
  ["/administration", "administration"], ["/audit", "audit"]];
export function AppLayout({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation(); const pathname = usePathname();
  useEffect(() => { document.documentElement.lang = i18n.language; }, [i18n.language]);
  return <div className="workspace"><aside><div className="brand">SES <span>CUSTOMS</span></div><p className="nav-label">{t("subtitle")}</p>
    <nav aria-label={t("title")}>{links.map(([href,key]) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>{t(key)}</Link>)}</nav>
    <p className="sidebar-note">{t("phase")}</p></aside><div className="content"><header><span>{t("title")}</span>
    <label>{t("language")} <select value={i18n.language} onChange={e => void i18n.changeLanguage(e.target.value)}><option value="en">English</option><option value="am">አማርኛ</option></select></label></header>
    <div className="demo" role="note">{t("demo")}</div><main>{children}</main></div></div>;
}
