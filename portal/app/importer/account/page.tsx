"use client";

import { useState } from "react";
import { FiFileText } from "react-icons/fi";
import { ImporterDocumentPreview } from "@/components/ImporterDocumentPreview";
import { VerificationStatusPanel } from "@/components/ImporterOnboarding";
import { ImporterVerificationForm } from "@/components/ImporterVerificationForm";
import { usePortal } from "@/components/importer/ImporterShell";
import { PageHeader, shortDate } from "@/components/importer/PortalParts";
import { documentLabels, idTypeLabels, importerTypes, residencyLabels } from "@/lib/importer";

export default function ImporterAccountPage() {
  const { profile, setProfile, account } = usePortal();
  const [updating, setUpdating] = useState(false);
  const header = <PageHeader eyebrow="ACCOUNT" title="Verification & documents" description="Your importer registration, the documents on file and where your verification stands." />;
  if (profile === undefined) return <div className="ip-page">{header}<p className="ip-empty">Loading your verification…</p></div>;
  if (profile === null || (updating && profile.verificationStatus === "INFORMATION_REQUESTED")) return <div className="ip-page">{header}
    <div className="iv-card">{profile === null && <div className="iv-callout"><strong>Verify your importer account</strong><p>A Customs Officer in your region must verify who you are before you can submit declarations. This takes about 10 minutes with your documents ready.</p></div>}
      <ImporterVerificationForm mode="verify" existing={profile ?? undefined} onSubmitted={saved => { setProfile(saved); setUpdating(false); }} /></div></div>;

  const facts: [string, string][] = [
    ["Registered as", importerTypes.find(type => type.value === profile.importerType)?.title ?? profile.importerType],
    [profile.importerType === "INDIVIDUAL" ? "Full name" : "Registered name", profile.legalName], ["Account email", account?.email ?? "—"], ["TIN", profile.tin || "Not provided"],
    ...(profile.importerType === "BUSINESS" ? [["Trade licence", `${profile.tradeLicenseNumber} · valid to ${shortDate(profile.tradeLicenseExpiry)}`], ["Commercial registration", profile.businessRegistrationNumber], ["VAT number", profile.vatNumber || "—"]] as [string, string][] : []),
    ...(profile.importerType === "CUSTOMS_AGENT" ? [["Agent licence", `${profile.agentLicenseNumber} · valid to ${shortDate(profile.agentLicenseExpiry)}`]] as [string, string][] : []),
    ...(profile.residencyStatus ? [["Residency", residencyLabels[profile.residencyStatus] ?? profile.residencyStatus]] as [string, string][] : []),
    ["Identity document", `${idTypeLabels[profile.idType] ?? profile.idType} · ${profile.idNumber}`], ["Phone", profile.phone],
    ["Address", [profile.addressLine, profile.woreda, profile.city, profile.regionName].filter(Boolean).join(", ")],
  ];
  return <div className="ip-page">{header}
    <div className="ip-detail-grid">
      <VerificationStatusPanel profile={profile} onEdit={() => setUpdating(true)} />
      <div className="ip-side">
        <section className="ip-card"><header className="ip-card-head"><h2>Registration details</h2></header>
          <dl className="iv-detail-grid is-single">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
        <section className="ip-card"><header className="ip-card-head"><h2>Documents on file</h2></header>
          <ul className="iv-doc-list">{profile.documents.map(document => <li key={document.kind}>
            <div><strong><FiFileText aria-hidden="true" /> {documentLabels[document.kind]?.label ?? document.kind}</strong><small>{document.fileName} · uploaded {shortDate(document.uploadedAt)}</small></div>
            <ImporterDocumentPreview path={`/importer-profile/documents/${document.kind}`} kind={document.kind} label={documentLabels[document.kind]?.label ?? document.kind} contentType={document.contentType} fileName={document.fileName} />
          </li>)}</ul></section>
      </div>
    </div>
  </div>;
}
