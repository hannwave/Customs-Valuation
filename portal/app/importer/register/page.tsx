"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Brand } from "@/components/Brand";
import { setSessionAccessToken } from "@/lib/auth/session";
import { importerApiBase } from "@/lib/importer";

export default function ImporterRegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const response = await fetch(`${importerApiBase}/auth/register-importer`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: values.get("fullName"), email: values.get("email"), password: values.get("password"), confirmPassword: values.get("confirmPassword") }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message ?? "Registration could not be completed.");
      setSessionAccessToken(body.accessToken);
      router.replace("/importer");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Registration could not be completed."); }
    finally { setBusy(false); }
  }
  return <main className="importer-shell"><header className="importer-top"><Link href="/"><Brand compact variant="dark" /></Link><Link href="/login">Already registered? Sign in</Link></header>
    <div className="importer-card importer-register-card"><p className="importer-eyebrow">IMPORTER PORTAL</p><h1>Create your importer account</h1>
      <p>Register your imported goods and documents before an officer starts classification and assessment.</p>
      <form onSubmit={submit} className="importer-form">
        {error && <p className="importer-error" role="alert">{error}</p>}
        <label>Full name<input name="fullName" autoComplete="name" required minLength={2} maxLength={200} /></label>
        <label>Email address<input name="email" type="email" autoComplete="email" required /></label>
        <label>Password<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
        <label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
        <small>Use eight or more characters with uppercase, lowercase, a number and a symbol.</small>
        <button className="importer-primary" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
      </form>
    </div>
  </main>;
}
