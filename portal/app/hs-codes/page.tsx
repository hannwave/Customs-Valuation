"use client";

import { useEffect, useMemo, useState } from "react";
import { FiChevronDown, FiChevronRight, FiEdit3, FiFolder, FiPlus, FiSearch, FiX } from "react-icons/fi";
import { getSessionAccessToken } from "@/lib/auth/session";
import { workspaceApi, type WorkspaceProfile } from "@/lib/workspace";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080";
type HsCode = { id: string; code: string; name: string; duty: string | null; unit: string; sourceReference: string };
type Item = { code: string; name: string; hsCodes: HsCode[] };
type Chapter = { code: string; name: string; tariffItemCount: number; tariffItems: Item[] };
type Section = { code: string; name: string; chapters: Chapter[] };
type Line = { id: string; code: string; descriptionEn: string; descriptionAm: string | null; unit: string; duty: string; sourceReference: string; effectiveDate: string; endDate: string | null };
type Detail = { id: string; revisionId: string; code: string; descriptionEn: string; descriptionAm: string | null; tariffLines: Line[] };
type Revision = { id: string; name: string; number: number; effectiveDate: string; endDate: string | null; status: string };
type FormState = { revisionId: string; code: string; descriptionEn: string; descriptionAm: string; tariffItemNo: string; tariffDescription: string; unit: string; duty: string; sourceReference: string; effectiveDate: string; officialLetter: File | null };
const emptyForm: FormState = { revisionId: "", code: "", descriptionEn: "", descriptionAm: "", tariffItemNo: "", tariffDescription: "", unit: "", duty: "", sourceReference: "", effectiveDate: new Date().toISOString().slice(0, 10), officialLetter: null };

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${apiBase}${path}`, { ...init, headers: { Authorization: `Bearer ${getSessionAccessToken() ?? ""}`, "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message ?? body.title ?? "The HS catalogue request failed."); }
  return response.status === 204 ? null : response.json();
}

function normalizeCode(value: string) { return value.replace(/\D/g, ""); }
function normalizeText(value: string) { return value.trim().replace(/\s+/g, " ").toLocaleLowerCase(); }
async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  return btoa(binary);
}

function Branch({ label, meta, open, onToggle, children, className = "", showChevron = true }: { label: string; meta?: string; open: boolean; onToggle: () => void; children?: React.ReactNode; className?: string; showChevron?: boolean }) {
  return <div className={`hs-tree-branch ${className}`}><button type="button" className="hs-tree-row" aria-expanded={showChevron ? open : undefined} onClick={onToggle}>{showChevron ? (open ? <FiChevronDown /> : <FiChevronRight />) : <span className="hs-tree-row-spacer" aria-hidden="true" />}<span className="hs-tree-row-copy"><strong>{label}</strong>{meta && <small>{meta}</small>}</span></button>{open && children}</div>;
}

export default function HsCodesPage() {
  const [sections, setSections] = useState<Section[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadingChapters, setLoadingChapters] = useState<Record<string, boolean>>({});
  const [loadedChapters, setLoadedChapters] = useState<Record<string, boolean>>({});
  const [canManage, setCanManage] = useState(false);

  async function loadTree(search = query) {
    setLoading(true); setError("");
    try {
      const term = search.trim();
      const [tree, rows, matches] = await Promise.all([
        request(`/api/hs-catalogue/tree?summary=true${term ? `&search=${encodeURIComponent(term)}` : ""}`),
        request("/api/hs-revisions"),
        term ? request(`/api/hs-codes?search=${encodeURIComponent(term)}&pageSize=100`) : Promise.resolve(null)
      ]);
      const nextSections = tree.sections ?? [];
      setSections(nextSections); setRevisions(rows ?? []);

      // An exact HS code or description should take the user directly to its
      // record. Partial/common searches intentionally remain at section level.
      const candidates = Array.isArray(matches?.items) ? matches.items : [];
      const exact = candidates.find((item: { code?: string; descriptionEn?: string }) =>
        normalizeCode(item.code ?? "") === normalizeCode(term) && normalizeCode(term).length >= 6
        || normalizeText(item.descriptionEn ?? "") === normalizeText(term));
      if (exact) {
        const chapterCode = normalizeCode(exact.code ?? "").slice(0, 2);
        const section = nextSections.find((candidate: Section) => candidate.chapters.some(chapter => chapter.code === chapterCode));
        if (section && chapterCode) {
          setExpanded(current => ({ ...current, [`s-${section.code}`]: true, [`c-${chapterCode}`]: true }));
          const chapterRows = await request(`/api/hs-catalogue/chapters/${chapterCode}?search=${encodeURIComponent(term)}`);
          const items = (Array.isArray(chapterRows) ? chapterRows : [])
            .map(item => ({ ...item, code: String(item.code ?? "").replace(/\D/g, "").slice(0, 8) }))
            .filter(item => item.code.length === 8)
            .filter((item, index, all) => all.findIndex(candidate => candidate.code === item.code) === index);
          setSections(current => current.map(candidate => ({
            ...candidate,
            chapters: candidate.chapters.map(chapter => chapter.code === chapterCode
              ? { ...chapter, tariffItems: items, tariffItemCount: items.length }
              : chapter)
          })));
          setLoadedChapters(current => ({ ...current, [chapterCode]: true }));
          const selectedItem = items.find(item => item.hsCodes?.some((code: HsCode) => code.id === exact.id));
          setSelectedId(selectedItem?.hsCodes?.find((code: HsCode) => code.id === exact.id)?.id ?? exact.id);
        }
      }
    } catch (ex) { setError(ex instanceof Error ? ex.message : "Unable to load the HS catalogue."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadTree(""); }, []);
  useEffect(() => {
    void workspaceApi<WorkspaceProfile>("/me")
      .then(profile => setCanManage(profile.user.role === "SystemAdministrator"))
      .catch(() => setCanManage(false));
  }, []);
  useEffect(() => { if (!selectedId) { setDetail(null); return; } void request(`/api/hs-codes/${selectedId}/detail`).then(setDetail).catch(ex => setError(ex instanceof Error ? ex.message : "Unable to load HS code details.")); }, [selectedId]);
  const selectedRevision = useMemo(() => revisions.find(item => item.id === detail?.revisionId), [detail, revisions]);
  const toggle = (key: string) => setExpanded(current => ({ ...current, [key]: !current[key] }));
  async function toggleChapter(chapterCode: string) {
    toggle(`c-${chapterCode}`);
    if (loadedChapters[chapterCode] || loadingChapters[chapterCode]) return;
    setLoadingChapters(current => ({ ...current, [chapterCode]: true }));
    try {
      const rows = await request(`/api/hs-catalogue/chapters/${chapterCode}`);
      const items = (Array.isArray(rows) ? rows : []).map(item => ({ ...item, code: String(item.code ?? "").replace(/\D/g, "").slice(0, 8) })).filter(item => item.code.length === 8).filter((item, index, all) => all.findIndex(candidate => candidate.code === item.code) === index);
      setSections(current => current.map(section => ({ ...section, chapters: section.chapters.map(chapter => chapter.code === chapterCode ? { ...chapter, tariffItems: items, tariffItemCount: items.length } : chapter) })));
      setLoadedChapters(current => ({ ...current, [chapterCode]: true }));
    } catch (ex) { setError(ex instanceof Error ? ex.message : "Unable to load this chapter."); }
    finally { setLoadingChapters(current => ({ ...current, [chapterCode]: false })); }
  }
  const updateForm = (key: keyof FormState, value: string) => setForm(current => ({ ...current, [key]: value }));
  function openCreate() { setForm({ ...emptyForm, revisionId: revisions[0]?.id ?? "" }); setModal("create"); }
  function openEdit() { if (!detail) return; const line = detail.tariffLines[0]; setForm({ revisionId: detail.revisionId, code: detail.code, descriptionEn: detail.descriptionEn, descriptionAm: detail.descriptionAm ?? "", tariffItemNo: line?.code ?? detail.code, tariffDescription: line?.descriptionEn ?? detail.descriptionEn, unit: line?.unit ?? "", duty: line?.duty ?? "", sourceReference: line?.sourceReference ?? "", effectiveDate: line?.effectiveDate ?? emptyForm.effectiveDate, officialLetter: null }); setModal("edit"); }
  async function save(event: React.FormEvent) { event.preventDefault(); setSaving(true); setError(""); try { if (!form.officialLetter) throw new Error("Upload the official supporting letter before saving."); const response = await request(modal === "edit" ? `/api/hs-codes/${detail?.id}` : "/api/hs-codes", { method: modal === "edit" ? "PUT" : "POST", body: JSON.stringify({ ...form, officialLetter: undefined, officialLetterFileName: form.officialLetter.name, officialLetterContentType: form.officialLetter.type, officialLetterBase64: await fileToBase64(form.officialLetter), descriptionAm: form.descriptionAm || null }) }); const id = detail?.id ?? response?.id; setModal(null); await loadTree(); if (id) setSelectedId(id); } catch (ex) { setError(ex instanceof Error ? ex.message : "Unable to save HS code."); } finally { setSaving(false); } }

  const renderTree = () => sections.map(section => <Branch key={section.code} label={`Section ${section.code}`} meta={section.name} open={!!expanded[`s-${section.code}`]} onToggle={() => toggle(`s-${section.code}`)} className="hs-tree-section"><div className="hs-tree-children">{section.chapters.map(chapter => <Branch key={chapter.code} label={`Chapter ${chapter.code}`} meta={`${chapter.name} · ${chapter.tariffItemCount || ""} tariff items`} open={!!expanded[`c-${chapter.code}`]} onToggle={() => void toggleChapter(chapter.code)} className="hs-tree-chapter"><div className="hs-tree-children">{loadingChapters[chapter.code] ? <div className="hs-catalogue-loading">Loading chapter…</div> : chapter.tariffItems.map(item => { const duty = item.hsCodes[0]?.duty?.trim() || "Duty —"; return <Branch key={`${chapter.code}-${item.code}`} label={`${duty}  ·  Tariff item no. ${item.code}`} meta={item.name} open={false} showChevron={false} onToggle={() => setSelectedId(item.hsCodes[0]?.id ?? null)} className="hs-tree-tariff" />; })}</div></Branch>)}</div></Branch>);

  return <main className="hs-catalogue-page">
    <header className="hs-catalogue-hero"><div><span className="hs-catalogue-eyebrow">Tariff reference</span><h1>HS catalogue</h1><p>Navigate the tariff book from Section to Chapter, Tariff Item, and the complete HS code record.</p></div>{canManage && <button type="button" className="hs-catalogue-primary" onClick={openCreate}><FiPlus /> Create HS code</button>}</header>
    <div className="hs-catalogue-toolbar"><div className="hs-catalogue-search"><FiSearch /><input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void loadTree(); }} placeholder="Search code or description" /><button type="button" onClick={() => void loadTree()}>Search</button>{query && <button type="button" className="hs-clear-search" onClick={() => { setQuery(""); void loadTree(""); }}><FiX /></button>}</div><span>{sections.reduce((sum, section) => sum + section.chapters.length, 0)} chapters · browse the current revision structure</span></div>
    {error && <div className="hs-catalogue-error">{error}</div>}
    <section className="hs-catalogue-layout"><div className="hs-tree-panel"><div className="hs-panel-heading"><div><span>Catalogue structure</span><h2>Tariff book</h2></div><span className="hs-count-badge">{sections.length} sections</span></div>{loading ? <div className="hs-catalogue-loading">Loading catalogue structure…</div> : sections.length === 0 ? <div className="hs-catalogue-empty">No matching tariff records found.</div> : <div className="hs-tree-list">{renderTree()}</div>}</div>
      <aside className="hs-detail-panel">{detail ? <><div className="hs-detail-top"><div><span className="hs-detail-eyebrow">HS code record</span><h2>{detail.code}</h2><p>{detail.descriptionEn}</p></div>{canManage && <button type="button" className="hs-icon-button" onClick={openEdit} title="Edit HS code"><FiEdit3 /></button>}</div><div className="hs-detail-breadcrumb">HS code <b>›</b> {selectedRevision?.name ?? "Revision"}</div>{detail.descriptionAm && <div className="hs-detail-description"><span>Amharic description</span><p>{detail.descriptionAm}</p></div>}<div className="hs-detail-section-title"><div><span>Connected tariff data</span><h3>Tariff items and duty</h3></div><small>{detail.tariffLines.length} record{detail.tariffLines.length === 1 ? "" : "s"}</small></div>{detail.tariffLines.length === 0 ? <div className="hs-detail-empty">No tariff item is connected to this HS code yet.</div> : <div className="hs-line-list">{detail.tariffLines.map(line => <article className="hs-line-card" key={line.id}><div className="hs-line-card-head"><strong>{line.code}</strong><span>{line.effectiveDate}</span></div><p>{line.descriptionEn}</p><div className="hs-line-facts"><span><small>Duty</small><b>{line.duty || "Not set"}</b></span><span><small>Standard unit</small><b>{line.unit || "Not set"}</b></span><span><small>Source reference</small><b>{line.sourceReference || "Not recorded"}</b></span></div></article>)}</div>}</> : <div className="hs-detail-placeholder"><div className="hs-placeholder-icon"><FiFolder /></div><h2>Select an HS code</h2><p>Open a Section, Chapter, and Tariff Item, then select an HS code to inspect its duty, unit, and source reference.</p></div>}</aside>
    </section>
    {canManage && modal && <div className="hs-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setModal(null); }}><form className="hs-editor-modal" onSubmit={save}><div className="hs-editor-head"><div><span>{modal === "edit" ? "Update record" : "New record"}</span><h2>{modal === "edit" ? "Edit HS code" : "Create HS code"}</h2></div><button type="button" className="hs-icon-button" onClick={() => setModal(null)}><FiX /></button></div><div className="hs-editor-grid"><label>HS revision<select required value={form.revisionId} onChange={event => updateForm("revisionId", event.target.value)}><option value="">Select revision</option>{revisions.map(revision => <option key={revision.id} value={revision.id}>{revision.name}</option>)}</select></label><label>HS code<input required pattern="[0-9]{6}" maxLength={6} value={form.code} onChange={event => updateForm("code", event.target.value.replace(/\D/g, ""))} placeholder="e.g. 851713" /></label><label className="hs-editor-wide">HS description<input required value={form.descriptionEn} onChange={event => updateForm("descriptionEn", event.target.value)} /></label><label>Amharic description<input value={form.descriptionAm} onChange={event => updateForm("descriptionAm", event.target.value)} /></label><label>Tariff item number<input value={form.tariffItemNo} onChange={event => updateForm("tariffItemNo", event.target.value)} placeholder="e.g. 85171300" /></label><label className="hs-editor-wide">Tariff item description<input value={form.tariffDescription} onChange={event => updateForm("tariffDescription", event.target.value)} /></label><label>Standard unit<input value={form.unit} onChange={event => updateForm("unit", event.target.value)} placeholder="e.g. kg, litre, number" /></label><label>Duty rate<input value={form.duty} onChange={event => updateForm("duty", event.target.value)} placeholder="e.g. 10%" /></label><label>Effective date<input type="date" required value={form.effectiveDate} onChange={event => updateForm("effectiveDate", event.target.value)} /></label><label className="hs-editor-wide">Official supporting letter<input type="file" required accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.bmp,.webp,.tif,.tiff,.svg,.heic,.heif,.avif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*" onChange={event => setForm(current => ({ ...current, officialLetter: event.target.files?.[0] ?? null }))} /><small>Required on create and edit. Documents or images up to 10 MB.</small></label><label className="hs-editor-wide">Source reference<input value={form.sourceReference} onChange={event => updateForm("sourceReference", event.target.value)} placeholder="Tariff book, gazette, or official source" /></label></div><div className="hs-editor-actions"><button type="button" className="hs-secondary-button" onClick={() => setModal(null)}>Cancel</button><button type="submit" className="hs-catalogue-primary" disabled={saving}>{saving ? "Saving…" : modal === "edit" ? "Save changes" : "Create HS code"}</button></div></form></div>}
  </main>;
}
