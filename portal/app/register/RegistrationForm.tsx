"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { AuthFrame } from "@/components/AuthFrame";
import styles from "./registration.module.css";

const fields = ["fullName", "email", "employeeId", "organization", "office"] as const;
type Field = typeof fields[number];
type Details = Record<Field, string>;
const emptyDetails: Details = { fullName: "", email: "", employeeId: "", organization: "", office: "" };
const limits: Record<Field, number> = { fullName: 150, email: 254, employeeId: 60, organization: 150, office: 150 };

export function RegistrationForm() {
  const { t } = useTranslation();
  const [details, setDetails] = useState<Details>(emptyDetails);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [reviewing, setReviewing] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const reviewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reviewing) reviewRef.current?.focus();
  }, [reviewing]);

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = Object.fromEntries(fields.map(field => [field, details[field].trim()])) as Details;
    const nextErrors: Partial<Record<Field, string>> = {};
    for (const field of fields) {
      if (!cleaned[field]) nextErrors[field] = "required";
    }
    const emailInput = formRef.current?.elements.namedItem("email") as HTMLInputElement | null;
    if (cleaned.email && emailInput?.validity.typeMismatch) nextErrors.email = "invalidEmail";
    setDetails(cleaned);
    setErrors(nextErrors);
    const firstError = fields.find(field => nextErrors[field]);
    if (firstError) {
      (formRef.current?.elements.namedItem(firstError) as HTMLInputElement | null)?.focus();
      return;
    }
    setReviewing(true);
  }

  return (
    <AuthFrame>
        <section className={styles.panel} aria-labelledby="registration-title">
          <p className={styles.eyebrow}>{t("registration.staffAccess")}</p>
          <h1 id="registration-title">{t(reviewing ? "registration.reviewTitle" : "registration.title")}</h1>
          <p className={styles.intro}>{t(reviewing ? "registration.reviewIntro" : "registration.intro")}</p>

          {reviewing ? (
            <div ref={reviewRef} tabIndex={-1} className={styles.review}>
              <div className={styles.notice} role="status">
                <strong>{t("registration.notSent")}</strong>
                <p>{t("registration.unavailable")}</p>
              </div>
              <dl className={styles.details}>
                {fields.map(field => <div key={field}><dt>{t(`registration.fields.${field}`)}</dt><dd>{details[field]}</dd></div>)}
              </dl>
              <Button component={Link} href="/sign-in" color="#176b70" size="md" fullWidth className={styles.continueButton}>{t("auth.continue")}</Button>
              <Button type="button" variant="outline" color="#176b70" size="md" fullWidth onClick={() => setReviewing(false)}>{t("registration.edit")}</Button>
            </div>
          ) : (
            <form ref={formRef} onSubmit={review} noValidate>
              <div className={styles.fields}>
                {fields.map(field => (
                  <TextInput
                    key={field}
                    id={`registration-${field}`}
                    name={field}
                    type={field === "email" ? "email" : "text"}
                    label={t(`registration.fields.${field}`)}
                    placeholder={t(`registration.placeholders.${field}`)}
                    autoComplete={field === "fullName" ? "name" : field === "email" ? "email" : field === "organization" ? "organization" : "off"}
                    autoCapitalize={field === "email" ? "none" : undefined}
                    required
                    maxLength={limits[field]}
                    value={details[field]}
                    onChange={event => {
                      const value = event.currentTarget.value;
                      setDetails(previous => ({ ...previous, [field]: value }));
                      setErrors(previous => ({ ...previous, [field]: undefined }));
                    }}
                    error={errors[field] ? t(`registration.errors.${errors[field]}`) : undefined}
                    size="md"
                    className={field === "employeeId" || field === "organization" ? undefined : styles.fullWidth}
                    classNames={{ input: styles.input, label: styles.label }}
                  />
                ))}
              </div>
              <p className={styles.permissionNote}>{t("registration.permissions")}</p>
              <div className={styles.notice} id="registration-availability">
                <strong>{t("registration.availabilityTitle")}</strong>
                <p>{t("registration.availability")}</p>
              </div>
              <Button type="submit" color="#176b70" size="md" fullWidth aria-describedby="registration-availability">{t("registration.reviewButton")}</Button>
            </form>
          )}
        </section>
    </AuthFrame>
  );
}
