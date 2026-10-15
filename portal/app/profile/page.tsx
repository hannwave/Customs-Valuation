"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiAtSign, FiBriefcase, FiCheck, FiEye, FiEyeOff, FiKey, FiLock, FiMail, FiMapPin, FiPhone, FiShield, FiUser } from "react-icons/fi";
import { DataState } from "@/components/DataState";
import { locationLabel, roleLabel, workspaceApi, type SelfProfile } from "@/lib/workspace";
import { ToastMessage } from "@/components/Toaster";
import { PageHeader } from "@/components/importer/PortalParts";
import { PageSkeleton } from "@/components/PageSkeleton";

type ProfileForm = { username: string; email: string; fullName: string; phone: string };
type PasswordForm = { currentPassword: string; newPassword: string; confirmPassword: string };

const emptyProfile: ProfileForm = { username: "", email: "", fullName: "", phone: "" };
const emptyPassword: PasswordForm = { currentPassword: "", newPassword: "", confirmPassword: "" };
const rules: [string, (value: string) => boolean][] = [
  ["At least 8 characters", value => value.length >= 8], ["An uppercase letter", value => /[A-Z]/.test(value)], ["A lowercase letter", value => /[a-z]/.test(value)],
  ["A number", value => /\d/.test(value)], ["A symbol", value => /[^A-Za-z0-9]/.test(value)],
];

export default function ProfilePage() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<SelfProfile | null>(null);
  const [form, setForm] = useState<ProfileForm>(emptyProfile);
  const [password, setPassword] = useState<PasswordForm>(emptyPassword);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [show, setShow] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const current = await workspaceApi<SelfProfile>("/profile");
      setProfile(current);
      setForm({ username: current.user.username ?? "", email: current.user.email, fullName: current.user.fullName, phone: current.user.phone ?? "" });
    } catch (ex) { setError(ex instanceof Error ? ex.message : t("profileLoadError", "Unable to load your profile.")); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("profile"); setError(""); setNotice("");
    try {
      const response = await workspaceApi<{ user: SelfProfile["user"] }>("/profile", { method: "PATCH", body: JSON.stringify(form) });
      setProfile(value => value ? { ...value, user: response.user } : value);
      window.dispatchEvent(new Event("profile-updated"));
      setNotice(t("profileUpdated", "Profile details updated."));
    } catch (ex) { setError(ex instanceof Error ? ex.message : t("profileUpdateError", "Profile update failed.")); }
    finally { setBusy(""); }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("password"); setError(""); setNotice("");
    try {
      await workspaceApi("/profile/password", { method: "POST", body: JSON.stringify(password) });
      setPassword(emptyPassword);
      setNotice(t("profilePasswordChanged", "Password changed."));
    } catch (ex) { setError(ex instanceof Error ? ex.message : t("profilePasswordChangeError", "Password change failed.")); }
    finally { setBusy(""); }
  }

  if (loading) return <PageSkeleton variant="detail" label={t("profileLoading", "Loading profile")} />;
  if (!profile) return <DataState kind="error" title={t("profileUnavailable", "Profile unavailable")} description={error} onRetry={() => void load()} />;

  const initials = profile.user.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "?";
  const dirty = form.fullName !== profile.user.fullName || form.email !== profile.user.email || form.username !== (profile.user.username ?? "") || form.phone !== (profile.user.phone ?? "");
  const matches = password.newPassword === password.confirmPassword;
  const strong = rules.every(([, test]) => test(password.newPassword));

  return <div className="ip-page pf-page">
    <PageHeader eyebrow={t("profileEyebrow", "Account").toUpperCase()} title={t("profileTitle", "My profile")} description={t("profileDescription", "Update your own contact and sign-in details. Administrative fields stay locked to protect access control.")} />
    <ToastMessage kind="error" title={t("profileActionError", "Action could not be completed")} message={error} onClear={() => setError("")} />
    <ToastMessage kind="success" message={notice} onClear={() => setNotice("")} />

    <section className="pf-hero">
      <div className="pf-avatar-wrap"><span className="pf-avatar is-static" aria-hidden="true"><span>{initials}</span></span></div>
      <div className="pf-hero-copy">
        <h2>{profile.user.fullName}</h2>
        <p>{profile.user.email}</p>
        <div className="pf-chips">
          <span className="pf-chip is-success"><FiShield aria-hidden="true" />{roleLabel(profile.user.role)}</span>
          {profile.location && <span className="pf-chip"><FiMapPin aria-hidden="true" />{locationLabel(profile.location)}</span>}
          {profile.user.employeeNumber && <span className="pf-chip"><FiBriefcase aria-hidden="true" />{profile.user.employeeNumber}</span>}
        </div>
      </div>
    </section>

    <div className="pf-grid">
      <form className="pf-card" onSubmit={event => void saveProfile(event)}>
        <header><span className="pf-card-icon" aria-hidden="true"><FiUser /></span><div><h3>{t("profileEditableDetails", "Personal details")}</h3><p>{t("profileEditableDescription", "These fields belong to your own account only.")}</p></div></header>
        <label className="pf-field"><span>{t("profileFullName", "Full name")}</span><div><FiUser aria-hidden="true" /><input value={form.fullName} onChange={event => setForm(value => ({ ...value, fullName: event.target.value }))} autoComplete="name" required /></div></label>
        <label className="pf-field"><span>{t("profileUsername", "Username")}</span><div><FiAtSign aria-hidden="true" /><input value={form.username} onChange={event => setForm(value => ({ ...value, username: event.target.value }))} autoComplete="username" minLength={3} required /></div></label>
        <label className="pf-field"><span>{t("profileEmail", "Email")}</span><div><FiMail aria-hidden="true" /><input type="email" value={form.email} onChange={event => setForm(value => ({ ...value, email: event.target.value }))} autoComplete="email" required /></div></label>
        <label className="pf-field"><span>{t("profilePhone", "Phone")} <em>optional</em></span><div><FiPhone aria-hidden="true" /><input type="tel" value={form.phone} onChange={event => setForm(value => ({ ...value, phone: event.target.value }))} autoComplete="tel" placeholder="+251 911 234 567" /></div></label>
        <footer><div className="pf-actions">
          {dirty && <button type="button" className="iv-secondary" onClick={() => setForm({ username: profile.user.username ?? "", email: profile.user.email, fullName: profile.user.fullName, phone: profile.user.phone ?? "" })}>Discard</button>}
          <button className="iv-primary" type="submit" disabled={!dirty || busy === "profile"}>{busy === "profile" ? t("profileSaving", "Saving…") : t("profileSaveChanges", "Save changes")}</button>
        </div></footer>
      </form>

      <form className="pf-card" onSubmit={event => void changePassword(event)}>
        <header><span className="pf-card-icon" aria-hidden="true"><FiKey /></span><div><h3>{t("profileChangePassword", "Password")}</h3><p>{t("profileChangePasswordDescription", "Your current password is required before a new one is saved.")}</p></div>
          <button type="button" className="pf-show" onClick={() => setShow(value => !value)} aria-pressed={show}>{show ? <FiEyeOff aria-hidden="true" /> : <FiEye aria-hidden="true" />}{show ? "Hide" : "Show"}</button></header>
        <label className="pf-field"><span>{t("profileCurrentPassword", "Current password")}</span><div><FiLock aria-hidden="true" /><input type={show ? "text" : "password"} value={password.currentPassword} onChange={event => setPassword(value => ({ ...value, currentPassword: event.target.value }))} autoComplete="current-password" required /></div></label>
        <label className="pf-field"><span>{t("profileNewPassword", "New password")}</span><div><FiLock aria-hidden="true" /><input type={show ? "text" : "password"} value={password.newPassword} onChange={event => setPassword(value => ({ ...value, newPassword: event.target.value }))} autoComplete="new-password" required /></div></label>
        <ul className="pf-rules" aria-label="Password requirements">{rules.map(([label, test]) => <li key={label} className={test(password.newPassword) ? "is-met" : ""}><FiCheck aria-hidden="true" />{label}</li>)}</ul>
        <label className="pf-field"><span>{t("profileConfirmPassword", "Confirm new password")}</span><div className={password.confirmPassword && !matches ? "is-invalid" : ""}><FiLock aria-hidden="true" /><input type={show ? "text" : "password"} value={password.confirmPassword} onChange={event => setPassword(value => ({ ...value, confirmPassword: event.target.value }))} autoComplete="new-password" required /></div>
          {password.confirmPassword && !matches && <small className="is-error">The passwords do not match.</small>}</label>
        <footer><div className="pf-actions"><button className="iv-primary" type="submit" disabled={busy === "password" || !password.currentPassword || !strong || !matches}>{busy === "password" ? t("profileChanging", "Changing…") : t("profileChangePassword", "Change password")}</button></div></footer>
      </form>
    </div>

    <section className="pf-card pf-business">
      <header><span className="pf-card-icon" aria-hidden="true"><FiLock /></span><div><h3>{t("profileLockedInformation", "Role & assignment")}</h3><p>{t("profileLockedDescription", "These fields are controlled by system or customs administrators.")}</p></div></header>
      <dl className="pf-facts">
        <div><dt>{t("profileRole", "Role")}</dt><dd>{roleLabel(profile.user.role)}</dd></div>
        <div><dt>{t("profileEmployeeNumber", "Employee number")}</dt><dd>{profile.user.employeeNumber || t("profileNotRecorded", "Not recorded")}</dd></div>
        <div><dt>{t("profileAssignedLocations", "Assigned customs location")}</dt><dd>{profile.location ? locationLabel(profile.location) : t("profileNoLocationAssignment", "No active location assignment")}</dd></div>
      </dl>
    </section>
  </div>;
}
