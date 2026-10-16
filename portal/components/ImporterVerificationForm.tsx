"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { FiArrowLeft, FiArrowRight, FiBriefcase, FiCheck, FiEye, FiEyeOff, FiFileText, FiUploadCloud, FiUser, FiUserCheck } from "react-icons/fi";
import { countries } from "country-flag-icons";
import {
  documentFieldNames, documentLabels, documentsByType, idTypeLabels, importerApi, importerApiBase, importerTypes, residencyLabels,
  type ImporterDocumentKind, type ImporterProfile, type ImporterRegion, type ImporterType,
} from "@/lib/importer";
import { idNumberHint, idNumberMaxLength, idNumberProblem, phoneHint, phoneMaxLength, phoneProblem, restrictIdNumber, restrictPhone, restrictTin, tinProblem } from "@/lib/importer-validation";
import { ToastMessage } from "@/components/Toaster";
import { citiesFor, findCity, joinWoreda, OTHER_TOWN, splitWoreda } from "@/lib/ethiopia-places";

type Mode = "register" | "verify";
type Draft = {
  importerType: ImporterType | ""; fullName: string; email: string; password: string; confirmPassword: string;
  legalName: string; tradeName: string; tin: string; tradeLicenseNumber: string; tradeLicenseExpiry: string;
  businessRegistrationNumber: string; vatNumber: string; agentLicenseNumber: string; agentLicenseExpiry: string;
  idType: string; idNumber: string; nationality: string; residencyStatus: string; representativeRole: string;
  phone: string; regionLocationId: string; city: string; woreda: string; addressLine: string; declarationAccepted: boolean;
};

const typeIcons: Record<ImporterType, ReactNode> = { BUSINESS: <FiBriefcase />, INDIVIDUAL: <FiUser />, CUSTOMS_AGENT: <FiUserCheck /> };
const passwordRule = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const digits = (value: string) => value.replace(/\D/g, "");
const today = () => new Date().toISOString().slice(0, 10);

function fromProfile(profile?: ImporterProfile): Draft {
  return {
    importerType: profile?.importerType ?? "", fullName: "", email: "", password: "", confirmPassword: "",
    legalName: profile?.importerType === "INDIVIDUAL" ? "" : profile?.legalName ?? "", tradeName: profile?.tradeName ?? "", tin: profile?.tin ?? "",
    tradeLicenseNumber: profile?.tradeLicenseNumber ?? "", tradeLicenseExpiry: profile?.tradeLicenseExpiry ?? "",
    businessRegistrationNumber: profile?.businessRegistrationNumber ?? "", vatNumber: profile?.vatNumber ?? "",
    agentLicenseNumber: profile?.agentLicenseNumber ?? "", agentLicenseExpiry: profile?.agentLicenseExpiry ?? "",
    idType: profile?.idType ?? "FAYDA", idNumber: profile?.idNumber ?? "", nationality: profile?.nationality ?? "ET",
    residencyStatus: profile?.residencyStatus ?? "", representativeRole: profile?.representativeRole ?? "", phone: profile?.phone ?? "",
    regionLocationId: profile?.regionLocationId ?? "", city: profile?.city ?? "", woreda: profile?.woreda ?? "", addressLine: profile?.addressLine ?? "",
    declarationAccepted: false,
  };
}

function Field({ label, hint, error, required, wide, children }: { label: string; hint?: string; error?: string; required?: boolean; wide?: boolean; children: ReactNode }) {
  return <label className={`iv-field${wide ? " is-wide" : ""}${error ? " has-error" : ""}`}><span>{label}{required && <b aria-hidden="true"> *</b>}</span>{children}
    {error ? <small className="iv-field-error" role="alert">{error}</small> : hint && <small>{hint}</small>}</label>;
}

function PasswordInput({ value, onChange, autoComplete, label }: { value: string; onChange: (value: string) => void; autoComplete: string; label: string }) {
  const [visible, setVisible] = useState(false);
  return <span className="iv-password"><input type={visible ? "text" : "password"} value={value} autoComplete={autoComplete} maxLength={128} onChange={event => onChange(event.target.value)} />
    <button type="button" aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible(current => !current)}>{visible ? <FiEyeOff aria-hidden="true" /> : <FiEye aria-hidden="true" />}</button></span>;
}

const restrictors: Partial<Record<keyof Draft, (value: string, draft: Draft) => string>> = {
  tin: value => restrictTin(value), phone: value => restrictPhone(value), idNumber: (value, draft) => restrictIdNumber(draft.idType, value),
};

export function ImporterVerificationForm({ mode, existing, onRegistered, onSubmitted }: {
  mode: Mode; existing?: ImporterProfile;
  onRegistered?: (accessToken: string) => void; onSubmitted?: (profile: ImporterProfile) => void;
}) {
  const steps = ["Importer type", "Identity", "Contact and location", "Documents", mode === "register" ? "Account and submit" : "Review and submit"];
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => fromProfile(existing));
  const [files, setFiles] = useState<Partial<Record<ImporterDocumentKind, File>>>({});
  const [regions, setRegions] = useState<ImporterRegion[]>([]);
  const [regionError, setRegionError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<keyof Draft, boolean>>>({});
  const [attempted, setAttempted] = useState<number[]>([]);

  useEffect(() => {
    fetch(`${importerApiBase}/auth/importer-regions`)
      .then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<ImporterRegion[]>; })
      .then(setRegions).catch(() => setRegionError("Regions could not be loaded. Refresh the page to try again."));
  }, []);

  const nationalities = useMemo(() => {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    return countries.filter(code => /^[A-Z]{2}$/.test(code)).map(code => ({ code, name: names.of(code) ?? code }))
      .filter(item => item.name !== item.code).sort((a, b) => a.code === "ET" ? -1 : b.code === "ET" ? 1 : a.name.localeCompare(b.name));
  }, []);

  const regionCode = regions.find(region => region.id === draft.regionLocationId)?.officialCode;
  const cities = citiesFor(regionCode);
  const cityEntry = findCity(regionCode, draft.city);
  const [otherTown, setOtherTown] = useState(false);
  const typedTown = otherTown || (!!draft.city && regions.length > 0 && !cityEntry);
  const { subCity, woreda: woredaOnly } = splitWoreda(cityEntry, draft.woreda);
  const woredaOptions = cityEntry?.subCities ? cityEntry.subCities.find(item => item.name === subCity)?.woredas ?? [] : cityEntry?.woredas ?? [];
  const chooseRegion = (id: string) => { setOtherTown(false); setDraft(current => ({ ...current, regionLocationId: id, city: "", woreda: "" })); setError(""); };
  const chooseCity = (value: string) => {
    if (value === OTHER_TOWN) { setOtherTown(true); setDraft(current => ({ ...current, city: "", woreda: "" })); }
    else { setOtherTown(false); setDraft(current => ({ ...current, city: value, woreda: "" })); }
    setError("");
  };
  const type = draft.importerType || null;
  const docs = type ? documentsByType[type] : { required: [], optional: [] };
  const uploaded = (kind: ImporterDocumentKind) => existing?.importerType === type ? existing?.documents.find(d => d.kind === kind) : undefined;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => { setDraft(current => ({ ...current, [key]: value })); setError(""); };
  const formatErrors: Partial<Record<keyof Draft, string>> = {
    tin: tinProblem(draft.tin, type !== null && type !== "INDIVIDUAL"),
    phone: phoneProblem(draft.phone),
    idNumber: idNumberProblem(draft.idType, draft.idNumber),
  };
  const fieldError = (key: keyof Draft) => touched[key] || attempted.includes(step) ? formatErrors[key] || undefined : undefined;
  const input = (key: keyof Draft, props: React.InputHTMLAttributes<HTMLInputElement> = {}) =>
    <input value={String(draft[key])} aria-invalid={fieldError(key) ? true : undefined}
      onChange={event => set(key, (restrictors[key]?.(event.target.value, draft) ?? event.target.value) as never)}
      onBlur={() => setTouched(current => ({ ...current, [key]: true }))} {...props} />;

  function problem(index: number): string {
    if (index === 0 && !type) return "Choose how you are registering.";
    if (index === 1 && type) {
      if (mode === "register" && draft.fullName.trim().length < 2) return "Enter your full name as it appears on your identity document.";
      if (type !== "INDIVIDUAL" && draft.legalName.trim().length < 2) return type === "BUSINESS" ? "Enter the registered business name." : "Enter the agency or agent name.";
      if (formatErrors.tin) return formatErrors.tin;
      if (type === "BUSINESS") {
        if (draft.tradeLicenseNumber.trim().length < 3) return "Enter the trade licence number.";
        if (!draft.tradeLicenseExpiry || draft.tradeLicenseExpiry < today()) return "The trade licence must be renewed and not yet expired.";
        if (draft.businessRegistrationNumber.trim().length < 3) return "Enter the commercial registration number.";
        if (draft.representativeRole.trim().length < 2) return "Enter your role in the business.";
      }
      if (type === "CUSTOMS_AGENT") {
        if (draft.agentLicenseNumber.trim().length < 3) return "Enter the customs agent licence number.";
        if (!draft.agentLicenseExpiry || draft.agentLicenseExpiry < today()) return "The customs agent licence must be valid and not yet expired.";
      }
      if (type === "INDIVIDUAL" && !draft.residencyStatus) return "Choose your residency status.";
      if (formatErrors.idNumber) return formatErrors.idNumber;
    }
    if (index === 2) {
      if (formatErrors.phone) return formatErrors.phone;
      if (!draft.regionLocationId) return "Choose your region. Officers in that region will verify your account.";
      if (draft.city.trim().length < 2) return typedTown ? "Enter the city or town." : "Choose the city or town.";
      if (cityEntry?.subCities && !subCity) return "Choose the sub-city.";
      if (cityEntry && (cityEntry.subCities || cityEntry.woredas) && !woredaOnly) return cityEntry.subCities ? "Choose the woreda." : "Choose the kebele.";
    }
    if (index === 3) {
      const missing = docs.required.filter(kind => !files[kind] && !uploaded(kind));
      if (missing.length) return `Upload: ${missing.map(kind => documentLabels[kind].label).join(", ")}.`;
    }
    if (index === 4) {
      if (mode === "register") {
        if (!/^\S+@\S+\.\S+$/.test(draft.email.trim())) return "Enter a valid email address.";
        if (!passwordRule.test(draft.password)) return "Use eight or more characters with uppercase, lowercase, a number and a symbol.";
        if (draft.password !== draft.confirmPassword) return "The passwords do not match.";
      }
      if (!draft.declarationAccepted) return "Confirm the declaration before submitting.";
    }
    return "";
  }

  function next() {
    const message = problem(step);
    if (message) { setAttempted(current => [...current, step]); setError(message); return; }
    setStep(value => Math.min(value + 1, steps.length - 1));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < steps.length - 1) { next(); return; }
    for (let index = 0; index < steps.length; index++) { const message = problem(index); if (message) { setStep(index); setError(message); return; } }
    const form = new FormData();
    const { fullName, email, password, confirmPassword, declarationAccepted, ...profile } = draft;
    Object.entries(profile).forEach(([key, value]) => { if (value) form.set(key, String(value)); });
    form.set("declarationAccepted", String(declarationAccepted));
    if (existing) form.set("expectedVersion", existing.version);
    for (const [kind, file] of Object.entries(files) as [ImporterDocumentKind, File][]) if (file && [...docs.required, ...docs.optional].includes(kind)) form.set(documentFieldNames[kind], file);
    setBusy(true); setError("");
    try {
      if (mode === "register") {
        form.set("fullName", fullName.trim()); form.set("email", email.trim()); form.set("password", password); form.set("confirmPassword", confirmPassword);
        const response = await fetch(`${importerApiBase}/auth/register-importer`, { method: "POST", body: form });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message ?? "Registration could not be completed.");
        onRegistered?.(body.accessToken);
      } else {
        onSubmitted?.(await importerApi<ImporterProfile>("/importer-profile", { method: "PUT", body: form }));
      }
    } catch (reason) {
      setError(reason instanceof TypeError ? "Could not reach the Customs service. Check your connection and try again." : reason instanceof Error ? reason.message : "Submission failed.");
    } finally { setBusy(false); }
  }

  const regionName = regions.find(region => region.id === draft.regionLocationId)?.name;
  const summary: [string, string | undefined][] = type ? [
    ["Registering as", importerTypes.find(item => item.value === type)?.title],
    [type === "INDIVIDUAL" ? "Full name" : "Registered name", type === "INDIVIDUAL" ? (mode === "register" ? draft.fullName : "Your account name") : draft.legalName],
    ["TIN", draft.tin ? digits(draft.tin) : "Not provided"],
    ...(type === "BUSINESS" ? [["Trade licence", `${draft.tradeLicenseNumber} · valid to ${draft.tradeLicenseExpiry}`], ["Commercial registration", draft.businessRegistrationNumber]] as [string, string][] : []),
    ...(type === "CUSTOMS_AGENT" ? [["Agent licence", `${draft.agentLicenseNumber} · valid to ${draft.agentLicenseExpiry}`]] as [string, string][] : []),
    ["Identity", `${idTypeLabels[draft.idType]} · ${draft.idNumber}`],
    ["Region", regionName], ["City", [draft.city, draft.woreda].filter(Boolean).join(", ")], ["Phone", draft.phone],
  ] : [];

  return <form className="iv-form" onSubmit={submit} noValidate aria-busy={busy}>
    <ol className="iv-stepper" aria-label="Registration progress">
      {steps.map((label, index) => <li key={label} className={index === step ? "is-current" : index < step ? "is-done" : ""} aria-current={index === step ? "step" : undefined}>
        <button type="button" disabled={index > step} onClick={() => { setError(""); setStep(index); }}><span>{index < step ? <FiCheck aria-hidden="true" /> : index + 1}</span><em>{label}</em></button>
      </li>)}
    </ol>

    <div className="iv-step-head"><p className="iv-kicker">Step {step + 1} of {steps.length}</p><h2>{steps[step]}</h2></div>
    {existing?.reviewNote && existing.verificationStatus === "INFORMATION_REQUESTED" && <div className="iv-callout is-warning"><strong>Officer request</strong><p>{existing.reviewNote}</p></div>}

    {step === 0 && <div className="iv-type-grid" role="radiogroup" aria-label="Importer type">
      {importerTypes.map(item => <button type="button" role="radio" aria-checked={draft.importerType === item.value} key={item.value}
        className={`iv-type${draft.importerType === item.value ? " is-selected" : ""}`} onClick={() => set("importerType", item.value)}>
        <span className="iv-type-icon">{typeIcons[item.value]}</span><strong>{item.title}</strong><small>{item.summary}</small>
        <span className="iv-type-docs">{documentsByType[item.value].required.length} required {documentsByType[item.value].required.length === 1 ? "document" : "documents"}</span>
      </button>)}
    </div>}

    {step === 1 && type && <div className="iv-grid">
      {mode === "register" && <Field label="Your full name" hint="As it appears on your identity document." required wide>{input("fullName", { autoComplete: "name", maxLength: 200 })}</Field>}
      {type !== "INDIVIDUAL" && <>
        <Field label={type === "BUSINESS" ? "Registered business name" : "Agency or agent name"} required>{input("legalName", { maxLength: 200, autoComplete: "organization" })}</Field>
        <Field label="Trade name" hint="If different from the registered name.">{input("tradeName", { maxLength: 200 })}</Field>
      </>}
      <Field label="Taxpayer Identification Number (TIN)" error={fieldError("tin")} hint={`${draft.tin.length}/10 digits · ${type === "INDIVIDUAL" ? "Optional for personal imports." : "As shown on your TIN certificate."}`} required={type !== "INDIVIDUAL"}>{input("tin", { inputMode: "numeric", maxLength: 10, placeholder: "0012345678", autoComplete: "off" })}</Field>
      {type === "BUSINESS" && <>
        <Field label="Your role in the business" hint="For example General Manager or Import Manager." required>{input("representativeRole", { maxLength: 120 })}</Field>
        <Field label="Trade licence number" required>{input("tradeLicenseNumber", { maxLength: 60 })}</Field>
        <Field label="Trade licence valid until" hint="The licence must be renewed for the current year." required>{input("tradeLicenseExpiry", { type: "date", min: today() })}</Field>
        <Field label="Commercial registration number" required>{input("businessRegistrationNumber", { maxLength: 60 })}</Field>
        <Field label="VAT registration number" hint="If registered for VAT.">{input("vatNumber", { maxLength: 30 })}</Field>
      </>}
      {type === "CUSTOMS_AGENT" && <>
        <Field label="Your role" hint="For example Licensed agent or Agency manager.">{input("representativeRole", { maxLength: 120 })}</Field>
        <Field label="Customs agent licence number" required>{input("agentLicenseNumber", { maxLength: 60 })}</Field>
        <Field label="Agent licence valid until" required>{input("agentLicenseExpiry", { type: "date", min: today() })}</Field>
      </>}
      {type === "INDIVIDUAL" && <Field label="Residency status" required wide><select value={draft.residencyStatus} onChange={event => set("residencyStatus", event.target.value)}><option value="">Choose your status</option>{Object.entries(residencyLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></Field>}
      <div className="iv-subhead is-wide"><strong>{type === "INDIVIDUAL" ? "Your identity document" : "Identity of the person applying"}</strong><span>Officers compare this with the identity document you upload.</span></div>
      <Field label="Document type" required><select value={draft.idType} onChange={event => { const idType = event.target.value; setDraft(current => ({ ...current, idType, idNumber: restrictIdNumber(idType, current.idNumber) })); setError(""); }}>{Object.entries(idTypeLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></Field>
      <Field label="Document number" error={fieldError("idNumber")} hint={idNumberHint(draft.idType, draft.idNumber)} required>{input("idNumber", { maxLength: idNumberMaxLength(draft.idType), autoComplete: "off", inputMode: draft.idType === "FAYDA" ? "numeric" : "text", placeholder: draft.idType === "FAYDA" ? "1234 5678 9012" : draft.idType === "PASSPORT" ? "EP1234567" : "" })}</Field>
      <Field label="Nationality" required><select value={draft.nationality} onChange={event => set("nationality", event.target.value)}>{nationalities.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select></Field>
    </div>}

    {step === 2 && <div className="iv-grid">
      <Field label="Mobile phone" error={fieldError("phone")} hint={`${phoneHint(draft.phone)}Ethiopian mobile (09…, 07… or +251…) or + country code if abroad.`} required>{input("phone", { type: "tel", inputMode: "tel", autoComplete: "tel", placeholder: "+251911234567", maxLength: phoneMaxLength(draft.phone) })}</Field>
      <Field label="Region" hint="Customs Officers in this region will verify your account." required>
        <select value={draft.regionLocationId} onChange={event => chooseRegion(event.target.value)} disabled={!regions.length}>
          <option value="">{regions.length ? "Choose your region" : regionError || "Loading regions…"}</option>
          {regions.map(region => <option key={region.id} value={region.id}>{region.name}</option>)}
        </select>
      </Field>
      <Field label="City or town" hint={!draft.regionLocationId ? "Choose the region first." : undefined} required>
        <select value={typedTown ? OTHER_TOWN : draft.city} onChange={event => chooseCity(event.target.value)} disabled={!draft.regionLocationId}>
          <option value="">{draft.regionLocationId ? "Choose the city or town" : "Choose the region first"}</option>
          {cities.map(city => <option key={city.name} value={city.name}>{city.name}</option>)}
          {draft.regionLocationId && <option value={OTHER_TOWN}>Another town (type it)</option>}
        </select>
      </Field>
      {typedTown && <Field label="Town name" required>{input("city", { autoComplete: "address-level2", maxLength: 120, placeholder: "Type the city or town" })}</Field>}
      {cityEntry?.subCities && <Field label="Sub-city" required>
        <select value={subCity} onChange={event => set("woreda", joinWoreda(event.target.value, ""))}>
          <option value="">Choose the sub-city</option>
          {cityEntry.subCities.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
        </select>
      </Field>}
      {cityEntry && (cityEntry.subCities || cityEntry.woredas) && <Field label={cityEntry.subCities ? "Woreda" : "Kebele"} hint={cityEntry.subCities && !subCity ? "Choose the sub-city first." : undefined} required>
        <select value={woredaOnly} onChange={event => set("woreda", joinWoreda(subCity, event.target.value))} disabled={!woredaOptions.length}>
          <option value="">{cityEntry.subCities ? (subCity ? `Choose the woreda in ${subCity}` : "Choose the sub-city first") : "Choose the kebele"}</option>
          {woredaOptions.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </Field>}
      {(typedTown || (cityEntry && !cityEntry.subCities && !cityEntry.woredas)) && <Field label="Sub-city, woreda or kebele">{input("woreda", { maxLength: 120 })}</Field>}
      <Field label="Street address or house number" wide>{input("addressLine", { autoComplete: "street-address", maxLength: 300 })}</Field>
    </div>}

    {step === 3 && type && <div className="iv-docs">
      <p className="iv-muted">Upload clear scans or photos. PDF, JPG or PNG, up to 10 MB each.</p>
      {[...docs.required.map(kind => [kind, true] as const), ...docs.optional.map(kind => [kind, false] as const)].map(([kind, required]) => {
        const file = files[kind]; const saved = uploaded(kind);
        return <label key={kind} className={`iv-upload${file || saved ? " has-file" : ""}`}>
          <span className="iv-upload-icon">{file || saved ? <FiCheck /> : <FiUploadCloud />}</span>
          <span className="iv-upload-text"><strong>{documentLabels[kind].label}{required ? <b> *</b> : <em> optional</em>}</strong>
            <small>{file ? file.name : saved ? `Uploaded: ${saved.fileName}. Choose a file to replace it.` : documentLabels[kind].hint}</small></span>
          <span className="iv-upload-action">{file || saved ? "Replace" : "Choose file"}</span>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            onChange={event => { const chosen = event.target.files?.[0]; setFiles(current => ({ ...current, [kind]: chosen })); setError(""); }} />
        </label>;
      })}
    </div>}

    {step === 4 && <div className="iv-review">
      {mode === "register" && <div className="iv-grid">
        <Field label="Email address" hint="You will sign in with this address." required wide>{input("email", { type: "email", autoComplete: "email", maxLength: 240 })}</Field>
        <Field label="Password" required><PasswordInput label="Password" value={draft.password} autoComplete="new-password" onChange={value => set("password", value)} /></Field>
        <Field label="Confirm password" required error={draft.confirmPassword && draft.password !== draft.confirmPassword ? "The passwords do not match." : undefined}><PasswordInput label="Confirm password" value={draft.confirmPassword} autoComplete="new-password" onChange={value => set("confirmPassword", value)} /></Field>
        <p className="iv-muted is-wide">Use eight or more characters with uppercase, lowercase, a number and a symbol.</p>
      </div>}
      <dl className="iv-summary">{summary.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "—"}</dd></div>)}</dl>
      <ul className="iv-doc-summary">{[...docs.required, ...docs.optional].filter(kind => files[kind] || uploaded(kind)).map(kind => <li key={kind}><FiFileText aria-hidden="true" />{documentLabels[kind].label}</li>)}</ul>
      <label className="iv-declaration"><input type="checkbox" checked={draft.declarationAccepted} onChange={event => set("declarationAccepted", event.target.checked)} />
        <span>I declare that the information and documents I have provided are true, complete and belong to me or the business I represent. I understand that false declarations may lead to refusal and penalties under the Customs Proclamation.</span></label>
    </div>}

    <ToastMessage kind="error" message={error} onClear={() => setError("")} />
    <div className="iv-nav">
      {step > 0 ? <button type="button" className="iv-secondary" onClick={() => { setError(""); setStep(step - 1); }}><FiArrowLeft aria-hidden="true" />Back</button> : <span />}
      <button type="submit" className="iv-primary" disabled={busy}>{step < steps.length - 1 ? <>Continue<FiArrowRight aria-hidden="true" /></> : busy ? "Submitting…" : mode === "register" ? "Create account and submit" : "Submit for verification"}</button>
    </div>
  </form>;
}
