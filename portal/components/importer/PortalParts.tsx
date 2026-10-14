"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { FiAlertTriangle, FiArrowRight, FiClock, FiXCircle } from "react-icons/fi";
import { declarationStatus, verificationLabels, type ImporterProfile } from "@/lib/importer";

export const shortDate = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

export function DeclarationPill({ status }: { status: string }) {
  const meta = declarationStatus[status] ?? { label: status.replaceAll("_", " ").toLowerCase(), tone: "neutral" };
  return <span className={`ip-pill is-${meta.tone}`}>{meta.label}</span>;
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description?: string; actions?: ReactNode }) {
  return <header className="ip-page-head"><div><p className="importer-eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="ip-page-actions">{actions}</div>}</header>;
}

/** Explains why declarations are locked until the importer is verified. */
export function VerificationBanner({ profile }: { profile: ImporterProfile | null | undefined }) {
  if (profile === undefined || profile?.verificationStatus === "VERIFIED") return null;
  const status = profile?.verificationStatus;
  const tone = status === "REJECTED" || status === "SUSPENDED" ? "is-danger" : status === "PENDING" ? "is-info" : "is-warning";
  const Icon = status === "PENDING" ? FiClock : status === "REJECTED" ? FiXCircle : FiAlertTriangle;
  const message = !profile ? ["Verify your importer account", "Upload your licences and identity document so a Customs Officer in your region can verify you. Declarations unlock after verification."]
    : status === "PENDING" ? ["Verification in progress", `Customs Officers in ${profile.regionName ?? "your region"} are reviewing your documents. You can submit declarations once you are verified.`]
    : status === "INFORMATION_REQUESTED" ? ["An officer needs more information", profile.reviewNote || "Update your verification application."]
    : status === "SUSPENDED" ? ["Your importer account is suspended", profile.reviewNote || "Contact your regional customs office."]
    : ["Verification was not approved", profile.reviewNote || "Contact your regional customs office."];
  return <div className={`ip-banner ${tone}`}><Icon aria-hidden="true" /><div><strong>{message[0]}</strong><p>{message[1]}</p></div>
    {(!profile || status === "INFORMATION_REQUESTED") && <Link className="ip-banner-action" href="/importer/account">{!profile ? "Start verification" : "Update application"}<FiArrowRight aria-hidden="true" /></Link>}
    {profile && status !== "INFORMATION_REQUESTED" && <Link className="ip-banner-link" href="/importer/account">{verificationLabels[profile.verificationStatus]} · details</Link>}
  </div>;
}

export function StatCard({ label, value, tone, href, hint }: { label: string; value: number | string; tone: string; href?: string; hint?: string }) {
  const body = <><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</>;
  return href ? <Link href={href} className={`ip-stat is-${tone}`}>{body}</Link> : <div className={`ip-stat is-${tone}`}>{body}</div>;
}
