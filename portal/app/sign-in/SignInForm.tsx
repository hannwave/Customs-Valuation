"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, PasswordInput, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { AuthFrame } from "@/components/AuthFrame";
import { useDemoSession } from "@/lib/auth/DemoSessionProvider";
import styles from "../register/registration.module.css";

export function SignInForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signIn } = useDemoSession();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [entering, setEntering] = useState(false);
  const identifierRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (entering) return;
    setSubmitted(true);
    if (!signIn(identifier, password)) {
      (!identifier.trim() ? identifierRef : passwordRef).current?.focus();
      return;
    }
    setPassword("");
    setEntering(true);
    router.replace("/");
  }

  return <AuthFrame signIn>
    <section className={styles.panel} aria-labelledby="sign-in-title">
      <p className={styles.eyebrow}>{t("registration.staffAccess")}</p>
      <h1 id="sign-in-title">{t("auth.signIn")}</h1>
      <p className={styles.intro}>{t("auth.intro")}</p>
      <div className={styles.notice} id="demo-sign-in-note">
        <strong>{t("auth.demoTitle")}</strong>
        <p>{t("auth.demoHint")}</p>
      </div>
      <form noValidate onSubmit={submit}>
        <div className={styles.signInFields}>
          <TextInput ref={identifierRef} id="sign-in-identifier" name="username" label={t("auth.identifier")} placeholder={t("auth.identifierPlaceholder")} autoComplete="off" autoCapitalize="none" value={identifier} onChange={event => setIdentifier(event.currentTarget.value)} required error={submitted && !identifier.trim() ? t("registration.errors.required") : undefined} size="md" classNames={{ input: styles.input, label: styles.label }} />
          <PasswordInput ref={passwordRef} id="sign-in-password" name="password" label={t("auth.password")} placeholder={t("auth.passwordPlaceholder")} autoComplete="off" value={password} onChange={event => setPassword(event.currentTarget.value)} required error={submitted && !password.trim() ? t("registration.errors.required") : undefined} size="md" visibilityToggleButtonProps={{ "aria-label": t("auth.togglePassword") }} classNames={{ input: styles.input, label: styles.label }} />
        </div>
        <Button type="submit" color="#176b70" size="md" fullWidth loading={entering} aria-describedby="demo-sign-in-note">{t("auth.enter")}</Button>
      </form>
    </section>
  </AuthFrame>;
}
