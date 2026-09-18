"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiBriefcase, FiKey, FiLock, FiMail, FiMapPin, FiPhone, FiSave, FiShield, FiUser } from "react-icons/fi";
import { DataState } from "@/components/DataState";
import { locationLabel, roleLabel, workspaceApi, type SelfProfile } from "@/lib/workspace";

type ProfileForm = { username: string; email: string; fullName: string; phone: string };
type PasswordForm = { currentPassword: string; newPassword: string; confirmPassword: string };

const emptyProfile: ProfileForm = { username: "", email: "", fullName: "", phone: "" };
const emptyPassword: PasswordForm = { currentPassword: "", newPassword: "", confirmPassword: "" };

export default function ProfilePage() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<SelfProfile | null>(null);
  const [form, setForm] = useState<ProfileForm>(emptyProfile);
  const [password, setPassword] = useState<PasswordForm>(emptyPassword);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const current = await workspaceApi<SelfProfile>("/profile");
      setProfile(current);
      setForm({ username: current.user.username, email: current.user.email, fullName: current.user.fullName, phone: current.user.phone ?? "" });
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

  if (loading) return <DataState kind="loading" title={t("profileLoading", "Loading profile")} description={t("profileLoadingDescription", "Opening your account details.")} />;
  if (!profile) return <DataState kind="error" title={t("profileUnavailable", "Profile unavailable")} description={error} onRetry={() => void load()} />;

  return <div className="profile-page">
    <div className="page-heading">
      <div><p className="eyebrow">{t("profileEyebrow", "Account")}</p><h1>{t("profileTitle", "My profile")}</h1><p className="lead">{t("profileDescription", "Update your own contact and sign-in details. Administrative fields stay locked to protect access control.")}</p></div>
      <span className="workspace-tag"><FiShield />{roleLabel(profile.user.role)}</span>
    </div>
    {error && <DataState kind="error" compact title={t("profileActionError", "Action could not be completed")} description={error} onRetry={() => void load()} />}
    {notice && <p className="management-notice" role="status">{notice}</p>}

    <div className="profile-grid">
      <section className="admin-panel profile-panel">
        <div className="panel-heading"><div><h2>{t("profileEditableDetails", "Editable details")}</h2><p>{t("profileEditableDescription", "These fields belong to your own account only.")}</p></div><FiUser aria-hidden="true" /></div>
        <form className="management-form" onSubmit={saveProfile}>
          <label><span>{t("profileFullName", "Full name")}</span><input value={form.fullName} onChange={event => setForm(value => ({ ...value, fullName: event.target.value }))} required /></label>
          <label><span>{t("profileUsername", "Username")}</span><input value={form.username} onChange={event => setForm(value => ({ ...value, username: event.target.value }))} minLength={3} required /></label>
          <label><span>{t("profileEmail", "Email")}</span><input type="email" value={form.email} onChange={event => setForm(value => ({ ...value, email: event.target.value }))} required /></label>
          <label><span>{t("profilePhone", "Phone")}</span><input value={form.phone} onChange={event => setForm(value => ({ ...value, phone: event.target.value }))} /></label>
          <div className="form-actions"><button className="primary-button" type="submit" disabled={busy === "profile"}><FiSave />{busy === "profile" ? t("profileSaving", "Saving...") : t("profileSaveChanges", "Save changes")}</button></div>
        </form>
      </section>

      <section className="admin-panel profile-panel">
        <div className="panel-heading"><div><h2>{t("profileChangePassword", "Change password")}</h2><p>{t("profileChangePasswordDescription", "Your current password is required before a new one is saved.")}</p></div><FiKey aria-hidden="true" /></div>
        <form className="management-form" onSubmit={changePassword}>
          <label className="wide-field"><span>{t("profileCurrentPassword", "Current password")}</span><input type="password" value={password.currentPassword} onChange={event => setPassword(value => ({ ...value, currentPassword: event.target.value }))} autoComplete="current-password" required /></label>
          <label><span>{t("profileNewPassword", "New password")}</span><input type="password" value={password.newPassword} onChange={event => setPassword(value => ({ ...value, newPassword: event.target.value }))} autoComplete="new-password" required /></label>
          <label><span>{t("profileConfirmPassword", "Confirm new password")}</span><input type="password" value={password.confirmPassword} onChange={event => setPassword(value => ({ ...value, confirmPassword: event.target.value }))} autoComplete="new-password" required /></label>
          <div className="password-requirements wide-field"><FiLock /><p>{t("profilePasswordRequirements", "Use at least 8 characters with uppercase, lowercase, number and symbol.")}</p></div>
          <div className="form-actions"><button className="primary-button" type="submit" disabled={busy === "password"}><FiKey />{busy === "password" ? t("profileChanging", "Changing...") : t("profileChangePassword", "Change password")}</button></div>
        </form>
      </section>
    </div>

    <section className="admin-panel profile-panel">
      <div className="panel-heading"><div><h2>{t("profileLockedInformation", "Locked account information")}</h2><p>{t("profileLockedDescription", "These fields are controlled by system or customs administrators.")}</p></div><FiLock aria-hidden="true" /></div>
      <div className="locked-grid">
        <div className="locked-field"><FiShield /><span>{t("profileRole", "Role")}</span><strong>{roleLabel(profile.user.role)}</strong></div>
        <div className="locked-field"><FiBriefcase /><span>{t("profileEmployeeNumber", "Employee number")}</span><strong>{profile.user.employeeNumber || t("profileNotRecorded", "Not recorded")}</strong></div>
      </div>
      <div className="assignment-lock-list">
        <h3><FiMapPin /> {t("profileAssignedLocations", "Assigned customs locations")}</h3>
        {profile.assignments.length === 0 ? <DataState kind="empty" compact title={t("profileNoLocationAssignment", "No active location assignment")} description={t("profileLocationAssignmentDescription", "An administrator can assign customs locations from user administration.")} /> : profile.assignments.map(scope => <article key={scope.id} className="profile-locked-card">
          <strong>{scope.location ? locationLabel(scope.location) : scope.customsLocationId}</strong>
          <span>{scope.includeChildLocations ? t("profileIncludesChildLocations", "Includes child locations") : t("profileExactLocationOnly", "Exact location only")}</span>
          <small>{scope.responsibilities || t("profileResponsibilitiesNotRecorded", "Responsibilities not recorded")}</small>
        </article>)}
      </div>
    </section>
  </div>;
}
