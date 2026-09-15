import {
  Card,
  Loader,
  Stack,
  Text,
} from "@mantine/core";
import { useTranslation } from "react-i18next";

export function HsLoadingState() {
  const { t } = useTranslation();

  return (
      <Stack
        align="center"
        justify="center"
        gap="sm"
        mih={160}
      >
        <Loader
          size="md"
          color="#228be6"
        />

        <Text c="dimmed">
          {t("loading", "Loading...")}
        </Text>
      </Stack>
  );
}
