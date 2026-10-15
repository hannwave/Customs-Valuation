"use client";

import { useState, type ReactNode } from "react";
import { FiAlertTriangle, FiArrowRight, FiCheck, FiCheckCircle, FiClock, FiFileText, FiImage, FiMapPin, FiXCircle } from "react-icons/fi";
import { ImporterDocumentPreview } from "@/components/ImporterDocumentPreview";
import { ImporterVerificationForm } from "@/components/ImporterVerificationForm";
import { usePortal } from "@/components/importer/ImporterShell";
import { PageHeader, shortDate } from "@/components/importer/PortalParts";
import { PageSkeleton } from "@/components/PageSkeleton";
import { documentLabels, idTypeLabels, importerTypes, residencyLabels, verificationLabels, type ImporterProfile } from "@/lib/importer";

type Fact = [string, ReactNode];

/** Licence validity as a small badge: fine, expiring within 60 days, or expired. */
function Validity({ date }: { date: string | null | undefined }) {
  if (!date) return null;
  const days = Math.floor((new Date(date).getTime() - Date.now()) / 86_400_000);
  const tone = days < 0 ? "danger" : days <= 60 ? "warning" : "success";
  return <span className={`vd-badge is-${tone}`}>{days < 0 ? "Expired" : days <= 60 ? `Expires in ${days} days` : `Valid to ${shortDate(date)}`}</span>;
}

function statusCopy(profile: ImporterProfile) {
  const region = profile.regionName ?? "your region";
  switch (profile.verificationStatus) {
    case "VERIFIED": return { tone: "success", icon: <FiCheckCircle />, text: `You can submit declarations.${profile.reviewedAt ? ` Verified on ${shortDate(profile.reviewedAt)}.` : ""}` };
    case "PENDING": return { tone: "info", icon: <FiClock />, text: `Customs Officers in ${region} are reviewing your documents. Reviews usually take one to three working days.` };
    case "INFORMATION_REQUESTED": return { tone: "warning", icon: <FiAlertTriangle />, text: "An officer needs more information before verifying your account." };
    case "SUSPENDED": return { tone: "danger", icon: <FiAlertTriangle />, text: `Your account is suspended. Contact a customs branch office in ${region}.` };
    default: return { tone: "danger", icon: <FiXCircle />, text: `Your application was not approved. Contact the customs branch office in ${region} if you think this is a mistake.` };
  }
}

export default function ImporterAccountPage() {
  const { profile, setProfile, account } = usePortal();
  const [updating, setUpdating] = useState(false);
  const header = <PageHeader eyebrow="ACCOUNT" title="Verification & documents" description="Where your importer verification stands, the details you registered and the documents on file." />;
  if (profile === undefined) return <PageSkeleton variant="detail" label="Loading your verification" />;
  if (profile === null || (updating && profile.verificationStatus === "INFORMATION_REQUESTED")) return <div className="ip-page">{header}
    <div className="iv-card">{profile === null && <div className="iv-callout"><strong>Verify your importer account</strong><p>A Customs Officer in your region must verify who you are before you can submit declarations. This takes about 10 minutes with your documents ready.</p></div>}
      <ImporterVerificationForm mode="verify" existing={profile ?? undefined} onSubmitted={saved => { setProfile(saved); setUpdating(false); }} /></div></div>;

  const status = profile.verificationStatus;
  const copy = statusCopy(profile);
  const stages = [
    { label: "Submitted", detail: shortDate(profile.submittedAt), done: true },
    { label: "Officer review", detail: status === "PENDING" ? "In progress" : profile.reviewedAt ? shortDate(profile.reviewedAt) : "", done: status !== "PENDING" },
    { label: status === "REJECTED" ? "Not approved" : "Verified", detail: status === "VERIFIED" ? "Active" : "", done: status === "VERIFIED" },
  ];
  const business = profile.importerType === "BUSINESS", agent = profile.importerType === "CUSTOMS_AGENT";
  const groups: { title: string; facts: Fact[] }[] = [
    { title: business ? "Business" : agent ? "Customs agent" : "Importer", facts: [
      ["Registered as", importerTypes.find(type => type.value === profile.importerType)?.title ?? profile.importerType],
      [profile.importerType === "INDIVIDUAL" ? "Full name" : "Registered name", profile.legalName],
      ["TIN", profile.tin || "Not provided"],
      ...(business ? [["Trade licence", <span key="tl" className="vd-inline">{profile.tradeLicenseNumber}<Validity date={profile.tradeLicenseExpiry} /></span>], ["Commercial registration", profile.businessRegistrationNumber], ["VAT number", profile.vatNumber || "Not registered"]] as Fact[] : []),
      ...(agent ? [["Agent licence", <span key="al" className="vd-inline">{profile.agentLicenseNumber}<Validity date={profile.agentLicenseExpiry} /></span>]] as Fact[] : []),
    ] },
    { title: "Identity", facts: [
      ["Identity document", idTypeLabels[profile.idType] ?? profile.idType], ["Document number", profile.idNumber],
      ...(profile.residencyStatus ? [["Residency", residencyLabels[profile.residencyStatus] ?? profile.residencyStatus]] as Fact[] : []),
    ] },
    { title: "Contact", facts: [
      ["Account email", account?.email ?? "—"], ["Phone", profile.phone || "—"],
      ["Address", [profile.addressLine, profile.woreda, profile.city].filter(Boolean).join(", ") || "—"],
    ] },
  ];

  return <div className="ip-page vd-page">{header}
    <section className={`vd-status is-${copy.tone}`} aria-label="Verification status">
      <div className="vd-status-main">
        <span className="vd-status-icon" aria-hidden="true">{copy.icon}</span>
        <div><p className="vd-kicker">Importer verification</p><h2>{verificationLabels[status]}</h2><p>{copy.text}</p></div>
      </div>
      <ol className="vd-steps" aria-label="Verification progress">{stages.map(stage => <li key={stage.label} className={stage.done ? "is-done" : ""}>
        <span aria-hidden="true">{stage.done ? <FiCheck /> : null}</span><div><strong>{stage.label}</strong>{stage.detail && <small>{stage.detail}</small>}</div></li>)}</ol>
      <div className="vd-status-meta"><span><FiMapPin aria-hidden="true" />{profile.regionName ?? "Region not set"}</span><span><FiFileText aria-hidden="true" />{profile.documents.length} documents</span></div>
      {(status === "INFORMATION_REQUESTED" || status === "REJECTED" || status === "SUSPENDED") && profile.reviewNote && <blockquote className="vd-note"><strong>Officer note</strong>{profile.reviewNote}</blockquote>}
      {status === "INFORMATION_REQUESTED" && <button type="button" className="iv-primary vd-update" onClick={() => setUpdating(true)}>Update my application<FiArrowRight aria-hidden="true" /></button>}
    </section>

    <div className="vd-grid">
      <section className="vd-card" aria-labelledby="vd-details-title">
        <header><h3 id="vd-details-title">Registration details</h3><small>Submitted {shortDate(profile.submittedAt)}</small></header>
        {groups.map(group => <div key={group.title} className="vd-group"><h4>{group.title}</h4>
          <dl>{group.facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>)}
      </section>

      <section className="vd-card" aria-labelledby="vd-docs-title">
        <header><h3 id="vd-docs-title">Documents</h3><span className="vd-count">{profile.documents.length}</span></header>
        {profile.documents.length ? <ul className="vd-docs">{profile.documents.map(document => {
          const label = documentLabels[document.kind]?.label ?? document.kind;
          const image = document.contentType?.startsWith("image/");
          return <li key={document.kind}>
            <span className={`vd-doc-icon${image ? " is-image" : ""}`} aria-hidden="true">{image ? <FiImage /> : <FiFileText />}<em>{image ? "IMG" : "PDF"}</em></span>
            <div className="vd-doc-copy"><strong>{label}</strong><small title={document.fileName}>{document.fileName}</small><small>Uploaded {shortDate(document.uploadedAt)}</small></div>
            <ImporterDocumentPreview path={`/importer-profile/documents/${document.kind}`} kind={document.kind} label={label} contentType={document.contentType} fileName={document.fileName} />
          </li>;
        })}</ul> : <p className="vd-empty">No documents on file.</p>}
        <p className="vd-hint">Documents can be replaced when an officer asks for more information.</p>
      </section>
    </div>
  </div>;
}
