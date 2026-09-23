"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import {
  FiActivity, FiArchive, FiBarChart2, FiBookOpen, FiCheckSquare, FiChevronLeft, FiChevronRight,
  FiFileText, FiGlobe, FiGrid, FiInfo, FiLogOut, FiMapPin, FiMenu,
  FiShield, FiShoppingBag, FiUser, FiUsers, FiX,
} from "react-icons/fi";
import { LanguageSelect } from "@/components/AuthShell";
import { Brand } from "@/components/Brand";
import { getSessionAccessToken, setSessionAccessToken } from "@/lib/auth/session";
import { normalizeWorkspaceRole, roleLabel, workspaceApi, type WorkspaceNotifications, type WorkspaceProfile, type WorkspaceRole } from "@/lib/workspace";
import { clearValuationSession, readValuationSession } from "@/lib/valuation-session";

type NavLink = { href: string; key: string; label: string; icon: typeof FiGrid; notificationKey?: keyof WorkspaceNotifications };
type NavGroup = { label: string; links: NavLink[] };
const evidenceLinks: NavLink[] = [
    { href: "/international-prices", key: "international", label: "Global market", icon: FiGlobe },
    { href: "/local-prices", key: "local", label: "Local market", icon: FiShoppingBag },
    { href: "/historical-customs-prices", key: "historical", label: "Customs history", icon: FiArchive },
    { href: "/outlier-analysis", key: "outliers", label: "Price analysis", icon: FiBarChart2 },
];
const accountGroup: NavGroup = { label: "ACCOUNT", links: [{ href: "/profile", key: "profile", label: "My profile", icon: FiUser }] };
const officerOnlyPaths = evidenceLinks.map(link => link.href);
const officerSessionPaths = [...officerOnlyPaths, "/analytics"];
const customsAdminRemovedPaths = ["/valuation-decisions", "/reports"];
function navForRole(role: WorkspaceRole, hasValuationSession = false): NavGroup[] {
  if (role === "SystemAdministrator") return [
    { label: "SYSTEM ADMINISTRATION", links: [{ href: "/", key: "systemOverview", label: "System overview", icon: FiGrid },
      { href: "/administration", key: "administration", label: "Users and access", icon: FiUsers },
    ] },
    { label: "LOCATION MANAGEMENT", links: [
      { href: "/administration/organization", key: "organization", label: "Organization", icon: FiMapPin },
      { href: "/administration/regions", key: "regions", label: "Regions", icon: FiMapPin },
      { href: "/administration/branches", key: "branches", label: "Branches", icon: FiMapPin }
    ] },
    { label: "MASTER DATA", links: [{ href: "/hs-codes", key: "hsCodes", label: "HS codes and revisions", icon: FiBookOpen }] },
    { label: "AUDIT", links: [{ href: "/audit", key: "audit", label: "Audit trail", icon: FiActivity }] },
    accountGroup,
  ];
  if (role === "CustomsAdministrator") return [
    { label: "BRANCH MANAGEMENT", links: [{ href: "/", key: "overview", label: "Operational overview", icon: FiGrid }, { href: "/administration", key: "administration", label: "Employees and assignments", icon: FiUsers, notificationKey: "pendingOfficerApplications" }] },
    { label: "REFERENCE DATA", links: [{ href: "/hs-codes", key: "hsCodes", label: "HS code search", icon: FiBookOpen }] },
    { label: "MONITORING", links: [{ href: "/analytics", key: "analytics", label: "Staff analytics", icon: FiBarChart2 }, { href: "/audit", key: "audit", label: "Audit activity", icon: FiActivity }] },
    accountGroup,
  ];
  const sessionGroups = hasValuationSession ? [
    { label: "PRICE ANALYSIS", links: evidenceLinks },
    { label: "REVIEW & HISTORY", links: [{ href: "/analytics", key: "analytics", label: "Statistics and trends", icon: FiBarChart2 }, { href: "/reports", key: "reports", label: "Decision reports", icon: FiFileText }, { href: "/audit", key: "audit", label: "My activity", icon: FiActivity }] },
  ] : [];
  return [
    { label: "OPERATIONS", links: [{ href: "/", key: "dashboard", label: "Valuation search", icon: FiGrid }, { href: "/hs-codes", key: "hsCodes", label: "HS code search", icon: FiBookOpen }, { href: "/valuation-decisions", key: "decisions", label: "Valuation records", icon: FiCheckSquare }] },
    ...sessionGroups,
    accountGroup,
  ];
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profile, setProfile] = useState<WorkspaceProfile | null>(null);
  const [profileError, setProfileError] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [hasValuationSession, setHasValuationSession] = useState(false);
  const [notifications, setNotifications] = useState<WorkspaceNotifications | null>(null);
  const isAuthPage = pathname === "/login" || pathname === "/signup" || pathname === "/employee-registration";

  useEffect(() => { document.documentElement.lang = i18n.resolvedLanguage ?? "en"; }, [i18n.resolvedLanguage]);
  useEffect(() => {
    setMenuOpen(false);
    if (isAuthPage) return;
    if (!getSessionAccessToken()) {
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    setAuthorized(true);
    setProfileError("");
    void workspaceApi<WorkspaceProfile>("/me")
      .then(current => {
        const role = normalizeWorkspaceRole(current.user.role);
        setProfile(role ? { ...current, user: { ...current.user, role } } : current);
      })
      .catch(error => setProfileError(error instanceof Error ? error.message : "Profile unavailable."));
  }, [pathname, isAuthPage]);
  useEffect(() => {
    if (isAuthPage || !authorized) return;
    const refreshProfile = () => {
      void workspaceApi<WorkspaceProfile>("/me")
        .then(current => {
          const role = normalizeWorkspaceRole(current.user.role);
          setProfile(role ? { ...current, user: { ...current.user, role } } : current);
        })
        .catch(error => setProfileError(error instanceof Error ? error.message : "Profile unavailable."));
    };
    window.addEventListener("profile-updated", refreshProfile);
    return () => window.removeEventListener("profile-updated", refreshProfile);
  }, [authorized, isAuthPage]);

  useEffect(() => {
    if (isAuthPage || !authorized || profile?.user.role !== "CustomsAdministrator") {
      setNotifications(null);
      return;
    }
    let cancelled = false;
    const refreshNotifications = () => {
      void workspaceApi<WorkspaceNotifications>("/notifications")
        .then(current => { if (!cancelled) setNotifications(current); })
        .catch(() => { if (!cancelled) setNotifications(null); });
    };
    refreshNotifications();
    const interval = window.setInterval(refreshNotifications, 60_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [authorized, isAuthPage, profile?.user.role]);

  useEffect(() => {
    const syncSession = () => setHasValuationSession(Boolean(readValuationSession()));
    syncSession();
    window.addEventListener("storage", syncSession);
    window.addEventListener("focus", syncSession);
    window.addEventListener("valuation-session-updated", syncSession);
    return () => {
      window.removeEventListener("storage", syncSession);
      window.removeEventListener("focus", syncSession);
      window.removeEventListener("valuation-session-updated", syncSession);
    };
  }, []);

  useEffect(() => {
    if (profile && profile.user.role !== "CustomsOfficer" && officerOnlyPaths.some(path => pathname === path || pathname.startsWith(`${path}/`))) {
      window.location.replace("/");
    }
  }, [pathname, profile]);

  useEffect(() => {
    if (profile?.user.role === "CustomsAdministrator" && customsAdminRemovedPaths.some(path => pathname === path || pathname.startsWith(`${path}/`))) {
      window.location.replace("/");
    }
  }, [pathname, profile]);

  useEffect(() => {
    if (!profile || profile.user.role !== "CustomsOfficer") return;
    if (officerSessionPaths.some(path => pathname === path || pathname.startsWith(`${path}/`)) && !readValuationSession()) {
      window.location.replace("/?session=required");
    }
  }, [pathname, profile]);

  const visibleGroups = useMemo(() => profile ? navForRole(profile.user.role, hasValuationSession) : [], [profile, hasValuationSession]);
  const current = visibleGroups.flatMap(group => group.links)
    .filter(link => link.href === "/" ? pathname === "/" : pathname === link.href || pathname.startsWith(`${link.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  const primaryLocation = profile?.locations.find(location => location.id === profile.user.primaryLocationId);

  if (isAuthPage) return <>{children}</>;
  if (!authorized) return <div className="access-loading" role="status">{t("nav.loading", "Opening your workspace…")}</div>;
  return <div className="workspace">
    <a className="skip-link" href="#main-content">{t("nav.skip", "Skip to content")}</a>
    <aside className={`sidebar ${menuOpen ? "is-open" : ""} ${sidebarCollapsed ? "is-collapsed" : ""}`} id="workspace-navigation">
      <div className="sidebar-top">
        <Link href="/" className="sidebar-brand" aria-label={t("dashboard")} title={sidebarCollapsed ? "Ethiopia Customs" : undefined}><Brand compact /></Link>
      </div>
      <nav aria-label={t("title")}>{visibleGroups.map(group => <div className="nav-group" key={group.label}>
        <p className="nav-label">{group.label}</p>
        {group.links.map(link => {
          const Icon = link.icon;
          const active = current?.href === link.href;
          const label = t(link.key, link.label);
          const badgeCount = link.notificationKey ? notifications?.[link.notificationKey] ?? 0 : 0;
          const accessibleLabel = badgeCount > 0 ? `${label}, ${badgeCount} pending` : label;
          return <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)} aria-current={active ? "page" : undefined} aria-label={sidebarCollapsed ? accessibleLabel : undefined} title={sidebarCollapsed ? accessibleLabel : undefined}>
            <Icon aria-hidden="true" /><span className="nav-text">{label}</span>{badgeCount > 0 && <span className="nav-badge" aria-label={`${badgeCount} pending`}>{badgeCount > 99 ? "99+" : badgeCount}</span>}{active && <FiChevronRight className="nav-arrow" aria-hidden="true" />}
          </Link>;
        })}
      </div>)}</nav>
      <div className="sidebar-note"><FiShield /><span>{t("nav.note", "Scope-controlled access")}<small>{primaryLocation?.displayName ?? primaryLocation?.name ?? t("nav.noteBody", "Your assigned customs locations determine visible records.")}</small></span></div>
      <button type="button" className="signout-button" aria-label={sidebarCollapsed ? t("nav.signout", "Sign out") : undefined} title={sidebarCollapsed ? t("nav.signout", "Sign out") : undefined} onClick={() => { clearValuationSession(); setSessionAccessToken(null); window.location.assign("/login"); }}><FiLogOut /><span>{t("nav.signout", "Sign out")}</span></button>
       <button type="button" className={`sidebar-collapse ${sidebarCollapsed ? "is-collapsed" : ""}`} aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"} aria-pressed={sidebarCollapsed} onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
      {sidebarCollapsed ? <FiChevronRight /> : <FiChevronLeft />}
    </button>
    </aside>
    
    <div className="content">
      <header className="workspace-header">
        <div className="header-location">
          <button type="button" className="menu-toggle" aria-expanded={menuOpen} aria-controls="workspace-navigation" aria-label={menuOpen ? "Close navigation" : "Open navigation"} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <FiX /> : <FiMenu />}</button>
          <span className="header-institution">{primaryLocation?.displayName ?? primaryLocation?.name ?? t("nav.customs", "Ethiopia Customs")}</span><FiChevronRight aria-hidden="true" /><strong>{current ? t(current.key, current.label) : t("dashboard", "Valuation search")}</strong>
        </div>
        <div className="header-actions"><LanguageSelect /><div className="profile-chip">
          <span className="profile-avatar">{(profile?.user.fullName ?? profile?.user.username ?? "U").slice(0, 1).toUpperCase()}</span>
          <span className="profile-details"><strong>{profile?.user.fullName ?? profile?.user.username ?? "Workspace user"}</strong><small>{roleLabel(profile?.user.role)}</small></span>
        </div></div>
      </header>
      {profileError && <div className="service-notice" role="status"><FiInfo />{profileError} Refresh the page after the API is available.</div>}
      <main id="main-content" tabIndex={-1}>{children}</main>
      <footer className="workspace-footer"><span>© 2026 Ethiopia Customs Commission</span><span><FiShield />{profile ? `${roleLabel(profile.user.role)} access` : "Valuation decision support"}</span></footer>
    </div>
  </div>;
}
