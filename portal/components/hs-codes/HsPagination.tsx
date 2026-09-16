"use client";

import {
  Group,
  Button,
  Text,
} from "@mantine/core";
import { useTranslation } from "react-i18next";

interface HsPaginationProps {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize?: number;
  disabled?: boolean;
  onChange: (page: number) => void;
}

export function HsPagination({
  page,
  totalPages,
  totalCount,
  pageSize = 10,
  disabled = false,
  onChange,
}: HsPaginationProps) {
  const { t } = useTranslation();

  if (totalCount === 0 || totalPages <= 1) {
    return null;
  }

  const from =
    (page - 1) * pageSize + 1;

  const to = Math.min(
    page * pageSize,
    totalCount,
  );

  return (
    <Group
      justify="space-between"
      align="center"
      gap="md"
      wrap="wrap"
      px="lg"
      py="md"
      style={{
        borderTop:
          "1px solid #dce5e9",
        color: "#566976",
        fontSize: "12px",
      }}
    >
      {/* Showing count */}
      <Text
        size="xs"
        c="#566976"
      >
        {t(
          "hsCatalogue.showing",
          "Showing {{from}}–{{to}} of {{total}}",
          {
            from,
            to,
            total: totalCount,
          },
        )}
      </Text>

      {/* Pagination controls */}
      <Group
        gap="sm"
        align="center"
      >
        <Button
          variant="default"
          size="xs"
          disabled={
            disabled || page === 1
          }
          onClick={() =>
            onChange(page - 1)
          }
          styles={{
            root: {
              background: "#fff",
              color: "#345866",
              border:
                "1px solid #cbd8de",
              fontSize: "12px",
              padding:
                "9px 13px",
              height: "36px",
            },
          }}
        >
          {t(
            "previous",
            "Previous",
          )}
        </Button>

        <Text
          size="xs"
          c="#526875"
          style={{
            minWidth: "48px",
            textAlign: "center",
            whiteSpace: "nowrap",
          }}
        >
          {page} / {totalPages}
        </Text>

        <Button
          variant="default"
          size="xs"
          disabled={
            disabled ||
            page >= totalPages
          }
          onClick={() =>
            onChange(page + 1)
          }
          styles={{
            root: {
              background: "#fff",
              color: "#345866",
              border:
                "1px solid #cbd8de",
              fontSize: "12px",
              padding:
                "9px 13px",
              height: "36px",
            },
          }}
        >
          {t(
            "next",
            "Next",
          )}
        </Button>
      </Group>
    </Group>
  );
}