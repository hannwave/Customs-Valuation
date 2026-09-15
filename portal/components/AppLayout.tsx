"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { getSessionAccessToken, setSessionAccessToken } from "@/lib/auth/session";
const links = [["/", "dashboard"], ["/hs-codes", "hsCodes"], ["/international-prices", "international"],
  ["/local-prices", "local"], ["/historical-customs-prices", "historical"], ["/analytics", "analytics"],
  ["/valuation-decisions", "decisions"], ["/integrations", "integrations"], ["/reports", "reports"],
  ["/administration", "administration"], ["/audit", "audit"]];
export function AppLayout({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation(); const pathname = usePathname();
  const [profile, setProfile] = useState<{ fullName?: string; username?: string; role?: string } | null>(null);
  useEffect(() => { document.documentElement.lang = i18n.language; }, [i18n.language]);
  useEffect(() => {
    if (pathname === "/login" || pathname === "/signup") return;
    const token = getSessionAccessToken();
    if (!token) {
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.assign(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080";
    void fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async response => {
        if (response.status === 401) {
          setSessionAccessToken(null);
          const next = `${window.location.pathname}${window.location.search}`;
          window.location.assign(`/login?next=${encodeURIComponent(next)}`);
          return null;
        }
        return response.ok ? response.json() : null;
      })
      .then(data => { if (data) setProfile(data); })
      .catch(() => undefined);
  }, [pathname]);
  if (pathname === "/login" || pathname === "/signup") return <>{children}</>;
  return <div className="workspace"><aside><div className="brand">SES <span>CUSTOMS</span></div><p className="nav-label">{t("subtitle")}</p>
    <nav aria-label={t("title")}>{links.map(([href,key]) => { const isActive = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`); return <Link key={href} href={href} aria-current={isActive ? "page" : undefined} className={isActive ? "active" : undefined}>{t(key)}</Link>; })}</nav>
    <p className="sidebar-note">{t("phase")}</p></aside><div className="content"><header><span>{t("title")}</span>
    <div className="header-actions"><label>{t("language")} <select value={i18n.language} onChange={e => void i18n.changeLanguage(e.target.value)}><option value="en">English</option><option value="am">አማርኛ</option></select></label><div className="profile-chip" aria-label="Signed-in user"><span className="profile-avatar">{(profile?.fullName ?? profile?.username ?? "U").slice(0, 1).toUpperCase()}</span><span className="profile-details"><strong>{profile?.fullName ?? profile?.username ?? "Signed-in user"}</strong><small>{profile?.role ?? "User"}</small></span></div></div></header>
    <div className="demo" role="note">{t("demo")}</div><main>{children}</main></div></div>;
}
