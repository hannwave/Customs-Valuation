import { useTranslation } from "react-i18next";
import { DataState } from "@/components/DataState";

export function HsEmptyState() {
  const { t } = useTranslation();
  return <DataState kind="empty" title={t("noResultsTitle", "No results found")} description={t("empty", "No HS codes match your search criteria.")}/>;
}
