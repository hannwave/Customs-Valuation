"use client";
import { Stack, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";

export function HsCatalogueHeader() {
  const { t } = useTranslation();
  return <Stack gap={0} className="data-page-heading">
    <Text className="eyebrow">{t("hsCatalogue.label", "HS Catalogue")}</Text>
    <Title order={1}>{t("hsCatalogue.title", "HS codes")}</Title>
    <Text mt="xs">{t("hsCatalogue.description", "Search and browse the Harmonized System code.")}</Text>
  </Stack>;
}
