"use client";

import {
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useTranslation } from "react-i18next";

export function HsCatalogueHeader() {
  const { t } = useTranslation();

  return (
    <Stack gap={0}>
      <Text
        size="xs"
        fw={700}
        tt="uppercase"
        c="#176b70"
        mb={6}
        style={{
          letterSpacing: "0.08em",
        }}
      >
        {t(
          "hsCatalogue.label",
          "HS Catalogue",
        )}
      </Text>

      <Title
        order={1}
        fw={600}
        size="clamp(1.7rem, 3vw, 2.2rem)"
        c="#182c3d"
        mb={10}
      >
        {t(
          "hsCatalogue.title",
          "HS codes",
        )}
      </Title>

      <Text
        size="sm"
        c="#566976"
        maw={650}
        style={{
          lineHeight: 1.65,
          fontSize: "15px",
        }}
      >
        {t(
          "hsCatalogue.description",
          "Search and browse the Harmonized System code.",
        )}
      </Text>
    </Stack>
  );
}