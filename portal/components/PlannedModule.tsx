"use client";
import { useTranslation } from "react-i18next";
export function PlannedModule({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  return <><p className="eyebrow">{t("planned")}</p><h1>{t(titleKey)}</h1><section className="card"><p>{t("plannedBody")}</p></section></>;
}
