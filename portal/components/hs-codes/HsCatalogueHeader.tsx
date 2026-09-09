import { Stack, Text, Title, Group, Badge, Box, Divider } from "@mantine/core";
import { useTranslation } from "react-i18next";

interface HsCatalogueHeaderProps {
  totalCount?: number;
  isFetching?: boolean;
}

export function HsCatalogueHeader({ 
  totalCount = 0, 
  isFetching = false 
}: HsCatalogueHeaderProps) {
  const { t } = useTranslation();

  return (
    <Stack gap={8}>
      <Group justify="space-between" align="center" wrap="wrap">
        <Group gap="sm">
          <Title order={1} size="h2">
            📋 {t("hsCatalogue", "HS Catalogue")}
          </Title>
          {totalCount > 0 && (
            <Badge 
              size="lg" 
              variant="filled" 
              color={isFetching ? "yellow" : "blue"}
              leftSection={isFetching ? "⟳" : "📊"}
            >
              {isFetching 
                ? t("updating", "Updating...") 
                : `${totalCount} ${t("records", "records")}`
              }
            </Badge>
          )}
        </Group>
        
        <Badge 
          size="md" 
          variant="light" 
          color="gray"
        >
          {t("browse", "Browse")}
        </Badge>
      </Group>

      <Text c="dimmed" size="sm">
        {t(
          "hsCodesIntro",
          "Search and browse Harmonized System commodity codes."
        )}
      </Text>

      {totalCount > 0 && !isFetching && (
        <Box>
          <Divider />
          <Group gap="xs" mt={4}>
            <Text size="xs" c="dimmed">
              {t("totalRecords", "Total records")}: 
            </Text>
            <Text size="xs" fw={600} c="blue">
              {totalCount}
            </Text>
          </Group>
        </Box>
      )}
    </Stack>
  );
}