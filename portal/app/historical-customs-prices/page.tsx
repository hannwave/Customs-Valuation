"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Alert, Badge, Box, Button, Container, Group, Paper, SegmentedControl, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { DataState } from "@/components/DataState";
import { FeedbackToast } from "@/components/FeedbackToast";
import { HistoricalMarketChart, HistoricalRow } from "@/components/prices/HistoricalMarketChart";
import { getSessionAccessToken, setSessionAccessToken } from "@/lib/auth/session";
import { readValuationSession, updateValuationSession, type ValuationSession } from "@/lib/valuation-session";

type Candidate = { key: string; title: string; market: string; currency: string; price: number | null };
type Search = { searchId: string; items: Candidate[]; messages: string[] };
type Comparison = { product: string; currency: string; asOf: string; countries: string[]; rows: HistoricalRow[]; messages: string[]; methodology: string; summary: { currentInternationalPrice: number | null; internationalAsOf: string | null; currentLocalPrice: number | null; sixMonthChange: number | null; differencePercent: number | null } };
const money = (n: number | null) => n === null ? "Unavailable" : `ETB ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const percent = (n: number | null) => n === null ? "Unavailable" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;

export default function HistoricalCustomsPricesPage() {
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [variant, setVariant] = useState("");
  const [search, setSearch] = useState<Search | null>(null);
  const [selected, setSelected] = useState<Record<string, string | null>>({});
  const [data, setData] = useState<Comparison | null>(null);
  const [range, setRange] = useState("6M");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [activeSession, setActiveSession] = useState<ValuationSession | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    const active = readValuationSession();
    setActiveSession(active);
  }, []);

  async function request<T>(path: string, body: unknown): Promise<T> {
    const token = getSessionAccessToken();
    if (!token) { window.location.assign("/login?next=%2Fhistorical-customs-prices"); throw new Error("Please sign in."); }
    controller.current?.abort();
    controller.current = new AbortController();
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080"}/api/historical-markets/${path}`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.current.signal,
    });
    if (response.status === 401) { setSessionAccessToken(null); window.location.assign("/login?next=%2Fhistorical-customs-prices"); throw new Error("Session expired."); }
    if (response.status === 403) throw new Error("This evidence tool requires a Customs Officer account.");
    const value = await response.json();
    if (!response.ok) throw new Error(value.detail ?? value.message ?? "Price history could not be loaded.");
    return value;
  }
  async function find(event: FormEvent) {
    event.preventDefault(); setError(""); setData(null); setSearch(null); setSelected({}); setBusy("Searching three international markets…");
    try { setSearch(await request<Search>("search", { brand: brand.trim(), model: model.trim(), variant: variant.trim().toLowerCase() })); }
    catch (e) { setError(e instanceof Error ? e.message : "Search failed."); }
    finally { setBusy(""); }
  }
  async function compare() {
    setBusy("Reading saved database observations…"); setError(""); setData(null);
    try { const comparison = await request<Comparison>("compare", { searchId: search!.searchId, keys: Object.values(selected).filter(Boolean) }); setData(comparison); updateValuationSession({ historical: comparison }); setPage(1); }
    catch (e) { setError(e instanceof Error ? e.message : "Comparison failed."); }
    finally { setBusy(""); }
  }
  const cutoff = data ? new Date(`${data.asOf}T00:00:00Z`) : new Date();
  const months = ({ "1M": 1, "3M": 3, "6M": 6, "1Y": 12 } as Record<string, number>)[range];
  if (months) { const day = cutoff.getUTCDate(); cutoff.setUTCDate(1); cutoff.setUTCMonth(cutoff.getUTCMonth() - months); const end = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0)).getUTCDate(); cutoff.setUTCDate(Math.min(day, end)); }
  const rows = data?.rows.filter(row => range === "ALL" || row.date >= cutoff.toISOString().slice(0, 10)) ?? [];
  const tableRows = [...rows].reverse();
  const pages = Math.max(1, Math.ceil(tableRows.length / 30));

  return <Box className="data-page"><Container fluid p={0}><Stack gap="xl">
    <Box className="data-page-heading"><Text className="eyebrow">PRICE REVIEW / CUSTOMS HISTORY</Text><Title order={1}>Customs history</Title><Text c="dimmed" mt="xs">Compare saved international and Ethiopian observations for the exact product, in ETB.</Text></Box>
    {activeSession && <Alert color="blue" title="Active valuation session">This history review belongs to <strong>{activeSession.query}</strong>. Confirm the exact model and variant below; the comparison reads saved database observations only.</Alert>}
    <Paper component="form" onSubmit={find} withBorder radius="lg" p="lg"><Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 3 }}><TextInput required maxLength={60} disabled={!!busy} label="Brand" placeholder="Apple" value={brand} onChange={e => setBrand(e.currentTarget.value)} /><TextInput required minLength={2} maxLength={100} disabled={!!busy} label="Exact model" placeholder="iPhone 15 Pro" value={model} onChange={e => setModel(e.currentTarget.value)} /><TextInput required maxLength={40} disabled={!!busy} label="Storage / variant" description="Use ‘standard’ if no storage or size variant." placeholder="128GB" value={variant} onChange={e => setVariant(e.currentTarget.value)} /></SimpleGrid>
      <Group justify="space-between"><Text size="sm" c="dimmed">Australia · United States · United Kingdom</Text><Button type="submit" disabled={!!busy}>Find exact products</Button></Group>
    </Stack></Paper>
    <FeedbackToast error={error} onDismissError={() => setError("")} />
    {busy && <DataState kind="loading" title={busy} description="Historical comparisons use observations captured by previous searches; no live history is fetched here." />}
    {search && <Paper withBorder p="lg" radius="lg"><Stack gap="md"><Title order={3}>Confirm the same product in each market</Title><Text size="sm" c="dimmed">Choose up to one match per country. Confirm model, capacity and edition before combining prices. Accessories and conflicting variants are filtered out.</Text>
      {search.messages.map(message => <Alert key={message} color="yellow">{message}</Alert>)}
      {search.items.length ? <><SimpleGrid cols={{ base: 1, md: 3 }}>{["au", "us", "gb"].map(market => <Select key={market} label={({ au: "Australia", us: "United States", gb: "United Kingdom" })[market]} placeholder="No product selected" clearable disabled={!!busy} value={selected[market] ?? null} onChange={key => { setSelected(s => ({ ...s, [market]: key })); setData(null); }} data={search.items.filter(x => x.market === market).map(x => ({ value: x.key, label: `${x.title} · ${x.currency} ${x.price ?? "—"}` }))} />)}</SimpleGrid><Group justify="flex-end"><Button disabled={!!busy || !Object.values(selected).some(Boolean)} onClick={() => void compare()}>Compare confirmed products</Button></Group></> : <DataState kind="empty" title="No exact matches" description="Check the brand, model and storage. Ambiguous and conflicting products are excluded; try another exact model." />}
    </Stack></Paper>}
    {!search && !busy && !error && <DataState kind="empty" title="Start with an exact product" description="Search the brand, model and storage variant, then confirm matching products before viewing history." />}
    {data && <>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>{[
        ["Current International Price", money(data.summary.currentInternationalPrice), `Latest search observation: ${data.summary.internationalAsOf ?? "unavailable"}`],
        ["Current Local Price", money(data.summary.currentLocalPrice), "Today's comparable local observations"],
        ["6-month price change %", percent(data.summary.sixMonthChange), "International; exact six-month baseline required"],
        ["Local vs International difference %", percent(data.summary.differencePercent), "(Local − International) ÷ International"],
      ].map(([label, value, help]) => <Paper withBorder radius="lg" p="lg" key={label}><Text size="sm" c="dimmed">{label}</Text><Text size="xl" fw={700} mt="xs">{value}</Text><Text size="xs" c="dimmed" mt="xs">{help}</Text></Paper>)}</SimpleGrid>
      {data.messages.map(message => <Alert key={message} color="yellow">{message}</Alert>)}
      <Paper withBorder radius="lg" p="lg"><Group justify="space-between" mb="lg"><Box><Title order={3}>{data.product}</Title><Text size="sm" c="dimmed">Daily medians · ETB · As of {data.asOf}</Text></Box><SegmentedControl aria-label="History date range" value={range} onChange={value => { setRange(value); setPage(1); }} data={["1M", "3M", "6M", "1Y", "ALL"]} /></Group><HistoricalMarketChart rows={rows} /><Group mt="md">{data.countries.map(country => <Badge key={country} variant="light">{country}</Badge>)}</Group></Paper>
      <Paper withBorder radius="lg" p="lg"><Title order={3} mb="md">Historical price comparison</Title><Box style={{ overflowX: "auto" }}><Table striped><Table.Thead><Table.Tr>{["Date", "International Price", "Local Price", "Difference", "Percentage Difference"].map(h => <Table.Th key={h}>{h}</Table.Th>)}</Table.Tr></Table.Thead><Table.Tbody>{tableRows.slice((page - 1) * 30, page * 30).map(row => <Table.Tr key={row.date}><Table.Td>{row.date}</Table.Td><Table.Td>{money(row.internationalPrice)}</Table.Td><Table.Td>{money(row.localPrice)}</Table.Td><Table.Td>{money(row.difference)}</Table.Td><Table.Td>{percent(row.percentageDifference)}</Table.Td></Table.Tr>)}</Table.Tbody></Table></Box><Group justify="space-between" mt="md"><Button variant="subtle" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button><Text size="sm">Page {page} of {pages}</Text><Button variant="subtle" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button></Group></Paper>
      <Text size="sm" c="dimmed">{data.methodology} These are market observations, not historical customs declarations.</Text>
    </>}
  </Stack></Container></Box>;
}
