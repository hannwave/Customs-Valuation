"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { FiArrowLeft, FiArrowRight, FiCheck, FiEye, FiEyeOff, FiGlobe, FiLock, FiShield, FiTruck, FiUser } from "react-icons/fi";
import { setSessionAccessToken } from "@/lib/auth/session";
import { CommissionLogo } from "@/components/CommissionLogo";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`institution-brand ${compact ? "compact" : ""}`}><CommissionLogo variant="light" priority/><span className="brand-caption">VALUATION WORKSPACE</span></div>;
}
export function LanguageSelect() {
  const { t, i18n } = useTranslation();
  return <label className="language-select"><FiGlobe aria-hidden="true"/><span className="sr-only">{t("language")}</span><select value={i18n.resolvedLanguage ?? "en"} onChange={e => void i18n.changeLanguage(e.target.value)}><option value="en">English</option><option value="am">አማርኛ</option></select></label>;
}
export function AuthShell({ children, signup = false }: { children: React.ReactNode; signup?: boolean }) {
  const { t } = useTranslation();
  return <div className={`auth-page ${signup ? "registration-page" : ""}`}>
    <section className="auth-hero" aria-label="Customs valuation workspace">
      <Brand/>
      <div className="auth-hero-copy"><span className="hero-kicker">{t("auth.trade", "FACILITATING TRADE. PROTECTING OUR FUTURE.")}</span><h2>{t("auth.heroFirst", "Secure borders.")}<br/><span>{t("auth.heroSecond", "Prosperous nation.")}</span></h2><p>{t("auth.heroBody", "Better evidence. Informed decisions. A shared workspace for the people moving Ethiopian trade forward.")}</p></div>
      <div className="auth-hero-bottom"><div className="auth-pillars"><span><FiShield/><b>{t("auth.secure", "Accountable operations")}</b></span><span><FiTruck/><b>{t("auth.efficient", "Efficient trade")}</b></span></div><div className="auth-hero-footer">ETHIOPIA CUSTOMS COMMISSION</div></div>
    </section>
    <section className="auth-side"><div className="auth-topbar">{signup ? <Link href="/login" className="back-link"><FiArrowLeft/>{t("auth.back", "Back to sign in")}</Link> : <span className="portal-label">{t("auth.portal", "CUSTOMS VALUATION PORTAL")}</span>}<LanguageSelect/></div>
      <div className="auth-card"><CommissionLogo className="auth-form-logo" priority/>{children}</div>
      <footer className="auth-footer"><span>© 2026 Ethiopia Customs Commission</span><span><FiShield aria-hidden="true"/>{t("auth.authorized", "For authorized personnel")}</span></footer>
    </section>
  </div>;
}
function PasswordField({ name, label, placeholder, autoComplete = "new-password" }: { name: string; label: string; placeholder: string; autoComplete?: string }) {
  const [visible, setVisible] = useState(false);
  const { t } = useTranslation();
  return <div className="field-group"><label htmlFor={name}>{label}<span className="required-mark"> *</span></label><div className="input-with-icon"><FiLock aria-hidden="true"/><input id={name} name={name} required type={visible ? "text" : "password"} autoComplete={autoComplete} placeholder={placeholder}/><button className="password-toggle" type="button" aria-label={`${visible ? t("auth.hide", "Hide password") : t("auth.show", "Show password")}: ${label}`} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <FiEyeOff/> : <FiEye/>}</button></div></div>;
}
export function LoginForm() {
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const router = useRouter(); const { t } = useTranslation();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const data = new FormData(e.currentTarget); setBusy(true); setError("");
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080";
      const response = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identity: data.get("identity"), password: data.get("password") }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? t("auth.invalid", "Check your username and password and try again."));
      setSessionAccessToken(body.accessToken);
      const requestedPath = new URLSearchParams(window.location.search).get("next");
      router.push(requestedPath?.startsWith("/") && !requestedPath.startsWith("//") ? requestedPath : "/");
    } catch (ex) { setError(ex instanceof TypeError ? t("auth.unavailable", "We couldn’t connect to the service. Please try again or contact your system administrator.") : ex instanceof Error ? ex.message : t("auth.invalid", "Unable to sign in. Please try again.")); }
    finally { setBusy(false); }
  }
  return <form className="auth-form" onSubmit={submit} aria-busy={busy}>
    <div className="form-heading"><p className="eyebrow">{t("auth.welcome", "YOUR VALUATION WORKSPACE")}</p><h1>{t("auth.signIn", "Welcome back")}</h1><p className="auth-subtitle">{t("auth.signInBody", "Sign in to access classification and price evidence.")}</p></div>
    {error && <p className="auth-error" role="alert">{error}</p>}
    <div className="field-group"><label htmlFor="identity">{t("auth.identity", "Username or email")}<span className="required-mark"> *</span></label><div className="input-with-icon"><FiUser aria-hidden="true"/><input id="identity" name="identity" required autoComplete="username" placeholder={t("auth.identityPlaceholder", "Enter your username or email")}/></div></div>
    <PasswordField name="password" label={t("auth.password", "Password")} placeholder={t("auth.passwordPlaceholder", "Enter your password")} autoComplete="current-password"/>
    <button className="auth-primary" type="submit" disabled={busy}>{busy ? t("auth.signingIn", "Signing in…") : t("auth.signInAction", "Sign in to workspace")}<FiArrowRight aria-hidden="true"/></button>
    <details className="access-help"><summary>{t("auth.help", "Need help signing in?")}</summary><p>{t("auth.helpBody", "Contact your system administrator for account approval or password assistance.")}</p></details>
    <div className="auth-register"><span>{t("auth.noAccount", "New to the workspace?")}</span><Link href="/signup">{t("auth.request", "Request an account")}<FiArrowRight aria-hidden="true"/></Link></div>
    <div className="auth-assurance"><FiShield aria-hidden="true"/><p>{t("auth.assurance", "Access is assigned by role. Valuation evidence supports the judgment of an authorized customs officer.")}</p></div>
  </form>;
}
export function SignupForm() {
  const [error, setError] = useState(""); const [sent, setSent] = useState(false); const [busy, setBusy] = useState(false);
  const { t } = useTranslation();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const data = new FormData(e.currentTarget);
    if (data.get("password") !== data.get("confirm")) { setError(t("auth.mismatch", "Passwords do not match.")); return; }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(String(data.get("password")))) { setError(t("auth.passwordError", "Use at least 8 characters with uppercase, lowercase, a number and a special character.")); return; }
    setBusy(true); setError("");
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080";
      const response = await fetch(`${base}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName: data.get("fullName"), staffId: data.get("staffId"), email: data.get("email"), phone: data.get("phone"), department: data.get("department"), role: data.get("role"), password: data.get("password"), confirmPassword: data.get("confirm") }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.message ?? t("auth.registrationError", "Unable to submit registration."));
      setSent(true);
    } catch (ex) { setError(ex instanceof TypeError ? t("auth.unavailable", "We couldn’t connect to the service. Please try again or contact your system administrator.") : ex instanceof Error ? ex.message : t("auth.registrationError", "Unable to submit registration.")); }
    finally { setBusy(false); }
  }
  if (sent) return <div className="registration-success" role="status"><span className="form-heading-icon"><FiCheck/></span><p className="eyebrow">{t("auth.submitted", "REQUEST SUBMITTED")}</p><h1>{t("auth.pending", "Your request is in review")}</h1><p className="lead">{t("auth.pendingBody", "Your system administrator will review your details and approve access before you can sign in.")}</p><Link className="primary-link" href="/login">{t("auth.back", "Back to sign in")}<FiArrowRight/></Link></div>;
  return <form className="auth-form signup-form" onSubmit={submit} aria-busy={busy}>
    <p className="eyebrow">{t("auth.join", "JOIN THE WORKSPACE")}</p><h1>{t("auth.create", "Request an account")}</h1><p className="auth-subtitle">{t("auth.createBody", "Start with your official staff details.")}</p>
    <div className="auth-assurance registration-note"><FiShield aria-hidden="true"/><p>{t("auth.approval", "Every account is reviewed and approved by a system administrator.")}</p></div>
    {error && <p className="auth-error" role="alert">{error}</p>}
    <div className="form-grid">
      <div className="field-group"><label htmlFor="fullName">{t("auth.fullName", "Full name")}<span className="required-mark"> *</span></label><input id="fullName" name="fullName" required autoComplete="name" placeholder={t("auth.fullName", "Full name")}/></div>
      <div className="field-group"><label htmlFor="staffId">{t("auth.staff", "Employee / staff ID")}<span className="required-mark"> *</span></label><input id="staffId" name="staffId" required placeholder={t("auth.staffPlaceholder", "Your employee ID")}/></div>
      <div className="field-group"><label htmlFor="email">{t("auth.email", "Official email")}<span className="required-mark"> *</span></label><input id="email" name="email" type="email" required autoComplete="email" placeholder="name@organization.et"/></div>
      <div className="field-group"><label htmlFor="phone">{t("auth.phone", "Phone number")} <small>{t("auth.optional", "(optional)")}</small></label><input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="+251 …"/></div>
      <div className="field-group"><label htmlFor="department">{t("auth.department", "Department / office")}<span className="required-mark"> *</span></label><select id="department" name="department" required defaultValue=""><option value="" disabled>{t("auth.selectOffice", "Select office")}</option><option value="Head Office">{t("auth.headOffice", "Head Office")}</option><option value="Regional Office">{t("auth.regionalOffice", "Regional Office")}</option><option value="Port Office">{t("auth.portOffice", "Port Office")}</option></select></div>
      <div className="field-group"><label htmlFor="role">{t("auth.role", "Requested role")}<span className="required-mark"> *</span></label><select id="role" name="role" required defaultValue=""><option value="" disabled>{t("auth.selectRole", "Select role")}</option><option value="Customs Officer">{t("auth.officer", "Customs Officer")}</option><option value="Customs Administrator">{t("auth.administrator", "Customs Administrator")}</option></select></div>
      <div className="wide"><PasswordField name="password" label={t("auth.password", "Password")} placeholder={t("auth.createPassword", "Create a strong password")}/></div>
      <div className="wide"><PasswordField name="confirm" label={t("auth.confirm", "Confirm password")} placeholder={t("auth.repeatPassword", "Re-enter your password")}/></div>
    </div>
    <div className="password-requirements"><FiLock aria-hidden="true"/><p>{t("auth.passwordError", "Use at least 8 characters with uppercase, lowercase, a number and a special character.")}</p></div>
    <button className="auth-primary" type="submit" disabled={busy}>{busy ? t("auth.submitting", "Submitting request…") : t("auth.submit", "Submit account request")}<FiArrowRight aria-hidden="true"/></button>
    <p className="auth-register">{t("auth.haveAccount", "Already have an account?")} <Link href="/login">{t("auth.signInShort", "Sign in")}</Link></p>
  </form>;
}
