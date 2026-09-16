import { Badge, Box, Group, Paper, SimpleGrid, Table, Text, Title } from "@mantine/core";
import type { PriceStatistics } from "@/lib/types/customs";

interface PriceStatisticsPanelProps {
  statistics: PriceStatistics | null;
  currency: string;
  scopeLabel: string;
}

export function PriceStatisticsPanel({ statistics, currency, scopeLabel }: PriceStatisticsPanelProps) {
  if (!statistics) return null;

  const money = new Intl.NumberFormat("en-ET", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  });
  const cards = [
    ["Minimum", money.format(statistics.minimum)],
    ["Maximum", money.format(statistics.maximum)],
    ["Mean", money.format(statistics.mean)],
    ["Median", money.format(statistics.median)],
    ["Observations", statistics.observationCount.toLocaleString()],
    ["Standard deviation", money.format(statistics.standardDeviation)],
    ["Potential outliers", statistics.potentialOutliers.length.toLocaleString()],
  ];

  return (
    <Paper withBorder radius="lg" p="lg" shadow="xs">
      <Group justify="space-between" mb="md">
        <Box>
          <Title order={2} size="h3">Price statistics</Title>
          <Text size="sm" c="dimmed">{scopeLabel} · valid positive price observations only</Text>
        </Box>
        <Badge variant="light">Population statistics</Badge>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 3, lg: 4 }}>
        {cards.map(([label, value]) => (
          <Paper key={label} className="data-metric" radius="md" p="md">
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{label}</Text>
            <Text fw={700} mt={4}>{value}</Text>
          </Paper>
        ))}
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: statistics.potentialOutliers.length ? 2 : 1 }} mt="lg">
        <Paper withBorder radius="md" p="md">
          <Text fw={700} mb="sm">Percentiles</Text>
          <Group grow>
            <Box><Text size="xs" c="dimmed">25th</Text><Text fw={600}>{money.format(statistics.percentiles.p25)}</Text></Box>
            <Box><Text size="xs" c="dimmed">50th</Text><Text fw={600}>{money.format(statistics.percentiles.p50)}</Text></Box>
            <Box><Text size="xs" c="dimmed">75th</Text><Text fw={600}>{money.format(statistics.percentiles.p75)}</Text></Box>
          </Group>
        </Paper>

        {statistics.potentialOutliers.length > 0 && (
          <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
            <Box p="md" pb="xs">
              <Text fw={700}>Potential outliers ({statistics.potentialOutliers.length})</Text>
              <Text size="xs" c="dimmed">Flagged using the 1.5× interquartile-range rule.</Text>
            </Box>
            <Box style={{ overflowX: "auto" }}>
              <Table verticalSpacing="xs">
                <Table.Thead><Table.Tr><Table.Th>Product</Table.Th><Table.Th>Price</Table.Th><Table.Th>Direction</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>
                  {statistics.potentialOutliers.map((item, index) => (
                    <Table.Tr key={`${item.source}-${item.title}-${index}`}>
                      <Table.Td><Text size="sm" fw={600} lineClamp={1}>{item.title}</Text><Text size="xs" c="dimmed">{item.source}</Text></Table.Td>
                      <Table.Td><Text size="sm">{money.format(item.price)}</Text></Table.Td>
                      <Table.Td><Badge color={item.direction === "High" ? "red" : "yellow"} variant="light">{item.direction}</Badge></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Box>
          </Paper>
        )}
      </SimpleGrid>
    </Paper>
  );
}
