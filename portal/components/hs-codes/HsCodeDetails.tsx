import {
  Badge,
  Card,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Group,
  Divider,
  Box,
  ThemeIcon,
  rem,
} from "@mantine/core";
import { useTranslation } from "react-i18next";

import type {
  HsCode,
  HsRevision,
} from "@/lib/types/customs";

interface HsCodeDetailsProps {
  hsCode: HsCode;
  revision?: HsRevision;
  isLoading?: boolean;
}

export function HsCodeDetails({
  hsCode,
  revision,
  isLoading = false,
}: HsCodeDetailsProps) {
  const { t, i18n } = useTranslation();

  const description =
    i18n.language === "am"
      ? hsCode.descriptionAm || hsCode.descriptionEn
      : hsCode.descriptionEn;

  const usingEnglishFallback =
    i18n.language === "am" && !hsCode.descriptionAm;

  const getStatusColor = (status?: string) => {
    switch (status?.toLowerCase()) {
      case "active":
        return "green";
      case "inactive":
        return "red";
      case "draft":
        return "yellow";
      case "approved":
        return "teal";
      case "pending":
        return "orange";
      default:
        return "gray";
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status?.toLowerCase()) {
      case "active":
        return "●";
      case "inactive":
        return "○";
      case "draft":
        return "◐";
      case "approved":
        return "✓";
      case "pending":
        return "◉";
      default:
        return "?";
    }
  };

  if (isLoading) {
    return (
      <Card withBorder radius="md" padding="xl">
        <Stack gap="xl">
          <div>
            <Text size="sm" c="dimmed">{t("code", "Code")}</Text>
            <div style={{ height: rem(40), width: rem(150), background: 'var(--mantine-color-gray-2)', borderRadius: rem(4), marginTop: rem(4) }} />
          </div>
          <div>
            <Text size="sm" c="dimmed">{t("description", "Description")}</Text>
            <div style={{ height: rem(24), width: '80%', background: 'var(--mantine-color-gray-2)', borderRadius: rem(4), marginTop: rem(4) }} />
          </div>
          <div>
            <Text size="sm" c="dimmed">{t("revision", "Revision")}</Text>
            <div style={{ height: rem(24), width: rem(120), background: 'var(--mantine-color-gray-2)', borderRadius: rem(4), marginTop: rem(4) }} />
          </div>
        </Stack>
      </Card>
    );
  }

  return (
    <Card
      withBorder
      radius="md"
      padding="xl"
      style={{
        backgroundColor: 'var(--mantine-color-body)',
        transition: 'box-shadow 0.2s ease',
        '&:hover': {
          boxShadow: 'var(--mantine-shadow-md)',
        },
      }}
    >
      <Stack gap="xl">
        {/* Header with Code */}
        <Box>
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} tracking="0.5px">
                {t("code", "Code")}
              </Text>
              <Text
                fw={700}
                size="2rem"
                ff="monospace"
                mt={4}
                c="blue"
                style={{
                  letterSpacing: '0.5px',
                }}
              >
                {hsCode.code}
              </Text>
            </div>
            {hsCode.status && (
              <Badge
                size="lg"
                variant="filled"
                color={getStatusColor(hsCode.status)}
                leftSection={getStatusIcon(hsCode.status)}
                styles={{
                  root: {
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    fontWeight: 600,
                  },
                }}
              >
                {t(hsCode.status.toLowerCase(), hsCode.status)}
              </Badge>
            )}
          </Group>
        </Box>

        <Divider />

        {/* Description */}
        <Box>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} tracking="0.5px">
            📝 {t("description", "Description")}
          </Text>
          <Text
            size="lg"
            mt={4}
            style={{
              lineHeight: 1.6,
            }}
          >
            {description}
          </Text>
          {usingEnglishFallback && (
            <Badge
              size="sm"
              variant="dot"
              color="orange"
              mt="sm"
              leftSection="⚠️"
            >
              {t("needsReview", "Needs Review")}
            </Badge>
          )}
        </Box>

        <Divider />

        {/* Revision Info */}
        <Box>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} tracking="0.5px">
            📅 {t("revision", "Revision")}
          </Text>
          <Group gap="md" mt={4}>
            <Text fw={600} size="md">
              {revision?.name ?? hsCode.revisionId}
            </Text>
            {revision?.status && (
              <Badge
                size="sm"
                variant="light"
                color={getStatusColor(revision.status)}
              >
                {revision.status}
              </Badge>
            )}
          </Group>
        </Box>

        {revision && (
          <>
            <Divider />

            {/* Revision Details Grid */}
            <SimpleGrid
              cols={{
                base: 1,
                sm: 2,
                md: 3,
              }}
              spacing="lg"
            >
              <Box
                style={{
                  padding: rem(12),
                  backgroundColor: 'var(--mantine-color-gray-0)',
                  borderRadius: rem(8),
                }}
              >
                <Text size="xs" c="dimmed" tt="uppercase" fw={600} tracking="0.5px">
                  📆 {t("effectiveDate", "Effective date")}
                </Text>
                <Text fw={500} mt={4}>
                  {revision.effectiveDate || t("notSet", "Not set")}
                </Text>
              </Box>

              <Box
                style={{
                  padding: rem(12),
                  backgroundColor: 'var(--mantine-color-gray-0)',
                  borderRadius: rem(8),
                }}
              >
                <Text size="xs" c="dimmed" tt="uppercase" fw={600} tracking="0.5px">
                  🏁 {t("endDate", "End date")}
                </Text>
                <Text fw={500} mt={4}>
                  {revision.endDate ?? t("currentRevision", "Current")}
                </Text>
              </Box>

              <Box
                style={{
                  padding: rem(12),
                  backgroundColor: 'var(--mantine-color-gray-0)',
                  borderRadius: rem(8),
                }}
              >
                <Text size="xs" c="dimmed" tt="uppercase" fw={600} tracking="0.5px">
                  🔢 {t("revisionNumber", "Revision number")}
                </Text>
                <Text fw={500} mt={4}>
                  {revision.number || t("notSet", "Not set")}
                </Text>
              </Box>
            </SimpleGrid>
          </>
        )}

        {/* Parent Info (if available) */}
        {hsCode.parentId && (
          <>
            <Divider />
            <Box>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} tracking="0.5px">
                🔗 {t("parent", "Parent")}
              </Text>
              <Text fw={500} mt={4} c="blue">
                {hsCode.parentId}
              </Text>
            </Box>
          </>
        )}

        {/* Additional Info */}
        {(hsCode.level !== undefined || hsCode.isLeaf !== undefined) && (
          <>
            <Divider />
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              {hsCode.level !== undefined && (
                <Box>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={600} tracking="0.5px">
                    📊 {t("level", "Level")}
                  </Text>
                  <Text fw={500} mt={4}>
                    {hsCode.level}
                  </Text>
                </Box>
              )}
              {hsCode.isLeaf !== undefined && (
                <Box>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={600} tracking="0.5px">
                    🌿 {t("leaf", "Leaf")}
                  </Text>
                  <Badge
                    mt={4}
                    variant="light"
                    color={hsCode.isLeaf ? "green" : "gray"}
                  >
                    {hsCode.isLeaf ? t("yes", "Yes") : t("no", "No")}
                  </Badge>
                </Box>
              )}
            </SimpleGrid>
          </>
        )}
      </Stack>
    </Card>
  );
}