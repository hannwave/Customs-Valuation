import { useTranslation } from "react-i18next";
import { DataState } from "@/components/DataState";

export function HsErrorState({ onRetry, message }: { onRetry: () => void; message?: string }) {
  const { t } = useTranslation();
  return <DataState kind="error" title={t("errorTitle", "Something went wrong")} description={message ?? t("error", "The HS codes could not be loaded. Please try again.")} onRetry={onRetry} retryLabel={t("retry", "Retry")}/>;
}
