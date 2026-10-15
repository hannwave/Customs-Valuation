"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { FiArrowLeft } from "react-icons/fi";
import { DeclarationForm } from "@/components/importer/DeclarationForm";
import { usePortal } from "@/components/importer/ImporterShell";
import { PageHeader, VerificationBanner } from "@/components/importer/PortalParts";
import { PageSkeleton } from "@/components/PageSkeleton";
import { importerApi, type ImporterDeclaration } from "@/lib/importer";

function NewDeclaration() {
  const router = useRouter();
  const editId = useSearchParams().get("edit");
  const { verified, profile, reloadDeclarations } = usePortal();
  const [editing, setEditing] = useState<ImporterDeclaration | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!editId) return;
    importerApi<ImporterDeclaration>(`/importer-declarations/${editId}`)
      .then(declaration => declaration.canEdit ? setEditing(declaration) : setError(`${declaration.reference} is already being reviewed by a Customs Officer, so it can no longer be edited.`))
      .catch(reason => setError(reason instanceof Error ? reason.message : "The declaration could not be opened."));
  }, [editId]);

  const header = <PageHeader eyebrow={editing ? `${editing.status === "SUBMITTED" ? "EDIT" : "UPDATE"} ${editing.reference}` : "NEW DECLARATION"} title={editing ? editing.status === "SUBMITTED" ? "Edit your declaration" : "Respond to the officer" : "Register imported goods"}
    description="Describe the item and attach your trade documents. A Customs Officer verifies the HS mapping and any tax treatment before assessment."
    actions={<Link className="iv-secondary" href={editing ? `/importer/declarations/${editing.id}` : "/importer/declarations"}><FiArrowLeft aria-hidden="true" />Back</Link>} />

  if (profile === undefined) return <PageSkeleton variant="detail" label="Checking your verification" />;
  if (!verified) return <div className="ip-page">{header}<VerificationBanner profile={profile} /></div>;
  if (error) return <div className="ip-page">{header}<p className="iv-error" role="alert">{error}</p></div>;
  if (editId && !editing) return <PageSkeleton variant="detail" label="Loading the declaration" />;
  return <div className="ip-page">{header}
    <DeclarationForm key={editing?.id ?? "new"} editing={editing} onSaved={saved => { void reloadDeclarations(); router.push(`/importer/declarations/${saved.id}?${editing?.status === "SUBMITTED" ? "edited" : "submitted"}=1`); }} />
  </div>;
}

export default function NewDeclarationPage() {
  return <Suspense fallback={<PageSkeleton variant="detail" label="Loading form" />}><NewDeclaration /></Suspense>;
}
