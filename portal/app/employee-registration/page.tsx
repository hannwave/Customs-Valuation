"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { FiArrowRight, FiCheck, FiLock, FiMapPin, FiShield } from "react-icons/fi";
import { AuthShell } from "@/components/AuthShell";

type LocationOption = { id: string; officialCode: string; name: string; displayName: string; locationType: string; parentLocationId: string | null; region: string; zone: string };
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080";

export default function EmployeeRegistrationPage() {
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [regionId, setRegionId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`${apiBase}/api/auth/administrator-registration-locations`).then(async response => { const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.message ?? "Unable to load regions and branches."); return body as LocationOption[]; }).then(setLocations).catch(ex => setError(ex instanceof Error ? ex.message : "Unable to load regions and branches.")).finally(() => setLoading(false));
  }, []);
  const regions = useMemo(() => locations.filter(location => location.locationType === "REGION"), [locations]);
  const branches = useMemo(() => locations.filter(location => location.locationType === "BRANCH" && location.parentLocationId === regionId), [locations, regionId]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`${apiBase}/api/auth/register-administrator`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: data.get("username"), fullName: data.get("fullName"), staffId: data.get("staffId"), email: data.get("email"), phone: data.get("phone"), department: data.get("department"), regionId: data.get("regionId"), branchId: data.get("branchId"), password: data.get("password"), confirmPassword: data.get("confirmPassword") }) });
      const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.message ?? "Unable to submit the application."); setSent(true);
    } catch (ex) { setError(ex instanceof TypeError ? "We couldn’t connect to the service. Please try again or contact your system administrator." : ex instanceof Error ? ex.message : "Unable to submit the application."); }
    finally { setBusy(false); }
  }
  return <AuthShell signup compact>{sent ? <div className="registration-success" role="status"><span className="form-heading-icon"><FiCheck /></span><p className="eyebrow">APPLICATION SUBMITTED</p><h1>Your application is in review</h1><p className="lead">A System Administrator will review your Customs Administrator application. Your password and username remain private.</p><Link className="primary-link" href="/login">Back to sign in <FiArrowRight /></Link></div> : <form className="auth-form signup-form paper-form" onSubmit={submit} aria-busy={busy}>
    <p className="eyebrow">EMPLOYEE APPLICATION</p><h1>Apply as a Customs Administrator</h1><p className="auth-subtitle">Complete the application in order: your details, your region, then your assigned branch.</p>
    <div className="paper-form-note"><FiShield aria-hidden="true" /><div><strong>System Administrator review</strong><p>Your application is reviewed before access is activated. Your password and username are never shown to the reviewer.</p></div></div>
    {error && <p className="auth-error" role="alert">{error}</p>}
    <div className="form-grid">
      <div className="wide form-section-label"><span>1</span><div><strong>Employee details</strong><small>Identify yourself using your official staff information.</small></div></div>
      <div className="field-group"><label htmlFor="fullName">Full name<span className="required-mark"> *</span></label><input id="fullName" name="fullName" required autoComplete="name" /></div>
      <div className="field-group"><label htmlFor="staffId">Employee ID<span className="required-mark"> *</span></label><input id="staffId" name="staffId" required /></div>
      <div className="field-group"><label htmlFor="email">Official email<span className="required-mark"> *</span></label><input id="email" name="email" type="email" required autoComplete="email" /></div>
      <div className="field-group"><label htmlFor="phone">Phone number<span className="required-mark"> *</span></label><input id="phone" name="phone" type="tel" required autoComplete="tel" /></div>
      <div className="field-group"><label htmlFor="department">Department / office<span className="required-mark"> *</span></label><input id="department" name="department" required /></div>
      <div className="field-group"><label htmlFor="role">Requested role</label><input id="role" value="Customs Administrator" readOnly aria-readonly="true" /></div>
      <div className="wide form-section-label"><span>2</span><div><strong>Location assignment</strong><small>Select the region first. Only branches under that region will appear.</small></div></div>
      <div className="field-group"><label htmlFor="regionId"><FiMapPin aria-hidden="true" /> Region<span className="required-mark"> *</span></label><select id="regionId" name="regionId" required value={regionId} onChange={event => { setRegionId(event.target.value); setBranchId(""); }} disabled={loading}><option value="">{loading ? "Loading regions…" : "Select a region"}</option>{regions.map(region => <option key={region.id} value={region.id}>{region.displayName || region.name} · {region.officialCode}</option>)}</select></div>
      <div className="field-group"><label htmlFor="branchId"><FiMapPin aria-hidden="true" /> Branch<span className="required-mark"> *</span></label><select id="branchId" name="branchId" required value={branchId} onChange={event => setBranchId(event.target.value)} disabled={loading || !regionId}><option value="">{!regionId ? "Select a region first" : branches.length ? "Select a branch" : "No active branches"}</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.displayName || branch.name} · {branch.officialCode}</option>)}</select></div>
      <div className="wide form-section-label"><span>3</span><div><strong>Role and secure account</strong><small>The role is fixed. Your credentials stay private from reviewers.</small></div></div>
      <div className="field-group"><label htmlFor="username">Username<span className="required-mark"> *</span></label><input id="username" name="username" required minLength={3} autoComplete="username" /></div>
      <div className="field-group"><label htmlFor="password"><FiLock aria-hidden="true" /> Password<span className="required-mark"> *</span></label><input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" /></div>
      <div className="field-group wide"><label htmlFor="confirmPassword">Confirm password<span className="required-mark"> *</span></label><input id="confirmPassword" name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" /></div>
    </div>
    <p className="password-requirements"><FiLock aria-hidden="true" /> Use at least 8 characters with uppercase, lowercase, number and symbol.</p>
      <button className="auth-primary" type="submit" disabled={busy || loading || !regionId || !branchId}>{busy ? "Submitting…" : "Submit application"}<FiArrowRight aria-hidden="true" /></button>
    <p className="auth-register">Already have an account? <Link href="/login">Sign in</Link></p>
  </form>}</AuthShell>;
}
