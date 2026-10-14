"use client";

import { useEffect, useState } from "react";
import { FiDownload, FiExternalLink, FiEye, FiEyeOff, FiX } from "react-icons/fi";
import { getSessionAccessToken } from "@/lib/auth/session";
import { importerApiBase } from "@/lib/importer";

/** Link to the full-page document viewer for an API document path. */
export function documentViewerHref(path: string, name: string, contentType: string) {
  return `/document-viewer?${new URLSearchParams({ src: path, name, type: contentType })}`;
}

export async function fetchDocumentBlob(path: string) {
  const token = getSessionAccessToken();
  if (!token) throw new Error("Sign in again to view this document.");
  const response = await fetch(`${importerApiBase}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401) throw new Error("Your session expired. Sign in again to view this document.");
  if (!response.ok) throw new Error("The document could not be opened.");
  return response.blob();
}

export async function downloadDocument(path: string, fileName: string) {
  const url = URL.createObjectURL(await fetchDocumentBlob(path));
  const link = Object.assign(document.createElement("a"), { href: url, download: fileName });
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Icon actions for one uploaded document: inline preview, open in a new tab, download. */
export function ImporterDocumentPreview({ declarationId, path, kind, label, contentType, fileName }: {
  declarationId?: string; path?: string; kind: string; label: string; contentType: string; fileName?: string;
}) {
  const source = path ?? `/importer-declarations/${declarationId}/documents/${kind}`;
  const name = fileName || label;
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  async function toggle() {
    if (url) { setUrl(""); return; }
    setLoading(true); setError("");
    try { setUrl(URL.createObjectURL(await fetchDocumentBlob(source))); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The document could not be opened."); }
    finally { setLoading(false); }
  }
  async function download() {
    setError("");
    try { await downloadDocument(source, name); } catch (reason) { setError(reason instanceof Error ? reason.message : "Download failed."); }
  }

  return <div className="doc-preview">
    <div className="doc-preview-actions" role="group" aria-label={`${label} actions`}>
      <button type="button" className={url ? "is-active" : ""} onClick={() => void toggle()} disabled={loading} aria-pressed={!!url} title={url ? "Hide preview" : "Preview"} aria-label={`${url ? "Hide preview of" : "Preview"} ${label}`}>
        {url ? <FiEyeOff aria-hidden="true" /> : <FiEye aria-hidden="true" />}</button>
      <a href={documentViewerHref(source, name, contentType)} target="_blank" rel="noopener" title="Open in new tab" aria-label={`Open ${label} in a new tab`}><FiExternalLink aria-hidden="true" /></a>
      <button type="button" onClick={() => void download()} title="Download" aria-label={`Download ${label}`}><FiDownload aria-hidden="true" /></button>
    </div>
    {loading && <span className="doc-preview-status" role="status">Loading…</span>}
    {error && <span className="doc-preview-status is-error" role="alert">{error}</span>}
    {url && <figure className="doc-preview-frame">
      <figcaption><span>{label}</span><button type="button" onClick={() => setUrl("")} aria-label={`Close preview of ${label}`} title="Close preview"><FiX aria-hidden="true" /></button></figcaption>
      {contentType.startsWith("image/") ? <img src={url} alt={label} /> : <iframe src={url} title={label} />}
    </figure>}
  </div>;
}
