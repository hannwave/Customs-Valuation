"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { FiActivity, FiAlertTriangle, FiCheckCircle, FiChevronLeft, FiChevronRight, FiClock, FiFileText, FiGrid, FiLogOut, FiMenu, FiPlusCircle, FiShield, FiUser, FiUserCheck, FiX, FiXCircle } from "react-icons/fi";
import { LanguageSelect } from "@/components/AuthShell";
import { Brand } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/importer/NotificationBell";
import { getSessionAccessToken, setSessionAccessToken } from "@/lib/auth/session";
import { getImporterAccount, getImporterProfile, importerApi, importerApiBase, loadImporterPhoto, verificationLabels, type DeclarationSummary, type ImporterAccount, type ImporterProfile, type VerificationStatus } from "@/lib/importer";
import { ToastMessage } from "@/components/Toaster";

type Account = { fullName: string; email: string; role: string };
type PortalState = {
  account: Account | null;
  /** Live account details and profile picture (object URL), refreshed when the importer edits them. */
  accountDetails: ImporterAccount | null;
  photoUrl: string | null;
  setAccountDetails: (details: ImporterAccount) => void;
  reloadPhoto: () => Promise<void>;
  profile: ImporterProfile | null | undefined; // undefined while loading, null when never submitted
  setProfile: (profile: ImporterProfile) => void;
  declarations: DeclarationSummary[] | null;
  reloadDeclarations: () => Promise<void>;
  verified: boolean;
};

const PortalContext = createContext<PortalState | null>(null);
/** Portal state, or null outside the signed-in shell (for example on the public landing page). */
export function usePortalOptional() { return useContext(PortalContext); }

export function usePortal() {
  const value = useContext(PortalContext);
  if (!value) throw new Error("usePortal must be used inside ImporterShell.");
  return value;
}

const statusIcons: Record<VerificationStatus, typeof FiClock> = { PENDING: FiClock, INFORMATION_REQUESTED: FiAlertTriangle, VERIFIED: FiCheckCircle, SUSPENDED: FiAlertTriangle, REJECTED: FiXCircle };

/** Dashboard shell for signed-in importers: the same sidebar and header as the staff workspace. */
export function ImporterShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [account, setAccount] = useState<Account | null>(null);
  const [profile, setProfile] = useState<ImporterProfile | null | undefined>(undefined);
  const [declarations, setDeclarations] = useState<DeclarationSummary[] | null>(null);
  const [accountDetails, setAccountDetailsState] = useState<ImporterAccount | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const reloadPhoto = useCallback(async () => {
    const next = await loadImporterPhoto().catch(() => null);
    setPhotoUrl(current => { if (current) URL.revokeObjectURL(current); return next; });
  }, []);
  const setAccountDetails = useCallback((details: ImporterAccount) => {
    setAccountDetailsState(details);
    setAccount(current => current ? { ...current, fullName: details.fullName, email: details.email } : current);
  }, []);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const reloadDeclarations = useCallback(async () => {
    try { setDeclarations(await importerApi<DeclarationSummary[]>("/importer-declarations")); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Declarations could not be loaded."); }
  }, []);

  useEffect(() => {
    const token = getSessionAccessToken();
    if (!token) { window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`); return; }
    fetch(`${importerApiBase}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async response => { if (response.status === 401) throw new Error("expired"); if (!response.ok) throw new Error("Your account could not be loaded."); return response.json() as Promise<Account>; })
      .then(user => {
        setAccount(user);
        if (user.role !== "Importer") return;
        void getImporterProfile().then(setProfile).catch(reason => { setProfile(null); setError(reason instanceof Error ? reason.message : "Verification status unavailable."); });
        void reloadDeclarations();
        void getImporterAccount().then(details => { setAccountDetails(details); if (details.hasPhoto) void reloadPhoto(); }).catch(() => undefined);
      })
      .catch(reason => {
        if (reason instanceof Error && reason.message === "expired") { setSessionAccessToken(null); window.location.assign("/login?next=%2Fimporter"); return; }
        setError(reason instanceof Error ? reason.message : "Your account could not be loaded.");
      });
  }, [reloadDeclarations, setAccountDetails, reloadPhoto]);
  useEffect(() => setMenuOpen(false), [pathname]);
  // A new notification means an officer changed something: refresh the account and declaration lists.
  const refreshAll = useCallback(() => {
    void reloadDeclarations();
    void getImporterProfile().then(setProfile).catch(() => undefined);
  }, [reloadDeclarations]);

  const verified = profile?.verificationStatus === "VERIFIED";
  const actionNeeded = declarations?.filter(item => item.status === "INFORMATION_REQUESTED").length ?? 0;
  const state = useMemo<PortalState>(() => ({ account, accountDetails, photoUrl, setAccountDetails, reloadPhoto, profile, setProfile, declarations, reloadDeclarations, verified }),
    [account, accountDetails, photoUrl, setAccountDetails, reloadPhoto, profile, declarations, reloadDeclarations, verified]);
  const signOut = () => { setSessionAccessToken(null); window.location.assign("/importer"); };

  const nav = [
    { label: "OVERVIEW", links: [{ href: "/importer", label: "Dashboard", icon: FiGrid }] },
    { label: "DECLARATIONS", links: [{ href: "/importer/declarations", label: "My declarations", icon: FiFileText, badge: actionNeeded }, { href: "/importer/declarations/new", label: "New declaration", icon: FiPlusCircle }] },
    { label: "ACTIVITY", links: [{ href: "/importer/activity", label: "Activity", icon: FiActivity }] },
    { label: "ACCOUNT", links: [{ href: "/importer/profile", label: "My profile", icon: FiUser }, { href: "/importer/account", label: "Verification & documents", icon: FiUserCheck, badge: profile && profile.verificationStatus !== "VERIFIED" ? 1 : profile === null ? 1 : 0 }] },
  ];
  const title = pathname === "/importer" ? "Dashboard" : pathname === "/importer/declarations" ? "My declarations" : pathname === "/importer/declarations/new" ? "New declaration"
    : pathname.startsWith("/importer/declarations/") ? "Declaration details" : pathname === "/importer/account" ? "Verification & documents" : pathname === "/importer/profile" ? "My profile" : pathname === "/importer/activity" ? "Activity" : "Importer portal";
  const active = nav.flatMap(group => group.links).filter(link => link.href === "/importer" ? pathname === "/importer" : pathname === link.href || pathname.startsWith(`${link.href}/`)).sort((a, b) => b.href.length - a.href.length)[0];
  const status: VerificationStatus | "MISSING" | null = profile === undefined ? null : profile === null ? "MISSING" : profile.verificationStatus;
  const StatusIcon = status && status !== "MISSING" ? statusIcons[status] : FiAlertTriangle;
  const initials = (account?.fullName ?? "I").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();

  if (account && account.role !== "Importer") return <main className="ip-blocked"><div><FiShield aria-hidden="true" /><h1>Importer account required</h1><p>This portal is for importer accounts. Your customs workspace uses a different role.</p><Link className="iv-primary" href="/dashboard">Return to workspace</Link></div></main>;

  return <PortalContext.Provider value={state}>
    <div className="workspace ip-workspace">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className={`sidebar ${menuOpen ? "is-open" : ""} ${collapsed ? "is-collapsed" : ""}`} id="importer-navigation">
        <div className="sidebar-top"><Link href="/importer" className="sidebar-brand" aria-label="Importer dashboard"><Brand compact /></Link></div>
        <nav aria-label="Importer portal">{nav.map(group => <div className="nav-group" key={group.label}>
          <p className="nav-label">{group.label}</p>
          {group.links.map(link => { const Icon = link.icon; const isActive = active?.href === link.href; const badge = "badge" in link ? link.badge ?? 0 : 0;
            return <Link key={link.href} href={link.href} aria-current={isActive ? "page" : undefined} title={collapsed ? link.label : undefined} aria-label={collapsed ? link.label : undefined}>
              <Icon aria-hidden="true" /><span className="nav-text">{link.label}</span>{badge > 0 && <span className="nav-badge" aria-label={`${badge} need attention`}>{badge}</span>}{isActive && <FiChevronRight className="nav-arrow" aria-hidden="true" />}
            </Link>; })}
        </div>)}</nav>
        <button type="button" className="signout-button" onClick={signOut} title={collapsed ? "Sign out" : undefined}><FiLogOut /><span>Sign out</span></button>
        <button type="button" className={`sidebar-collapse ${collapsed ? "is-collapsed" : ""}`} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} aria-pressed={collapsed} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <FiChevronRight /> : <FiChevronLeft />}</button>
      </aside>
      <div className="content">
        <header className="workspace-header">
          <div className="header-location">
            <button type="button" className="menu-toggle" aria-expanded={menuOpen} aria-controls="importer-navigation" aria-label={menuOpen ? "Close navigation" : "Open navigation"} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <FiX /> : <FiMenu />}</button>
            <span className="header-institution">Importer portal</span><FiChevronRight aria-hidden="true" /><strong>{title}</strong>
          </div>
          <div className="header-actions">
            {account?.role === "Importer" && <NotificationBell onChange={refreshAll} />}
            {status && <span className={`ip-status-pill is-${status.toLowerCase().replaceAll("_", "-")}`}><StatusIcon aria-hidden="true" /><span>{status === "MISSING" ? "Verification needed" : verificationLabels[status]}</span></span>}
            <ThemeToggle />
            <LanguageSelect />
            <Link href="/importer/profile" className="profile-chip ip-profile-chip" title="My profile"><span className="profile-avatar">{photoUrl ? <img src={photoUrl} alt="" /> : initials}</span><span className="profile-details"><strong>{account?.fullName ?? "Importer"}</strong><small>Importer</small></span></Link>
          </div>
        </header>
        <ToastMessage kind="warning" title="Service unavailable" message={error} duration={0} />
        <main id="main-content" tabIndex={-1} className="ip-main">{account ? children : <div className="ip-loading" role="status"><span className="dv-spinner" aria-hidden="true" />Opening your importer portal…</div>}</main>
        <footer className="workspace-footer"><span>© 2026 Ethiopia Customs Commission</span><span><FiShield />Importer access</span></footer>
      </div>
    </div>
  </PortalContext.Provider>;
}
