"use client";

import {
  Group,
  Pagination,
  Text,
} from "@mantine/core";
import { useTranslation } from "react-i18next";

interface HsPaginationProps {
  page: number;
  totalPages: number;
  totalCount: number;
  disabled?: boolean;
  onChange: (page: number) => void;
}

export function HsPagination({
  page,
  totalPages,
  totalCount,
  disabled = false,
  onChange,
}: HsPaginationProps) {
  const { t } = useTranslation();

  if (totalCount === 0 || totalPages <= 1) {
    return null;
  }

  return (
    <Group
      justify="space-between"
      align="center"
      mt="lg"
      wrap="wrap"
    >
      <Text size="sm" c="dimmed">
        {t(
          "hsCatalogue.totalResults",
          "{{count}} results",
          {
            count: totalCount,
          },
        )}
      </Text>

      <Pagination
        value={page}
        onChange={onChange}
        total={totalPages}
        disabled={disabled}
        withEdges
        size="sm"
      />
    </Group>
  );
}

