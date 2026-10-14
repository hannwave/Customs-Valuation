"use client";

import Link from "next/link";
import { useState } from "react";
import { FiAlertTriangle, FiArrowRight, FiCheck, FiCheckCircle, FiClock, FiFileText, FiLogIn, FiMapPin, FiUserPlus, FiXCircle } from "react-icons/fi";
import { ImporterSplitLayout } from "@/components/ImporterSplitLayout";
import { documentLabels, documentsByType, importerTypes, verificationLabels, type ImporterProfile, type ImporterType } from "@/lib/importer";

const processSteps = [
  { title: "Register and upload documents", body: "Choose business, individual or customs agent and upload the matching licences and ID." },
  { title: "An officer in your region verifies you", body: "They check your TIN, licence validity and identity against the documents." },
  { title: "Submit import declarations", body: "Once verified, describe your goods and attach trade documents for classification and assessment." },
];

/** Public entry point for importers who are not signed in. */
export function ImporterLanding() {
  const [type, setType] = useState<ImporterType>("BUSINESS");
  const docs = documentsByType[type];
  return <ImporterSplitLayout kicker="IMPORTER PORTAL" title={<>Bring your goods in<br /><span>the right way.</span></>}
    body="Register as a verified importer, then declare imported goods and documents online before an officer starts classification and assessment."
    aside={<ol className="iv-hero-steps">{processSteps.map((step, index) => <li key={step.title}><span>{index + 1}</span><div><strong>{step.title}</strong><p>{step.body}</p></div></li>)}</ol>}>
    <div className="iv-landing">
      <div className="iv-landing-head"><h2>Welcome</h2><p>Sign in to continue, or create an account to start verification.</p></div>
      <div className="iv-landing-actions">
        <Link className="iv-action is-primary" href="/login?next=%2Fimporter"><FiLogIn aria-hidden="true" /><span><strong>Sign in</strong><small>I already have an importer account</small></span><FiArrowRight aria-hidden="true" /></Link>
        <Link className="iv-action" href="/importer/register"><FiUserPlus aria-hidden="true" /><span><strong>Create importer account</strong><small>Takes about 10 minutes with documents ready</small></span><FiArrowRight aria-hidden="true" /></Link>
      </div>
      <section className="iv-requirements" aria-labelledby="iv-requirements-title">
        <h3 id="iv-requirements-title">What you will need</h3>
        <div className="iv-tabs" role="tablist" aria-label="Importer type">
          {importerTypes.map(item => <button key={item.value} type="button" role="tab" aria-selected={type === item.value} className={type === item.value ? "is-active" : ""} onClick={() => setType(item.value)}>{item.title}</button>)}
        </div>
        <p className="iv-muted">{importerTypes.find(item => item.value === type)?.summary}</p>
        <ul className="iv-checklist">
          {docs.required.map(kind => <li key={kind}><FiCheck aria-hidden="true" /><span><strong>{documentLabels[kind].label}</strong><small>{documentLabels[kind].hint}</small></span></li>)}
          {docs.optional.map(kind => <li key={kind} className="is-optional"><FiFileText aria-hidden="true" /><span><strong>{documentLabels[kind].label} <em>if applicable</em></strong><small>{documentLabels[kind].hint}</small></span></li>)}
        </ul>
      </section>
      <aside className="iv-note"><FiClock aria-hidden="true" /><p><strong>Shipment timing.</strong> Average shipment time is about 7 days; allow up to 10–15 days. Use this as a planning estimate; actual timing may vary.</p></aside>
    </div>
  </ImporterSplitLayout>;
}

/** Shows where a submitted verification stands. */
export function VerificationStatusPanel({ profile, onEdit }: { profile: ImporterProfile; onEdit?: () => void }) {
  const status = profile.verificationStatus;
  const icon = status === "REJECTED" ? <FiXCircle /> : status === "INFORMATION_REQUESTED" || status === "SUSPENDED" ? <FiAlertTriangle /> : status === "VERIFIED" ? <FiCheckCircle /> : <FiClock />;
  const stages = [
    { label: "Application submitted", done: true, detail: new Date(profile.submittedAt).toLocaleString() },
    { label: "Officer review", done: status !== "PENDING", detail: status === "PENDING" ? `With Customs Officers in ${profile.regionName ?? "your region"}` : profile.reviewedAt ? new Date(profile.reviewedAt).toLocaleString() : "" },
    { label: "Verified importer", done: status === "VERIFIED", detail: status === "VERIFIED" ? "You can submit declarations" : "" },
  ];
  return <section className={`iv-status is-${status.toLowerCase().replaceAll("_", "-")}`}>
    <div className="iv-status-head"><span className="iv-status-icon" aria-hidden="true">{icon}</span><div><p className="iv-kicker">IMPORTER VERIFICATION</p><h2>{verificationLabels[status]}</h2></div></div>
    {status === "PENDING" && <p>Thank you. Your application is with Customs Officers in <strong>{profile.regionName ?? "your region"}</strong>. You will be able to submit declarations once they verify your details. Reviews usually take one to three working days.</p>}
    {status === "INFORMATION_REQUESTED" && <><p>An officer needs more information before verifying your account.</p><blockquote>{profile.reviewNote}</blockquote>{onEdit && <button type="button" className="iv-primary" onClick={onEdit}>Update my application<FiArrowRight aria-hidden="true" /></button>}</>}
    {status === "SUSPENDED" && <><p>Your importer account has been suspended. You cannot submit new declarations until a Customs Officer reinstates it.</p>{profile.reviewNote && <blockquote>{profile.reviewNote}</blockquote>}<p>Contact a customs branch office in {profile.regionName ?? "your region"} to resolve the issue.</p></>}
    {status === "REJECTED" && <><p>Your application was not approved.</p>{profile.reviewNote && <blockquote>{profile.reviewNote}</blockquote>}<p>If you believe this is a mistake, contact the customs branch office in {profile.regionName ?? "your region"} with your documents.</p></>}
    <ol className="iv-timeline">{stages.map(stage => <li key={stage.label} className={stage.done ? "is-done" : ""}><span aria-hidden="true">{stage.done ? <FiCheck /> : ""}</span><div><strong>{stage.label}</strong>{stage.detail && <small>{stage.detail}</small>}</div></li>)}</ol>
    <dl className="iv-summary is-compact">
      <div><dt>Registered as</dt><dd>{importerTypes.find(item => item.value === profile.importerType)?.title}</dd></div>
      <div><dt>Name</dt><dd>{profile.legalName}</dd></div>
      <div><dt><FiMapPin aria-hidden="true" /> Region</dt><dd>{profile.regionName ?? "—"} · {profile.city}</dd></div>
      <div><dt>Documents</dt><dd>{profile.documents.length} uploaded</dd></div>
    </dl>
  </section>;
}
