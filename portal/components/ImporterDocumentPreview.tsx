"use client";

import { useEffect, useState } from "react";
import { getSessionAccessToken } from "@/lib/auth/session";
import { importerApiBase } from "@/lib/importer";

export function ImporterDocumentPreview({ declarationId, kind, label, contentType }: { declarationId: string; kind: string; label: string; contentType: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  async function open() {
    if (url) { setUrl(""); return; }
    const token = getSessionAccessToken();
    if (!token) { setError("Sign in again to view this document."); return; }
    const response = await fetch(`${importerApiBase}/importer-declarations/${declarationId}/documents/${kind}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) { setError("The document could not be opened."); return; }
    setError(""); setUrl(URL.createObjectURL(await response.blob()));
  }
  return <div className="importer-document-preview"><button type="button" onClick={() => void open()}>{url ? "Close preview" : `Preview ${label}`}</button>
    {error && <span role="alert">{error}</span>}
    {url && (contentType.startsWith("image/") ? <img src={url} alt={label} /> : <iframe src={url} title={label} />)}
  </div>;
}
