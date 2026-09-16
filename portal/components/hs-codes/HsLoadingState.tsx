import { useTranslation } from "react-i18next";
import { DataState } from "@/components/DataState";

export function HsLoadingState({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  return <DataState kind="loading" title={t("loading", "Loading…")} description={t("hsCatalogue.loadingDescription", "Retrieving HS codes and tariff revisions.")} compact={compact}/>;
}
