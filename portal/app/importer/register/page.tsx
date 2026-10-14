"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FiCheckCircle } from "react-icons/fi";
import { ImporterSplitLayout } from "@/components/ImporterSplitLayout";
import { ImporterVerificationForm } from "@/components/ImporterVerificationForm";
import { setSessionAccessToken } from "@/lib/auth/session";

export default function ImporterRegisterPage() {
  const router = useRouter();
  return <ImporterSplitLayout kicker="CREATE IMPORTER ACCOUNT" title={<>Register once.<br /><span>Declare with confidence.</span></>}
    body="Tell us who you are and upload your licences and identity document. A Customs Officer in your region verifies them before your first declaration."
    topLink={<Link href="/login?next=%2Fimporter">Already registered? Sign in</Link>}
    aside={<ul className="iv-hero-checks">
      <li><FiCheckCircle aria-hidden="true" /><span><strong>Have your documents ready</strong>Trade licence, TIN certificate and an identity document, depending on how you import.</span></li>
      <li><FiCheckCircle aria-hidden="true" /><span><strong>Choose your region carefully</strong>Your application goes to Customs Officers in the region you select.</span></li>
      <li><FiCheckCircle aria-hidden="true" /><span><strong>Sign in while you wait</strong>You can follow your verification status from the portal.</span></li>
    </ul>}>
    <ImporterVerificationForm mode="register" onRegistered={token => { setSessionAccessToken(token); router.replace("/importer"); }} />
  </ImporterSplitLayout>;
}
