"use client";

import { Group, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { FiBookOpen } from "react-icons/fi";
import { useTranslation } from "react-i18next";

export function HsCatalogueHeader() {
  const { t } = useTranslation();

  return (
    <Group justify="space-between" align="center">
      <Group gap="sm">
        <ThemeIcon
          size={42}
          radius="md"
          variant="light"
          color="blue"
        >
          <FiBookOpen size={21} />
        </ThemeIcon>

        <Stack gap={2}>
          <Title
            order={1}
            size="clamp(1.5rem, 3vw, 2rem)"
          >
            {t(
              "hsCatalogue.title",
              "HS codes",
            )}
          </Title>

          <Text size="sm" c="dimmed">
            {t(
              "hsCatalogue.description",
              "Search and browse the Harmonized System code.",
            )}
          </Text>
        </Stack>
      </Group>
    </Group>
  );
}