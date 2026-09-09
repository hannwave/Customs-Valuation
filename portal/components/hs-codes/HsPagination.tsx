import { Group, Pagination, Text } from "@mantine/core";
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

  if (totalCount === 0) {
    return null;
  }

  return (
    <Group
      justify="space-between"
      align="center"
      mt="lg"
      className="hs-pagination"
    >
      <Text size="sm" c="dimmed">
        {t("page", "Page")} {page}{" "}
        {t("of", "of")} {totalPages}
      </Text>

      <Pagination
        value={page}
        total={totalPages}
        onChange={onChange}
        disabled={disabled}
        withEdges
      />
    </Group>
  );
}