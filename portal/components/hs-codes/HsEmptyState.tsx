import {
  Card,
  Stack,
  Text,
} from "@mantine/core";
import { useTranslation } from "react-i18next";

export function HsEmptyState() {
  const { t } = useTranslation();

  return (
    <Card
      withBorder
      radius="md"
      padding="xl"
    >
      <Stack
        align="center"
        justify="center"
        gap="xs"
        mih={160}
      >
        <Text fw={600}>
          {t(
            "noResultsTitle",
            "No results found",
          )}
        </Text>

        <Text
          size="sm"
          c="dimmed"
          ta="center"
        >
          {t(
            "empty",
            "No HS codes match your search criteria.",
          )}
        </Text>
      </Stack>
    </Card>
  );
}