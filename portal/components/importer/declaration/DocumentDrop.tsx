"use client";

import { useEffect, useRef, useState } from "react";
import { FiCheckCircle, FiFileText, FiImage, FiTrash2, FiUploadCloud } from "react-icons/fi";
import { ImporterDocumentPreview } from "@/components/ImporterDocumentPreview";
import { ToastMessage } from "@/components/Toaster";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ["application/pdf", "image/jpeg", "image/png"];
const ACCEPTED_EXTENSIONS = /\.(pdf|jpe?g|png)$/i;

export type SavedDocument = { fileName: string; contentType: string };

function size(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Checks a chosen file against the upload rules; returns the reason it is refused, or an empty string. */
export function documentProblem(file: File) {
  if (!ACCEPTED.includes(file.type) && !ACCEPTED_EXTENSIONS.test(file.name)) return "Use a PDF, JPG or PNG file.";
  if (file.size > MAX_BYTES) return `This file is ${size(file.size)}; the limit is 10 MB.`;
  if (file.size === 0) return "This file is empty.";
  return "";
}

/** Drag-and-drop (or click) upload for one trade document, with a preview of what was chosen. */
export function DocumentDrop({ label, hint, file, saved, declarationId, kind, onChange }: {
  label: string; hint: string; file: File | null; saved?: SavedDocument; declarationId?: string; kind: string; onChange: (file: File | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [problem, setProblem] = useState("");
  const [thumb, setThumb] = useState("");

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) { setThumb(""); return; }
    const url = URL.createObjectURL(file); setThumb(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function accept(candidate: File | undefined) {
    if (!candidate) return;
    const reason = documentProblem(candidate);
    setProblem(reason);
    if (!reason) onChange(candidate);
  }

  const done = Boolean(file || saved);
  return <div className={`ip-drop${dragging ? " is-dragging" : ""}${done ? " is-done" : ""}${problem ? " is-invalid" : ""}`}
    onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
    onDrop={event => { event.preventDefault(); setDragging(false); accept(event.dataTransfer.files?.[0]); }}>
    <div className="ip-drop-head">
      <span className="ip-drop-icon" aria-hidden="true">{done ? <FiCheckCircle /> : <FiUploadCloud />}</span>
      <div><strong>{label} <b aria-hidden="true">*</b></strong><small>{hint}</small></div>
    </div>
    {file ? <div className="ip-drop-file">
      {thumb ? <img src={thumb} alt="" /> : <span className="ip-drop-type" aria-hidden="true">{file.type.startsWith("image/") ? <FiImage /> : <FiFileText />}</span>}
      <span><strong title={file.name}>{file.name}</strong><small>{size(file.size)} · ready to upload</small></span>
      <button type="button" className="iv-icon-button" onClick={() => { onChange(null); setProblem(""); }} aria-label={`Remove ${file.name}`}><FiTrash2 aria-hidden="true" /></button>
    </div> : saved ? <div className="ip-drop-file is-saved">
      <span className="ip-drop-type" aria-hidden="true"><FiFileText /></span>
      <span><strong title={saved.fileName}>{saved.fileName}</strong><small>Already uploaded · drop a file here to replace it</small></span>
    </div> : null}
    {saved && !file && declarationId && <ImporterDocumentPreview declarationId={declarationId} kind={kind} label={label} contentType={saved.contentType} fileName={saved.fileName} />}
    <button type="button" className="ip-drop-zone" onClick={() => input.current?.click()}>
      <FiUploadCloud aria-hidden="true" /><span><strong>{done ? "Replace file" : "Drop the file here"}</strong> or click to choose · PDF, JPG or PNG up to 10 MB</span>
    </button>
    <input ref={input} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={event => { accept(event.target.files?.[0]); event.target.value = ""; }} />
    <ToastMessage kind="error" message={problem} onClear={() => setProblem("")} />
  </div>;
}
