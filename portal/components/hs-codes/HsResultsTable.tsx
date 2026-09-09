import Link from "next/link";
import {
  Badge,
  Button,
  Stack,
  Table,
  Text,
  Box,
  Group,
  Tooltip,
  Paper,
  rem,
} from "@mantine/core";
import { useTranslation } from "react-i18next";

import type {
  HsCode,
  HsRevision,
} from "@/lib/types/customs";

interface HsResultsTableProps {
  items: HsCode[];
  revisions: HsRevision[];
  isLoading?: boolean;
}

export function HsResultsTable({
  items,
  revisions,
  isLoading = false,
}: HsResultsTableProps) {
  const { t, i18n } = useTranslation();

  const getRevisionName = (revisionId: string) => {
    return (
      revisions.find(
        (revision) => revision.id === revisionId,
      )?.name ?? revisionId
    );
  };

  const getDescription = (item: HsCode) => {
    if (i18n.language === "am") {
      return item.descriptionAm || item.descriptionEn;
    }
    return item.descriptionEn;
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "active":
        return "green";
      case "inactive":
        return "red";
      case "draft":
        return "yellow";
      default:
        return "gray";
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case "active":
        return "Active";
      case "inactive":
        return "Inactive";
      case "draft":
        return "Draft";
      default:
        return "Unknown";
    }
  };

  if (items.length === 0 && !isLoading) {
    return (
      <Box p="xl" style={{ textAlign: "center" }}>
        <Text size="lg" c="dimmed">
          {t("noResults", "No results found")}
        </Text>
        <Text size="sm" c="dimmed" mt={4}>
          {t("noResultsDescription", "Try adjusting your search or filters")}
        </Text>
      </Box>
    );
  }

  return (
    <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
      <Box style={{ overflowX: "auto" }}>
        <Table
          striped
          highlightOnHover
          verticalSpacing="md"
          horizontalSpacing="md"
          styles={{
            th: {
              backgroundColor: 'var(--mantine-color-gray-0)',
              fontWeight: 600,
              fontSize: rem(13),
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              padding: `${rem(12)} ${rem(16)}`,
              borderBottom: '2px solid var(--mantine-color-gray-2)',
            },
            td: {
              padding: `${rem(12)} ${rem(16)}`,
              borderBottom: '1px solid var(--mantine-color-gray-1)',
            },
            tr: {
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
              '&:hover': {
                backgroundColor: 'var(--mantine-color-blue-0)',
              },
              '&:last-child td': {
                borderBottom: 'none',
              },
            },
          }}
        >
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ minWidth: "120px" }}>
                📌 {t("code", "Code")}
              </Table.Th>

              <Table.Th style={{ minWidth: "250px" }}>
                📝 {t("description", "Description")}
              </Table.Th>

              <Table.Th style={{ minWidth: "130px" }}>
                📅 {t("revision", "Revision")}
              </Table.Th>

              <Table.Th style={{ minWidth: "100px" }}>
                📊 {t("status", "Status")}
              </Table.Th>

              <Table.Th style={{ minWidth: "100px", textAlign: "center" }}>
                {t("action", "Action")}
              </Table.Th>
            </Table.Tr>
          </Table.Thead>

          <Table.Tbody>
            {items.map((item) => {
              const hasAmharicDescription = Boolean(item.descriptionAm);
              const status = item.status || "unknown";

              return (
                <Table.Tr
                  key={item.id}
                  onClick={() => {
                    window.location.href = `/hs-codes/${item.id}`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      window.location.href = `/hs-codes/${item.id}`;
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`${t("viewDetails", "View details")} for ${item.code}`}
                >
                  <Table.Td>
                    <Text
                      fw={700}
                      size="sm"
                      c="blue"
                      ff="monospace"
                    >
                      {item.code}
                    </Text>
                    {item.parentId && (
                      <Text size="xs" c="dimmed" mt={2}>
                        ↳ {t("childOf", "Child of")} {item.parentId}
                      </Text>
                    )}
                  </Table.Td>

                  <Table.Td>
                    <Stack gap={4}>
                      <Text size="sm" lineClamp={2}>
                        {getDescription(item)}
                      </Text>

                      {i18n.language === "am" && !hasAmharicDescription && (
                        <Badge
                          size="xs"
                          variant="dot"
                          color="orange"
                          w="fit-content"
                        >
                          {t("needsReview", "Needs Review")}
                        </Badge>
                      )}
                    </Stack>
                  </Table.Td>

                  <Table.Td>
                    <Badge
                      variant="light"
                      color="gray"
                      size="sm"
                    >
                      {getRevisionName(item.revisionId)}
                    </Badge>
                  </Table.Td>

                  <Table.Td>
                    <Badge
                      variant="filled"
                      color={getStatusColor(status)}
                      size="sm"
                      leftSection={
                        status === "active" ? "●" :
                        status === "inactive" ? "○" :
                        status === "draft" ? "◐" : "?"
                      }
                    >
                      {t(getStatusLabel(status), getStatusLabel(status))}
                    </Badge>
                  </Table.Td>

                  <Table.Td>
                    <Group justify="center" gap="xs">
                      <Tooltip
                        label={t("viewDetails", "View details")}
                        withArrow
                        position="left"
                      >
                        <Button
                          component={Link}
                          href={`/hs-codes/${item.id}`}
                          variant="subtle"
                          color="blue"
                          size="sm"
                          radius="md"
                          onClick={(e) => e.stopPropagation()}
                          styles={{
                            root: {
                              fontWeight: 500,
                              '&:hover': {
                                backgroundColor: 'var(--mantine-color-blue-1)',
                              },
                            },
                          }}
                        >
                          👁️ {t("view", "View")}
                        </Button>
                      </Tooltip>
                      <Button
                        variant="subtle"
                        color="gray"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.location.href = `/hs-codes/${item.id}`;
                        }}
                      >
                        →
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Box>
    </Paper>
  );
}