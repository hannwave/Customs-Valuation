"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, Box, Container, Group, Paper, Stack, Table, Text, Title } from "@mantine/core";
import Link from "next/link";
import { FiArrowRight, FiAlertTriangle } from "react-icons/fi";
import { DataState } from "@/components/DataState";
import { readValuationSession, type ValuationSession } from "@/lib/valuation-session";

type OutlierRow = { source: string; title: string; price: number; direction: string };

function historicalOutliers(rows: { date: string; price: number | null }[], source: string): OutlierRow[] {
  const values = rows.filter(row => row.price != null && row.price > 0).map(row => row.price as number).sort((a, b) => a - b);
  if (values.length < 4) return [];
  const q1 = values[Math.floor((values.length - 1) * 0.25)];
  const q3 = values[Math.floor((values.length - 1) * 0.75)];
  const fence = (q3 - q1) * 1.5;
  return rows.filter(row => row.price != null && (row.price < q1 - fence || row.price > q3 + fence)).map(row => ({ source, title: row.date, price: row.price as number, direction: (row.price as number) > q3 + fence ? "High" : "Low" }));
}

export default function OutlierAnalysisPage() {
  const [session, setSession] = useState<ValuationSession | null>(null);
  useEffect(() => setSession(readValuationSession()), []);
  if (!session) return <DataState kind="empty" title="Search a product first" description="Price analysis opens after a product search creates the active valuation session." />;

  const international = session.international?.statistics?.potentialOutliers ?? [];
  const local = session.local?.statistics?.potentialOutliers ?? [];
  const historicalInternational = historicalOutliers((session.historical?.rows ?? []).map(row => ({ date: row.date, price: row.internationalPrice })), "Customs history · global");
  const historicalLocal = historicalOutliers((session.historical?.rows ?? []).map(row => ({ date: row.date, price: row.localPrice })), "Customs history · local");
  const rows: OutlierRow[] = [
    ...international.map(item => ({ source: "Global market", title: item.title, price: item.price, direction: item.direction })),
    ...local.map(item => ({ source: "Local market", title: item.title, price: item.price, direction: item.direction })),
    ...historicalInternational, ...historicalLocal,
  ];
  return <Box className="data-page"><Container fluid p={0}><Stack gap="xl">
    <Box className="data-page-heading"><Text className="eyebrow">PRICE REVIEW / ANALYSIS</Text><Title order={1}>Price analysis</Title><Text c="dimmed" mt="xs">Outlier findings for the active valuation session: {session.query}.</Text></Box>
    <Group className="detail-link-row"><Link href="/">Back to Price Review <FiArrowRight /></Link><Link href="/historical-customs-prices">Open Customs History <FiArrowRight /></Link></Group>
    <div className="analysis-summary-grid"><Paper withBorder radius="lg" p="lg"><Text size="sm" c="dimmed">Global market outliers</Text><Title order={2}>{international.length}</Title><Text size="xs" c="dimmed">Flagged by the provider statistics returned for this search.</Text></Paper><Paper withBorder radius="lg" p="lg"><Text size="sm" c="dimmed">Local market outliers</Text><Title order={2}>{local.length}</Title><Text size="xs" c="dimmed">Flagged by the local evidence statistics.</Text></Paper><Paper withBorder radius="lg" p="lg"><Text size="sm" c="dimmed">Customs history outliers</Text><Title order={2}>{historicalInternational.length + historicalLocal.length}</Title><Text size="xs" c="dimmed">IQR flags calculated from the saved daily medians in Customs History.</Text></Paper></div>
    {!rows.length && <Alert color="green" title="No suspected outliers">The saved search results and Customs History medians contain no suspected outliers.</Alert>}
    {rows.length > 0 && <Paper withBorder radius="lg" p="lg"><Group mb="md"><FiAlertTriangle /><Title order={3}>Flagged records</Title></Group><Box style={{ overflowX: "auto" }}><Table striped><Table.Thead><Table.Tr><Table.Th>Source</Table.Th><Table.Th>Product</Table.Th><Table.Th>Price</Table.Th><Table.Th>Finding</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{rows.map((row, index) => <Table.Tr key={`${row.source}-${row.title}-${index}`}><Table.Td><Badge variant="light">{row.source}</Badge></Table.Td><Table.Td>{row.title}</Table.Td><Table.Td>{row.price.toLocaleString()}</Table.Td><Table.Td>{row.direction === "High" ? "High relative to comparable values" : "Low relative to comparable values"}</Table.Td></Table.Tr>)}</Table.Tbody></Table></Box></Paper>}
  </Stack></Container></Box>;
}
