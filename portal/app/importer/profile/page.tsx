"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { FiArrowRight, FiCamera, FiCheck, FiCheckCircle, FiEye, FiEyeOff, FiKey, FiLoader, FiLock, FiMail, FiPhone, FiShield, FiTrash2, FiUser } from "react-icons/fi";
import { usePortal } from "@/components/importer/ImporterShell";
import { PageHeader, shortDate } from "@/components/importer/PortalParts";
import { PageSkeleton } from "@/components/PageSkeleton";
import { IdentityChangeDialog, IdentityChangeStatus } from "@/components/importer/IdentityChange";
import { changeImporterPassword, getMyChangeRequests, importerTypes, type IdentityChange, removeImporterPhoto, updateImporterAccount, uploadImporterPhoto, verificationLabels } from "@/lib/importer";
import { toast } from "@/lib/toast";

const MAX_PHOTO = 3 * 1024 * 1024;
const rules: [string, (value: string) => boolean][] = [
  ["At least 8 characters", value => value.length >= 8], ["An uppercase letter", value => /[A-Z]/.test(value)], ["A lowercase letter", value => /[a-z]/.test(value)],
  ["A number", value => /[0-9]/.test(value)], ["A symbol", value => /[^A-Za-z0-9]/.test(value)],
];

export default function ImporterProfilePage() {
  const { account, accountDetails, photoUrl, setAccountDetails, reloadPhoto, profile } = usePortal();
  const fileInput = useRef<HTMLInputElement>(null);
  const [details, setDetails] = useState({ fullName: "", email: "", phone: "" });
  const [detailsBusy, setDetailsBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState<"" | "upload" | "remove">("");
  const [password, setPassword] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [show, setShow] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [requests, setRequests] = useState<IdentityChange[]>([]);
  const [changing, setChanging] = useState(false);
  useEffect(() => { void getMyChangeRequests().then(setRequests).catch(() => setRequests([])); }, []);

  useEffect(() => { if (accountDetails) setDetails({ fullName: accountDetails.fullName, email: accountDetails.email, phone: accountDetails.phone }); }, [accountDetails]);

  if (!accountDetails) return <PageSkeleton variant="detail" label="Loading your profile" />;
  const dirty = details.fullName.trim() !== accountDetails.fullName || details.email.trim().toLowerCase() !== accountDetails.email || details.phone.trim() !== accountDetails.phone;
  const initials = (accountDetails.fullName || account?.fullName || "I").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  const strong = rules.every(([, test]) => test(password.newPassword));
  const matches = password.confirmPassword.length > 0 && password.newPassword === password.confirmPassword;
  const status = profile?.verificationStatus;
  // After verification the name is part of the checked identity: it changes only through an approved request.
  const nameLocked = Boolean(profile);
  const latest = requests[0];
  const pending = latest?.status === "PENDING";
  const showLatest = latest && (pending || (latest.reviewedAt && Date.now() - new Date(latest.reviewedAt).getTime() < 30 * 86_400_000));

  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    setDetailsBusy(true);
    try { setAccountDetails(await updateImporterAccount({ fullName: details.fullName.trim(), email: details.email.trim(), phone: details.phone.trim() })); toast.success("Your details are saved."); }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : "Your details could not be saved."); }
    finally { setDetailsBusy(false); }
  }

  async function choosePhoto(file: File | undefined) {
    if (!file) return;
   
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { toast.error("Choose a JPG, PNG or WebP picture."); return; }
    if (file.size > MAX_PHOTO) { toast.error("The picture must be 3 MB or smaller."); return; }
    setPhotoBusy("upload");
    try {
      const result = await uploadImporterPhoto(file);
      setAccountDetails({ ...accountDetails!, hasPhoto: true, photoUpdatedAt: result.photoUpdatedAt });
      await reloadPhoto(); toast.success("Profile picture updated.");
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "The picture could not be uploaded."); }
    finally { setPhotoBusy(""); if (fileInput.current) fileInput.current.value = ""; }
  }

  async function removePhoto() {
    setPhotoBusy("remove");
    try { await removeImporterPhoto(); setAccountDetails({ ...accountDetails!, hasPhoto: false, photoUpdatedAt: null }); await reloadPhoto(); toast.success("Profile picture removed."); }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : "The picture could not be removed."); }
    finally { setPhotoBusy(""); }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    if (!strong || !matches) return;
    setPasswordBusy(true);
    try { await changeImporterPassword(password); setPassword({ currentPassword: "", newPassword: "", confirmPassword: "" }); toast.success("Password changed. Use it the next time you sign in."); }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : "The password could not be changed."); }
    finally { setPasswordBusy(false); }
  }

  return <div className="ip-page pf-page">
    <PageHeader eyebrow="ACCOUNT" title="My profile" description="Your picture, contact details and password. Business and identity details are part of your verification." />

    <section className="pf-hero">
      <div className="pf-avatar-wrap">
        <button type="button" className="pf-avatar" onClick={() => fileInput.current?.click()} disabled={Boolean(photoBusy)} aria-label="Change profile picture">
          {photoUrl ? <img src={photoUrl} alt="" /> : <span>{initials}</span>}
          <i aria-hidden="true">{photoBusy === "upload" ? <FiLoader className="pf-spin" /> : <FiCamera />}</i>
        </button>
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => void choosePhoto(event.target.files?.[0])} />
      </div>
      <div className="pf-hero-copy">
        <h2>{accountDetails.fullName}</h2>
        <p>{accountDetails.email}</p>
        <div className="pf-chips">
          <span className="pf-chip"><FiUser aria-hidden="true" />{profile ? importerTypes.find(type => type.value === profile.importerType)?.title ?? "Importer" : "Importer"}</span>
          {status && <span className={`pf-chip is-${status === "VERIFIED" ? "success" : status === "REJECTED" || status === "SUSPENDED" ? "danger" : "warning"}`}><FiShield aria-hidden="true" />{verificationLabels[status]}</span>}
          <span className="pf-chip">Member since {shortDate(accountDetails.createdAt)}</span>
        </div>
      </div>
      <div className="pf-hero-actions">
        <button type="button" className="iv-secondary" onClick={() => fileInput.current?.click()} disabled={Boolean(photoBusy)}><FiCamera aria-hidden="true" />{accountDetails.hasPhoto ? "Change picture" : "Upload picture"}</button>
        {accountDetails.hasPhoto && <button type="button" className="pf-text-danger" onClick={() => void removePhoto()} disabled={Boolean(photoBusy)}><FiTrash2 aria-hidden="true" />{photoBusy === "remove" ? "Removing…" : "Remove"}</button>}
        <small>JPG, PNG or WebP, up to 3 MB.</small>
      </div>
    </section>

    {showLatest && <IdentityChangeStatus request={latest} onChange={updated => setRequests(current => current.map(item => item.id === updated.id ? updated : item))} />}
    {changing && <IdentityChangeDialog hasProfile={Boolean(profile)} current={{ fullName: accountDetails.fullName, legalName: profile?.legalName ?? "", tin: profile?.tin ?? "" }}
      onClose={() => setChanging(false)} onSent={request => { setRequests(current => [request, ...current]); setChanging(false); }} />}

    <div className="pf-grid">
      <form className="pf-card" onSubmit={event => void saveDetails(event)} noValidate>
        <header><span className="pf-card-icon" aria-hidden="true"><FiUser /></span><div><h3>Personal details</h3><p>How Customs Officers see and contact you.</p></div></header>
        <label className="pf-field"><span>Full name{nameLocked && <em className="pf-verified"><FiLock aria-hidden="true" /> verified</em>}</span><div className={nameLocked ? "is-locked" : ""}><FiUser aria-hidden="true" /><input value={details.fullName} onChange={event => setDetails({ ...details, fullName: event.target.value })} autoComplete="name" maxLength={200} required readOnly={nameLocked} aria-readonly={nameLocked} />
          {nameLocked && <button type="button" className="pf-inline-action" onClick={() => setChanging(true)} disabled={pending}>{pending ? "Change pending" : "Request a change"}</button>}</div>
          {nameLocked && <small>Your name was checked during verification. A Customs Officer approves any change.</small>}</label>
        <label className="pf-field"><span>Email</span><div><FiMail aria-hidden="true" /><input type="email" value={details.email} onChange={event => setDetails({ ...details, email: event.target.value })} autoComplete="email" maxLength={200} required /></div><small>Notices and sign-in use this address.</small></label>
        <label className="pf-field"><span>Phone <em>optional</em></span><div><FiPhone aria-hidden="true" /><input type="tel" value={details.phone} onChange={event => setDetails({ ...details, phone: event.target.value })} autoComplete="tel" maxLength={20} placeholder="+251 911 234 567" /></div></label>
        <footer>
          <div className="pf-actions">{dirty && <button type="button" className="iv-secondary" onClick={() => { setDetails({ fullName: accountDetails.fullName, email: accountDetails.email, phone: accountDetails.phone }); }}>Discard</button>}
            <button type="submit" className="iv-primary" disabled={!dirty || detailsBusy}>{detailsBusy ? "Saving…" : "Save changes"}</button></div></footer>
      </form>

      <form className="pf-card" onSubmit={event => void savePassword(event)} noValidate>
        <header><span className="pf-card-icon" aria-hidden="true"><FiKey /></span><div><h3>Password</h3><p>Use a strong password you do not use elsewhere.</p></div>
          <button type="button" className="pf-show" onClick={() => setShow(value => !value)} aria-pressed={show}>{show ? <FiEyeOff aria-hidden="true" /> : <FiEye aria-hidden="true" />}{show ? "Hide" : "Show"}</button></header>
        <label className="pf-field"><span>Current password</span><div><FiLock aria-hidden="true" /><input type={show ? "text" : "password"} value={password.currentPassword} onChange={event => setPassword({ ...password, currentPassword: event.target.value })} autoComplete="current-password" /></div></label>
        <label className="pf-field"><span>New password</span><div><FiLock aria-hidden="true" /><input type={show ? "text" : "password"} value={password.newPassword} onChange={event => setPassword({ ...password, newPassword: event.target.value })} autoComplete="new-password" /></div></label>
        <ul className="pf-rules" aria-label="Password requirements">{rules.map(([label, test]) => <li key={label} className={test(password.newPassword) ? "is-met" : ""}><FiCheck aria-hidden="true" />{label}</li>)}</ul>
        <label className="pf-field"><span>Confirm new password</span><div className={password.confirmPassword && !matches ? "is-invalid" : ""}><FiLock aria-hidden="true" /><input type={show ? "text" : "password"} value={password.confirmPassword} onChange={event => setPassword({ ...password, confirmPassword: event.target.value })} autoComplete="new-password" /></div>
          {password.confirmPassword && !matches && <small className="is-error">The passwords do not match.</small>}</label>
        <footer>
          <div className="pf-actions"><button type="submit" className="iv-primary" disabled={passwordBusy || !password.currentPassword || !strong || !matches}>{passwordBusy ? "Changing…" : "Change password"}</button></div></footer>
      </form>
    </div>

    <section className="pf-card pf-business">
      <header><span className="pf-card-icon" aria-hidden="true"><FiShield /></span><div><h3>Business & identity</h3><p>These come from your verification. To change your name, registered name or TIN, send a change request with a supporting document.</p></div>
        <div className="pf-business-actions">{profile && <button type="button" className="iv-secondary" onClick={() => setChanging(true)} disabled={pending}>{pending ? "Change pending" : "Request a change"}</button>}
          <Link href="/importer/account" className="pf-link">Verification & documents<FiArrowRight aria-hidden="true" /></Link></div></header>
      {profile ? <dl className="pf-facts">
        <div><dt>{profile.importerType === "INDIVIDUAL" ? "Full name" : "Registered name"}</dt><dd>{profile.legalName}</dd></div>
        <div><dt>TIN</dt><dd>{profile.tin || "Not provided"}</dd></div>
        <div><dt>Region</dt><dd>{profile.regionName ?? "—"}{profile.city ? ` · ${profile.city}` : ""}</dd></div>
        <div><dt>Username</dt><dd>{accountDetails.username}</dd></div>
        <div><dt>Last sign-in</dt><dd>{accountDetails.lastLoginAt ? new Date(accountDetails.lastLoginAt).toLocaleString() : "—"}</dd></div>
        <div><dt>Documents on file</dt><dd>{profile.documents.length}</dd></div>
      </dl> : <p className="pf-muted">You have not submitted your verification yet. <Link href="/importer/account">Start verification</Link></p>}
    </section>
  </div>;
}
