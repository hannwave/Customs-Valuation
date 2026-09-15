"use client";

import { FormEvent, useState } from "react";
import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Container,
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { getSessionAccessToken, setSessionAccessToken } from "@/lib/auth/session";
import { PriceStatisticsPanel } from "@/components/prices/PriceStatisticsPanel";
import type {
  InternationalPriceSearch,
  InternationalPriceSync,
} from "@/lib/types/customs";

const markets = [
  { value: "us", label: "United States (USD)" },
  { value: "gb", label: "United Kingdom (GBP)" },
  { value: "de", label: "Germany (EUR)" },
  { value: "ae", label: "United Arab Emirates (AED)" },
  { value: "za", label: "South Africa (ZAR)" },
];

const marketCurrency: Record<string, string> = {
  us: "USD", gb: "GBP", de: "EUR", ae: "AED", za: "ZAR",
};

type Action = "search" | "sync";

export default function InternationalPricesPage() {
  const [query, setQuery] = useState("");
  const [hsCode, setHsCode] = useState("");
  const [market, setMarket] = useState("us");
  const [data, setData] = useState<InternationalPriceSearch | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busyAction, setBusyAction] = useState<Action | null>(null);

  async function loadPrices(action: Action) {
    const trimmedQuery = query.trim();
    const normalizedHsCode = hsCode.replace(/\D/g, "");

    if (action === "search" && trimmedQuery.length < 2) {
      setError("Enter a product name or description containing at least two characters.");
      return;
    }

    if (action === "sync" && ![6, 8].includes(normalizedHsCode.length)) {
      setError("Enter a valid six-digit HS code before loading prices into the database.");
      return;
    }

    setBusyAction(action);
    setError("");
    setStatus("");

    try {
      const token = getSessionAccessToken();
      if (!token) {
        window.location.assign("/login?next=%2Finternational-prices");
        return;
      }

      const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080";
      const response = action === "sync"
        ? await fetch(`${base}/api/international-prices/sync`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              hsCode: normalizedHsCode,
              query: trimmedQuery || null,
              market,
            }),
          })
        : await fetch(
            `${base}/api/international-prices/search?${new URLSearchParams({ q: trimmedQuery, market })}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );

      if (response.status === 401) {
        setSessionAccessToken(null);
        window.location.assign("/login?next=%2Finternational-prices");
        return;
      }

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.detail ?? body.message ?? "International prices could not be loaded.");
      }

      setData(body);

      if (action === "sync") {
        const sync = body as InternationalPriceSync;
        setStatus(
          `HS ${sync.hsCode}: ${sync.savedCount} new prices saved, ${sync.updatedCount} existing prices updated, and ${sync.skippedCount} results skipped.`,
        );
      }
    } catch (exception) {
      setData(null);
      setError(exception instanceof Error ? exception.message : "International prices could not be loaded.");
    } finally {
      setBusyAction(null);
    }
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadPrices("search");
  }

  const loading = busyAction !== null;

  return (
    <Box bg="gray.0" mih="100%" py="xl">
      <Container size="xl">
        <Stack gap="xl">
          <Box>
            <Text size="sm" fw={700} c="blue" tt="uppercase">Market evidence</Text>
            <Title order={1}>International prices</Title>
            <Text c="dimmed" mt="xs">
              Search live Google Shopping offers, or associate them with an HS item and store them in Supabase as unapproved international reference evidence.
            </Text>
          </Box>

          <Paper component="form" onSubmit={search} withBorder radius="lg" p="lg" shadow="xs">
            <Stack gap="md">
              <SimpleGrid cols={{ base: 1, md: 3 }}>
                <TextInput
                  label="Product description"
                  description="Optional when saving; the HS description will be used by default."
                  placeholder="Example: green coffee beans 1 kg"
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                />
                <TextInput
                  label="Database HS code"
                  description="Required only when saving prices to Supabase."
                  placeholder="Example: 090111"
                  value={hsCode}
                  onChange={(event) => setHsCode(event.currentTarget.value)}
                />
                <Select
                  label="Market"
                  description="Currency is assigned from the selected market."
                  data={markets}
                  value={market}
                  onChange={(value) => setMarket(value ?? "us")}
                  allowDeselect={false}
                />
              </SimpleGrid>
              <Group justify="flex-end">
                <Button type="submit" variant="light" disabled={loading}>
                  {busyAction === "search" ? "Searching…" : "Search live only"}
                </Button>
                <Button type="button" disabled={loading} onClick={() => void loadPrices("sync")}>
                  {busyAction === "sync" ? "Loading into database…" : "Load prices into database"}
                </Button>
              </Group>
            </Stack>
          </Paper>

          {error && <Alert color="red" title="Price loading failed">{error}</Alert>}
          {status && <Alert color="green" title="Database updated">{status}</Alert>}

          {loading && (
            <Paper withBorder radius="lg" p="xl">
              <Group justify="center"><Loader size="sm" /><Text>Requesting international offers from SerpAPI…</Text></Group>
            </Paper>
          )}

          {!loading && data && (
            <>
            <PriceStatisticsPanel
              statistics={data.statistics}
              currency={marketCurrency[data.market.toLowerCase()] ?? "USD"}
              scopeLabel={`International prices · ${data.market.toUpperCase()}`}
            />
            <Paper withBorder radius="lg" shadow="sm" style={{ overflow: "hidden" }}>
              <Group justify="space-between" p="md">
                <Box>
                  <Text fw={700}>{data.items.length} offers for “{data.query}”</Text>
                  <Text size="xs" c="dimmed">Market: {data.market.toUpperCase()} · Retrieved {new Date(data.retrievedAt).toLocaleString()}</Text>
                </Box>
                <Badge variant="light" color={status ? "green" : "blue"}>
                  {status ? "Saved in Supabase" : "Live SerpAPI results"}
                </Badge>
              </Group>
              <Box style={{ overflowX: "auto" }}>
                <Table striped highlightOnHover verticalSpacing="md">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Product</Table.Th>
                      <Table.Th>Seller</Table.Th>
                      <Table.Th>Price</Table.Th>
                      <Table.Th>Rating</Table.Th>
                      <Table.Th>Delivery / condition</Table.Th>
                      <Table.Th>Source</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {data.items.map((item, index) => (
                      <Table.Tr key={`${item.productUrl ?? item.title}-${index}`}>
                        <Table.Td><Text fw={600} size="sm">{item.title}</Text></Table.Td>
                        <Table.Td><Text size="sm">{item.source}</Text></Table.Td>
                        <Table.Td><Badge color="green" variant="light" size="lg">{item.displayPrice}</Badge></Table.Td>
                        <Table.Td><Text size="sm">{item.rating ? `${item.rating} (${item.reviews ?? 0})` : "—"}</Text></Table.Td>
                        <Table.Td><Text size="sm">{[item.delivery, item.condition].filter(Boolean).join(" · ") || "—"}</Text></Table.Td>
                        <Table.Td>
                          {item.productUrl ? <Anchor href={item.productUrl} target="_blank" rel="noreferrer" size="sm">View offer</Anchor> : "—"}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Box>
              {data.items.length === 0 && <Text ta="center" c="dimmed" p="xl">No shopping offers matched this search.</Text>}
            </Paper>
            </>
          )}
        </Stack>
      </Container>
    </Box>
  );
}
