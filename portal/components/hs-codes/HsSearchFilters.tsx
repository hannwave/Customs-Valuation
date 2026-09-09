import {
  Button,
  Group,
  Select,
  Stack,
  TextInput,
  Paper,
  Grid,
  Text,
  Divider,
  ActionIcon,
  Tooltip,
  rem,
} from "@mantine/core";
import { FormEvent } from "react";
import { useTranslation } from "react-i18next";

interface RevisionOption {
  value: string;
  label: string;
}

interface HsSearchFiltersProps {
  code: string;
  description: string;
  revisionId: string | null;
  revisions: RevisionOption[];
  revisionsLoading?: boolean;
  onCodeChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onRevisionChange: (value: string | null) => void;
  onSearch: () => void;
  onClear: () => void;
}

export function HsSearchFilters({
  code,
  description,
  revisionId,
  revisions,
  revisionsLoading = false,
  onCodeChange,
  onDescriptionChange,
  onRevisionChange,
  onSearch,
  onClear,
}: HsSearchFiltersProps) {
  const { t, i18n } = useTranslation();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch();
  };

  const hasFilters =
    code.trim().length > 0 ||
    description.trim().length > 0 ||
    Boolean(revisionId);

  return (
    <Paper
      withBorder
      shadow="sm"
      radius="md"
      p="lg"
      style={{
        backgroundColor: 'var(--mantine-color-body)',
        transition: 'box-shadow 0.2s ease',
      }}
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="lg">
          {/* Filter Header */}
          <Group justify="space-between" align="center">
            <Group gap="xs">
              <span style={{ fontSize: '18px' }}>🔍</span>
              <Text fw={600} size="sm" c="dimmed" tt="uppercase" tracking="0.5px">
                {t("filters", "Filters")}
              </Text>
              {hasFilters && (
                <Text size="xs" c="blue" fw={500}>
                  ({t("active", "Active")})
                </Text>
              )}
            </Group>
            {hasFilters && (
              <Tooltip label={t("clearAllFilters", "Clear all filters")}>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  onClick={onClear}
                  size="sm"
                  aria-label="Clear all filters"
                >
                  <span>✕</span>
                </ActionIcon>
              </Tooltip>
            )}
          </Group>

          <Divider />

          {/* Filter Grid */}
          <Grid gutter="md">
            {/* HS Code Input */}
            <Grid.Col span={{ base: 12, md: 4 }}>
              <TextInput
                label={
                  <Text size="sm" fw={500}>
                    📌 {t("hsCodeSearch", "HS Code")}
                  </Text>
                }
                placeholder={t(
                  "hsCodeSearchPlaceholder",
                  "Enter HS code..."
                )}
                description={
                  <Text size="xs" c="dimmed">
                    {t(
                      "hsCodeSearchHint",
                      "Example: 8504"
                    )}
                  </Text>
                }
                value={code}
                maxLength={100}
                onChange={(event) =>
                  onCodeChange(event.currentTarget.value)
                }
                size="md"
                radius="md"
                leftSection="🔍"
                styles={{
                  input: {
                    backgroundColor: 'var(--mantine-color-gray-0)',
                    '&:focus': {
                      backgroundColor: 'var(--mantine-color-body)',
                      borderColor: 'var(--mantine-color-blue-5)',
                    },
                  },
                  label: {
                    marginBottom: rem(6),
                  },
                  description: {
                    marginTop: rem(4),
                  },
                }}
              />
            </Grid.Col>

            {/* Description Input */}
            <Grid.Col span={{ base: 12, md: 4 }}>
              <TextInput
                label={
                  <Text size="sm" fw={500}>
                    📝 {t("descriptionSearch", "Description")}
                  </Text>
                }
                placeholder={t(
                  "descriptionSearchPlaceholder",
                  "Enter product description..."
                )}
                description={
                  <Text size="xs" c="dimmed">
                    {i18n.language === "am"
                      ? t(
                          "descriptionSearchHintAm",
                          "Search using the English or Amharic description."
                        )
                      : t(
                          "descriptionSearchHint",
                          "Search using the product description."
                        )}
                  </Text>
                }
                value={description}
                maxLength={100}
                onChange={(event) =>
                  onDescriptionChange(event.currentTarget.value)
                }
                size="md"
                radius="md"
                leftSection="📝"
                styles={{
                  input: {
                    backgroundColor: 'var(--mantine-color-gray-0)',
                    '&:focus': {
                      backgroundColor: 'var(--mantine-color-body)',
                      borderColor: 'var(--mantine-color-blue-5)',
                    },
                  },
                  label: {
                    marginBottom: rem(6),
                  },
                  description: {
                    marginTop: rem(4),
                  },
                }}
              />
            </Grid.Col>

            {/* Revision Select */}
            <Grid.Col span={{ base: 12, md: 4 }}>
              <Select
                label={
                  <Text size="sm" fw={500}>
                    📅 {t("revision", "Revision")}
                  </Text>
                }
                placeholder={t(
                  "selectRevision",
                  "Select a revision..."
                )}
                data={revisions}
                value={revisionId}
                onChange={onRevisionChange}
                searchable
                clearable
                disabled={revisionsLoading}
                nothingFoundMessage={t(
                  "empty",
                  "No results found"
                )}
                size="md"
                radius="md"
                styles={{
                  input: {
                    backgroundColor: 'var(--mantine-color-gray-0)',
                    '&:focus': {
                      backgroundColor: 'var(--mantine-color-body)',
                      borderColor: 'var(--mantine-color-blue-5)',
                    },
                  },
                  label: {
                    marginBottom: rem(6),
                  },
                }}
              />
            </Grid.Col>
          </Grid>

          <Divider />

          {/* Action Buttons */}
          <Group justify="flex-end" gap="sm">
            {hasFilters && (
              <Button
                type="button"
                variant="light"
                color="gray"
                onClick={onClear}
                disabled={!hasFilters}
                size="md"
                radius="md"
                leftSection={<span>✕</span>}
              >
                {t("clearFilters", "Clear filters")}
              </Button>
            )}

            <Button variant="filled" color="teal" radius="lg">Button
              {t("searchButton", "Search")}
            </Button>
          </Group>

          {/* Keyboard Hint */}
          <Text size="xs" c="dimmed" ta="center">
            ⌨️ {t("keyboardHint", "Press Enter to search")}
          </Text>
        </Stack>
      </form>
    </Paper>
  );
}