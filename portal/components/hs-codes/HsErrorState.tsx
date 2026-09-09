import {
  Alert,
  Button,
  Stack,
  Text,
} from "@mantine/core";
import { useTranslation } from "react-i18next";

interface HsErrorStateProps {
  onRetry: () => void;
  message?: string;
}

export function HsErrorState({
  onRetry,
  message,
}: HsErrorStateProps) {
  const { t } = useTranslation();

  return (
    <Alert
      color="red"
      title={t(
        "errorTitle",
        "Something went wrong",
      )}
    >
      <Stack gap="sm">
        <Text size="sm">
          {message ??
            t(
              "error",
              "The HS codes could not be loaded. Please try again.",
            )}
        </Text>

        <Button
          variant="light"
          color="red"
          size="sm"
          onClick={onRetry}
        >
          {t("retry", "Retry")}
        </Button>
      </Stack>
    </Alert>
  );
}