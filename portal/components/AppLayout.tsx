"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { FiActivity, FiArchive, FiBarChart2, FiBookOpen, FiCheckSquare, FiChevronRight, FiFileText, FiGlobe, FiGrid, FiInfo, FiLogOut, FiMenu, FiSettings, FiShield, FiShoppingBag, FiUsers, FiX } from "react-icons/fi";
import { Brand, LanguageSelect } from "@/components/AuthShell";
import { CommissionLogo } from "@/components/CommissionLogo";
import { getSessionAccessToken, setSessionAccessToken } from "@/lib/auth/session";
const groups = [
  { label: "nav.workspace", fallback: "WORKSPACE", links: [["/", "dashboard", FiGrid], ["/hs-codes", "hsCodes", FiBookOpen]] },
  { label: "nav.evidence", fallback: "PRICE EVIDENCE", links: [["/international-prices", "international", FiGlobe], ["/local-prices", "local", FiShoppingBag], ["/historical-customs-prices", "historical", FiArchive]] },
  { label: "nav.review", fallback: "REVIEW & OVERSIGHT", links: [["/valuation-decisions", "decisions", FiCheckSquare], ["/analytics", "analytics", FiBarChart2], ["/reports", "reports", FiFileText], ["/audit", "audit", FiActivity]] },
  { label: "nav.manage", fallback: "MANAGEMENT", links: [["/administration", "administration", FiUsers], ["/integrations", "integrations", FiSettings]] },
] as const;
export function AppLayout({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation(); const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profile, setProfile] = useState<{ fullName?: string; username?: string; role?: string } | null>(null);
  const [profileUnavailable, setProfileUnavailable] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const isAuthPage = pathname === "/login" || pathname === "/signup";
  useEffect(() => { document.documentElement.lang = i18n.resolvedLanguage ?? "en"; }, [i18n.resolvedLanguage]);
  useEffect(() => {
    setMenuOpen(false);
    if (isAuthPage) return;
    const token = getSessionAccessToken();
    if (!token) { window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`); return; }
    setAuthorized(true);
    const controller = new AbortController();
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080";
    void fetch(`${base}/api/auth/me`, { signal: controller.signal, headers: { Authorization: `Bearer ${token}` } })
      .then(async response => {
        if (response.status === 401) { setSessionAccessToken(null); setAuthorized(false); window.location.assign(`/login?next=${encodeURIComponent(pathname)}`); return null; }
        if (!response.ok) throw new Error("Profile unavailable");
        return response.json();
      }).then(data => { if (data) { setProfile(data); setProfileUnavailable(false); } })
      .catch(() => { if (!controller.signal.aborted) setProfileUnavailable(true); });
    return () => controller.abort();
  }, [pathname, isAuthPage]);
  if (isAuthPage) return <>{children}</>;
  if (!authorized) return <div className="access-loading" role="status">{t("nav.loading", "Opening your workspace…")}</div>;
  const current = groups.flatMap(group => [...group.links]).find(([href]) => href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));
  return <div className="workspace">
    <a className="skip-link" href="#main-content">{t("nav.skip", "Skip to content")}</a>
    <aside className={`sidebar ${menuOpen ? "is-open" : ""}`} id="workspace-navigation">
      <Link href="/" className="sidebar-brand" aria-label={t("dashboard")}><Brand compact/></Link>
      <nav aria-label={t("title")}>{groups.map(group => <div className="nav-group" key={group.label}><p className="nav-label">{t(group.label, group.fallback)}</p>{group.links.map(([href, key, Icon]) => { const active = current?.[0] === href; return <Link key={href} href={href} onClick={() => setMenuOpen(false)} aria-current={active ? "page" : undefined}><Icon aria-hidden="true"/><span>{t(key)}</span>{active && <FiChevronRight className="nav-arrow" aria-hidden="true"/>}</Link>; })}</div>)}</nav>
      <div className="sidebar-note"><FiShield/><span>{t("nav.note", "Evidence-led valuation")}<small>{t("nav.noteBody", "Professional judgment at every step.")}</small></span></div>
      <button type="button" className="signout-button" onClick={() => { setSessionAccessToken(null); window.location.assign("/login"); }}><FiLogOut/>{t("nav.signout", "Sign out")}</button>
    </aside>
    <div className="content"><header className="workspace-header"><div className="header-location"><button type="button" className="menu-toggle" aria-expanded={menuOpen} aria-controls="workspace-navigation" aria-label={t(menuOpen ? "nav.close" : "nav.open", menuOpen ? "Close navigation" : "Open navigation")} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <FiX/> : <FiMenu/>}</button><Link className="mobile-commission-brand" href="/" aria-label={t("dashboard")}><CommissionLogo/></Link><span className="header-institution">{t("nav.customs", "Customs valuation")}</span><FiChevronRight aria-hidden="true"/><strong>{current ? t(current[1]) : t("dashboard")}</strong></div><div className="header-actions"><LanguageSelect/><div className="profile-chip"><span className="profile-avatar">{(profile?.fullName ?? profile?.username ?? "U").slice(0, 1).toUpperCase()}</span><span className="profile-details"><strong>{profile?.fullName ?? profile?.username ?? t("nav.user", "Workspace user")}</strong><small>{profile?.role?.replace(/([a-z])([A-Z])/g, "$1 $2") ?? t("nav.profile", "Profile pending")}</small></span></div></div></header>
    {profileUnavailable && <div className="service-notice" role="status"><FiInfo/>{t("nav.unavailable", "The service is unavailable. Account details and evidence may not load; please try again shortly.")}</div>}
    <main id="main-content" tabIndex={-1}>{children}</main>
    <footer className="workspace-footer"><span>© 2026 Ethiopia Customs Commission</span><span><FiShield/>{t("nav.support", "Valuation decision support")}</span></footer></div>
  </div>;
}
