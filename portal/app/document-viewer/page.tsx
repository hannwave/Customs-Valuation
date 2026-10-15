"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FiAlertTriangle, FiDownload, FiFile, FiFileText, FiImage, FiMaximize, FiMinimize2, FiRotateCw, FiX, FiZoomIn, FiZoomOut } from "react-icons/fi";
import { downloadDocument, fetchDocumentBlob } from "@/components/ImporterDocumentPreview";
import { ThemeToggle } from "@/components/ThemeToggle";

// Documents are only fetched from the Customs API's document endpoints.
const allowedSources = /^\/((importer-declarations\/[0-9a-f-]{36}\/documents|importer-verifications\/[0-9a-f-]{36}\/documents|importer-profile\/documents)\/[A-Z_]+|(importer-verifications|importer-profile)\/change-requests\/[0-9a-f-]{36}\/document)$/i;
const zoomSteps = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

function Viewer() {
  const params = useSearchParams();
  const src = params.get("src") ?? "";
  const name = params.get("name") || "Document";
  const declaredType = params.get("type") ?? "";
  const [url, setUrl] = useState("");
  const [type, setType] = useState(declaredType);
  const [size, setSize] = useState(0);
  const [error, setError] = useState("");
  const [fit, setFit] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const isImage = type.startsWith("image/");
  const isPdf = type === "application/pdf";

  useEffect(() => { document.title = `${name} · Document viewer`; }, [name]);
  useEffect(() => {
    if (!allowedSources.test(src)) { setError("This document link is not valid."); return; }
    let objectUrl = "";
    fetchDocumentBlob(src)
      .then(blob => { objectUrl = URL.createObjectURL(blob); setType(blob.type || declaredType); setSize(blob.size); setUrl(objectUrl); })
      .catch(reason => setError(reason instanceof Error ? reason.message : "The document could not be opened."));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src, declaredType]);

  const step = useCallback((direction: 1 | -1) => {
    setFit(false);
    setZoom(current => { const index = zoomSteps.findIndex(value => value >= current - 0.001); const next = Math.min(Math.max((index < 0 ? zoomSteps.length - 1 : index) + direction, 0), zoomSteps.length - 1); return zoomSteps[next]; });
  }, []);
  const close = useCallback(() => { if (window.opener || window.history.length <= 1) window.close(); else window.history.back(); }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key === "Escape") close();
      if (!isImage) return;
      if (event.key === "+" || event.key === "=") step(1);
      if (event.key === "-") step(-1);
      if (event.key === "0") { setFit(true); setZoom(1); }
      if (event.key.toLowerCase() === "r") setRotation(value => (value + 90) % 360);
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [close, isImage, step]);

  const TypeIcon = isImage ? FiImage : isPdf ? FiFileText : FiFile;
  const typeLabel = isImage ? type.replace("image/", "").toUpperCase() : isPdf ? "PDF" : type || "File";
  const sizeLabel = useMemo(() => size ? size >= 1_048_576 ? `${(size / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB` : "", [size]);

  return <main className="dv">
    <header className="dv-bar">
      <div className="dv-file"><span className="dv-file-icon"><TypeIcon aria-hidden="true" /></span><div><strong title={name}>{name}</strong><small>{typeLabel}{sizeLabel && ` · ${sizeLabel}`}</small></div></div>
      {isImage && url && <div className="dv-tools" role="toolbar" aria-label="Image controls">
        <button type="button" onClick={() => step(-1)} aria-label="Zoom out" title="Zoom out (−)"><FiZoomOut /></button>
        <span className="dv-zoom" aria-live="polite">{fit ? "Fit" : `${Math.round(zoom * 100)}%`}</span>
        <button type="button" onClick={() => step(1)} aria-label="Zoom in" title="Zoom in (+)"><FiZoomIn /></button>
        <span className="dv-sep" aria-hidden="true" />
        <button type="button" onClick={() => { setFit(!fit); setZoom(1); }} aria-pressed={fit} aria-label={fit ? "Actual size" : "Fit to window"} title={fit ? "Actual size" : "Fit to window (0)"}>{fit ? <FiMaximize /> : <FiMinimize2 />}</button>
        <button type="button" onClick={() => setRotation(value => (value + 90) % 360)} aria-label="Rotate" title="Rotate (R)"><FiRotateCw /></button>
      </div>}
      <div className="dv-actions">
        <button type="button" onClick={() => void downloadDocument(src, name).catch(reason => setError(String(reason)))} disabled={!url} title="Download"><FiDownload aria-hidden="true" /><span>Download</span></button>
        <ThemeToggle />
        <button type="button" className="dv-close" onClick={close} aria-label="Close viewer" title="Close (Esc)"><FiX aria-hidden="true" /></button>
      </div>
    </header>
    <section className={`dv-stage${isImage ? " is-image" : ""}`}>
      {error ? <div className="dv-message"><FiAlertTriangle aria-hidden="true" /><h1>Document unavailable</h1><p>{error}</p></div>
        : !url ? <div className="dv-message" role="status"><span className="dv-spinner" aria-hidden="true" /><p>Opening {name}…</p></div>
        : isPdf ? <iframe className="dv-pdf" src={url} title={name} />
        : isImage ? <div className={`dv-canvas${fit ? " is-fit" : ""}`}><img src={url} alt={name} style={{ transform: `rotate(${rotation}deg)${fit ? "" : ` scale(${zoom})`}` }} /></div>
        : <div className="dv-message"><FiFile aria-hidden="true" /><h1>Preview not available</h1><p>This file type cannot be shown in the browser. Download it to open it with another application.</p><button type="button" className="dv-download" onClick={() => void downloadDocument(src, name)}><FiDownload aria-hidden="true" />Download {name}</button></div>}
    </section>
  </main>;
}

export default function DocumentViewerPage() {
  return <Suspense fallback={<main className="dv"><div className="dv-message" role="status"><span className="dv-spinner" aria-hidden="true" /></div></main>}><Viewer /></Suspense>;
}
