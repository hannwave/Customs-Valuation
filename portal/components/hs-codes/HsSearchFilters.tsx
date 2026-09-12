"use client";

import {
  Button,
  Card,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  FiFilter,
  FiHash,
  FiRefreshCw,
  FiSearch,
  FiTag,
} from "react-icons/fi";

type RevisionOption = {
  value: string;
  label: string;
};

type HsSearchFiltersProps = {
  code: string;
  description: string;
  revisionId: string | null;
  revisions: RevisionOption[];
  revisionsLoading?: boolean;
  hasActiveFilters: boolean;
  onCodeChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onRevisionChange: (value: string | null) => void;
  onSearch: () => void;
  onClear: () => void;
};

const ALL_REVISIONS = "__all__";

export function HsSearchFilters({
  code,
  description,
  revisionId,
  revisions,
  revisionsLoading = false,
  hasActiveFilters,
  onCodeChange,
  onDescriptionChange,
  onRevisionChange,
  onSearch,
  onClear,
}: HsSearchFiltersProps) {
  const { t } = useTranslation();

  const handleSubmit = (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    onSearch();
  };

  const revisionOptions = [
    {
      value: ALL_REVISIONS,
      label: t(
        "hsCatalogue.allRevisions",
        "All revisions",
      ),
    },
    ...revisions,
  ];

  const handleRevisionChange = (
    value: string | null,
  ) => {
    if (!value || value === ALL_REVISIONS) {
      onRevisionChange(null);
      return;
    }

    onRevisionChange(value);
  };

  return (
    <Card
      withBorder
      radius="lg"
      p={{ base: "md", sm: "lg" }}
      shadow="sm"
      style={{
        borderColor:
          "var(--mantine-color-gray-2)",
        overflow: "visible",
      }}
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="lg">
          <Group
            justify="space-between"
            align="flex-start"
            gap="md"
          >
            <Group gap="sm" align="center">
              <Card
                p={8}
                radius="md"
                bg="blue.0"
                withBorder={false}
              >
                <FiFilter
                  size={19}
                  strokeWidth={2}
                  color="var(--mantine-color-blue-6)"
                />
              </Card>

              <Stack gap={1}>
                <Text fw={700} size="md">
                  {t(
                    "hsCatalogue.filters",
                    "Search & filters",
                  )}
                </Text>

                <Text size="sm" c="dimmed">
                  {t(
                    "hsCatalogue.filterDescription",
                    "Find HS codes by code, description, or revision.",
                  )}
                </Text>
              </Stack>
            </Group>
          </Group>

          <SimpleGrid
            cols={{
              base: 1,
              sm: 2,
              md: 3,
            }}
            spacing="md"
          >
            <TextInput
              label={t(
                "hsCatalogue.codeLabel",
                "HS code",
              )}
              placeholder={t(
                "hsCatalogue.codePlaceholder",
                "e.g. 850440",
              )}
              description={t(
                "hsCatalogue.codeDescription",
                "Search using the HS classification code.",
              )}
              value={code}
              onChange={(event) =>
                onCodeChange(
                  event.currentTarget.value,
                )
              }
              leftSection={
                <FiHash size={17} />
              }
              leftSectionPointerEvents="none"
              maxLength={100}
              size="md"
              radius="md"
            />

            <TextInput
              label={t(
                "hsCatalogue.descriptionLabel",
                "Description",
              )}
              placeholder={t(
                "hsCatalogue.descriptionPlaceholder",
                "Search by description",
              )}
              description={t(
                "hsCatalogue.descriptionDescription",
                "Search the HS code description.",
              )}
              value={description}
              onChange={(event) =>
                onDescriptionChange(
                  event.currentTarget.value,
                )
              }
              leftSection={
                <FiTag size={17} />
              }
              leftSectionPointerEvents="none"
              maxLength={100}
              size="md"
              radius="md"
            />

            <Select
              label={t(
                "revision",
                "Revision",
              )}
              description={t(
                "hsCatalogue.revisionDescription",
                "Filter by HS revision.",
              )}
              data={revisionOptions}
              value={
                revisionId ?? ALL_REVISIONS
              }
              onChange={handleRevisionChange}
              disabled={revisionsLoading}
              leftSection={
                <FiRefreshCw size={17} />
              }
              leftSectionPointerEvents="none"
              allowDeselect={false}
              searchable={false}
              checkIconPosition="right"
              nothingFoundMessage={t(
                "hsCatalogue.noRevisions",
                "No revisions found",
              )}
              size="md"
              radius="md"
              comboboxProps={{
                withinPortal: true,
              }}
              styles={{
                input: {
                  cursor: "pointer",
                },
                section: {
                  cursor: "pointer",
                },
              }}
            />
          </SimpleGrid>

          <Group
            justify="flex-end"
            gap="sm"
            pt="xs"
            style={{
              borderTop:
                "1px solid var(--mantine-color-gray-2)",
            }}
          >
            <Group
              gap="sm"
              w={{
                base: "100%",
                sm: "auto",
              }}
              grow
            >
              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="light"
                  color="red"
                  size="md"
                  radius="md"
                  onClick={onClear}
                >
                  {t(
                    "clearFilters",
                    "Clear filters",
                  )}
                </Button>
              )}

              <Button
                type="submit"
                size="md"
                color="blue"
                radius="md"
                leftSection={
                  <FiSearch size={17} />
                }
              >
                {t(
                  "searchButton",
                  "Search",
                )}
              </Button>
            </Group>
          </Group>
        </Stack>
      </form>
    </Card>
  );
}