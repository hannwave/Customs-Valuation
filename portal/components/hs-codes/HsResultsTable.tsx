"use client";

import Link from "next/link";
import {
  Badge,
  Button,
  Group,
  Paper,
  Stack,
  Table,
  Text,
  Tooltip,
  Box,
} from "@mantine/core";
import { useTranslation } from "react-i18next";

import type {
  HsCode,
  HsRevision,
} from "@/lib/types/customs";

interface HsResultsTableProps {
  items: HsCode[];
  revisions: HsRevision[];
}

export function HsResultsTable({
  items,
  revisions,
}: HsResultsTableProps) {
  const { t, i18n } = useTranslation();

  const getRevisionName = (
    revisionId: string,
  ) => {
    return (
      revisions.find(
        (revision) =>
          revision.id === revisionId,
      )?.name ??
      t(
        "hsCatalogue.revisionUnavailable",
        "Revision unavailable",
      )
    );
  };

  const getDescription = (
    item: HsCode,
  ) => {
    if (i18n.language === "am") {
      return (
        item.descriptionAm ||
        item.descriptionEn
      );
    }

    return item.descriptionEn;
  };

  return (
    <Paper
      withBorder
      radius="lg"
      shadow="sm"
      style={{
        overflow: "hidden",
      }}
    >
      <Box
        style={{
          overflowX: "auto",
        }}
      >
        <Table
          striped
          highlightOnHover
          verticalSpacing="md"
          horizontalSpacing="md"
        >
          <Table.Thead>
            <Table.Tr>
              <Table.Th
                style={{
                  minWidth: "120px",
                }}
              >
                {t(
                  "hsCatalogue.codeLabel",
                  "HS codes",
                )}
              </Table.Th>

              <Table.Th
                style={{
                  minWidth: "250px",
                }}
              >
                {t(
                  "hsCatalogue.descriptionLabel",
                  "Description",
                )}
              </Table.Th>

              <Table.Th
                style={{
                  minWidth: "130px",
                }}
              >
                {t(
                  "hsCatalogue.revision",
                  "Revision",
                )}
              </Table.Th>

              <Table.Th
                style={{
                  minWidth: "100px",
                }}
              >
                {t(
                  "hsCatalogue.action",
                  "Action",
                )}
              </Table.Th>
            </Table.Tr>
          </Table.Thead>

          <Table.Tbody>
            {items.map((item) => {
              const hasAmharicDescription =
                Boolean(item.descriptionAm);

              return (
                <Table.Tr key={item.id}>
                  <Table.Td>
                    <Text
                      fw={700}
                      size="sm"
                      ff="monospace"
                    >
                      {item.code}
                    </Text>
                  </Table.Td>

                  <Table.Td>
                    <Stack gap={4}>
                      <Text
                        size="sm"
                        lineClamp={2}
                      >
                        {getDescription(item)}
                      </Text>

                      {i18n.language === "am" &&
                        !hasAmharicDescription && (
                          <Badge
                            size="xs"
                            variant="dot"
                            color="orange"
                            w="fit-content"
                          >
                            {t(
                              "needsReview",
                              "Needs Review",
                            )}
                          </Badge>
                        )}
                    </Stack>
                  </Table.Td>

                  <Table.Td>
                    <Stack gap={2}>
                      <Badge
                        variant="light"
                        color="gray"
                        size="sm"
                        w="fit-content"
                      >
                        {getRevisionName(
                          item.revisionId,
                        )}
                      </Badge>

                      {revisions.find(
                        (revision) =>
                          revision.id ===
                          item.revisionId,
                      ) && (
                        <Text
                          size="xs"
                          c="dimmed"
                        >
                          {t(
                            "hsCatalogue.effectiveDate",
                            "Effective",
                          )}
                          :{" "}
                          {
                            revisions.find(
                              (revision) =>
                                revision.id ===
                                item.revisionId,
                            )?.effectiveDate
                          }
                        </Text>
                      )}
                    </Stack>
                  </Table.Td>

                  <Table.Td>
                    <Group gap="xs">
                      <Tooltip
                        label={t(
                          "hsCatalogue.viewDetails",
                          "Details",
                        )}
                        withArrow
                      >
                        <Button
                          component={Link}
                          href={`/hs-codes/${item.id}`}
                          variant="light"
                          color="blue"
                          size="sm"
                          radius="md"
                        >
                          {t(
                            "hsCatalogue.viewDetails",
                            "Details",
                          )}
                        </Button>
                      </Tooltip>
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