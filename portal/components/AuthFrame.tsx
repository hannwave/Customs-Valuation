"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import styles from "@/app/register/registration.module.css";

export function AuthFrame({ children, signIn = false }: { children: ReactNode; signIn?: boolean }) {
  const { t, i18n } = useTranslation();
  return <div className={styles.page}>
    <div className={styles.topbar}>
      <Link className={styles.brand} href="/register">
        <span className={styles.monogram} aria-hidden="true">SES</span>
        <span>{t("registration.brand")}<small>{t("registration.portal")}</small></span>
      </Link>
      <label className={styles.language}>
        <span>{t("language")}</span>
        <select value={i18n.resolvedLanguage ?? "en"} onChange={event => void i18n.changeLanguage(event.target.value)}>
          <option value="en">English</option><option value="am">አማርኛ</option>
        </select>
      </label>
    </div>
    <main className={styles.main}>
      <p className={styles.switchPage}>
        {t(signIn ? "auth.needAccount" : "auth.haveAccount")} {" "}
        <Link href={signIn ? "/register" : "/sign-in"}>{t(signIn ? "auth.register" : "auth.signIn")}</Link>
      </p>
      {children}
      <p className={styles.footer}>{t("registration.footer")}</p>
    </main>
  </div>;
}
