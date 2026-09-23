"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Alert, Anchor, Badge, Box, Button, Checkbox, Container, Group, NumberInput,
  Paper, Select, SimpleGrid, Stack, Switch, Table, Text, Textarea, TextInput, Title,
} from "@mantine/core";
import { DataState } from "@/components/DataState";
import { FeedbackToast } from "@/components/FeedbackToast";
import { PriceStatisticsPanel } from "@/components/prices/PriceStatisticsPanel";
import { getSessionAccessToken, setSessionAccessToken } from "@/lib/auth/session";
import type {
  ClassifiedLocalListing, LocalMarketAnalysisResponse, LocalMarketPriceSearch, LocalMarketSyncResponse, LocalObservationStatus,
} from "@/lib/types/customs";
import { readValuationSession, updateValuationSession } from "@/lib/valuation-session";

const providerChoices = [
  { id: "jiji", label: "Jiji Ethiopia", description: "Public marketplace catalogue" },
  { id: "ethioshop", label: "EthioShop", description: "Official Store API" },
  { id: "telegebeya", label: "TeleGebeya", description: "Partner API required" },
] as const;
const conditions = ["New", "Used", "Refurbished", "Unknown"];
const productTypes = ["Smartphone", "Computer", "Vehicle", "Clothing", "Food", "Machinery", "Construction product", "Industrial good"];
const priceTypes = ["Retail", "Wholesale", "Distributor", "Manufacturer", "SupplierQuotation"];
const outlierMethods = [{ value: "Iqr", label: "IQR (1.5× range)" }, { value: "Mad", label: "MAD (robust)" }, { value: "None", label: "No outlier detection" }];
type Action = "search" | "sync";
type ObservationFilter = "ALL" | "USED" | "EXCLUDED" | LocalObservationStatus;

function statusColor(status: LocalObservationStatus) {
  if (["ValidForStatistics", "ManuallyApproved"].includes(status)) return "green";
  if (status === "PotentialOutlier") return "orange";
  if (status === "Duplicate") return "gray";
  return "red";
}
function labelStatus(status: string) {
  return status.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export default function LocalPricesPage() {
  const [query, setQuery] = useState("");
  const [hsCode, setHsCode] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [variant, setVariant] = useState("");
  const [productType, setProductType] = useState<string | null>(null);
  const [condition, setCondition] = useState("New");
  const [priceType, setPriceType] = useState("Retail");
  const [outlierMethod, setOutlierMethod] = useState("Iqr");
  const [includeOutliers, setIncludeOutliers] = useState(false);
  const [threshold, setThreshold] = useState<number | string>(80);
  const [maximumAgeDays, setMaximumAgeDays] = useState<number | string>(180);
  const [selectedSources, setSelectedSources] = useState<string[]>(providerChoices.map((item) => item.id));
  const [data, setData] = useState<LocalMarketAnalysisResponse | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyAction, setBusyAction] = useState<Action | null>(null);
  const [observationFilter, setObservationFilter] = useState<ObservationFilter>("ALL");
  const [sellerFilter, setSellerFilter] = useState("");
  const [reviewing, setReviewing] = useState<ClassifiedLocalListing | null>(null);
  const [reviewDecision, setReviewDecision] = useState("Approved");
  const [reviewJustification, setReviewJustification] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [activeSnapshot, setActiveSnapshot] = useState<LocalMarketPriceSearch | null>(null);

  useEffect(() => {
    const active = readValuationSession();
    if (active?.local) { setActiveSnapshot(active.local); setQuery(active.query); }
    const overviewQuery = new URLSearchParams(window.location.search).get("q")?.trim();
    if (overviewQuery) setQuery(overviewQuery);
  }, []);

  function toggleSource(source: string, enabled: boolean) {
    setSelectedSources((current) => enabled ? [...new Set([...current, source])] : current.filter((item) => item !== source));
  }

  async function loadPrices(action: Action) {
    const normalizedHsCode = hsCode.replace(/\D/g, "");
    if (query.trim().length < 2) return setError("Enter a product description containing at least two characters.");
    if (![6, 8].includes(normalizedHsCode.length)) return setError("A valid six-digit HS code is required so every raw observation can be stored correctly.");
    if (selectedSources.length === 0) return setError("Select at least one local marketplace.");

    setBusyAction(action); setError(""); setNotice(""); setObservationFilter("ALL");
    try {
      const token = getSessionAccessToken();
      if (!token) { window.location.assign("/login?next=%2Flocal-prices"); return; }
      const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080";
      const payload = {
        hsCode: normalizedHsCode, query: query.trim(), sources: selectedSources.join(","),
        category: productType, productType, brand: brand.trim() || null, model: model.trim() || null,
        variant: variant.trim() || null, condition, priceType,
        relevanceThreshold: Number(threshold), outlierMethod, includeOutliers, maximumAgeDays: Number(maximumAgeDays),
      };
      const response = await fetch(action === "sync" ? `${base}/api/local-prices/sync` : `${base}/api/local-market/search`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (response.status === 401) { setSessionAccessToken(null); window.location.assign("/login?next=%2Flocal-prices"); return; }
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail ?? body.message ?? "Local-market analysis failed.");
      if (action === "sync") {
        const sync = body as LocalMarketSyncResponse;
        setData(sync.result);
        setNotice(`${sync.savedCount} clean observations saved, ${sync.updatedCount} updated, and ${sync.skippedCount} excluded from reference evidence.`);
      } else {
        setData(body as LocalMarketAnalysisResponse);
        updateValuationSession({ query: query.trim() });
      }
    } catch (exception) {
      setData(null); setError(exception instanceof Error ? exception.message : "Local-market analysis failed.");
    } finally { setBusyAction(null); }
  }

  async function submitReview() {
    if (!reviewing) return;
    setReviewBusy(true); setError("");
    try {
      const token = getSessionAccessToken();
      const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080";
      const response = await fetch(`${base}/api/local-prices/${reviewing.id}/review`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ decision: reviewDecision, justification: reviewJustification.trim() }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail ?? body.message ?? "Review could not be saved.");
      const newStatus: LocalObservationStatus = reviewDecision === "Approved" ? "ManuallyApproved" : reviewDecision === "Rejected" ? "ManuallyRejected" : "PotentialOutlier";
      setData((current) => current ? { ...current, analysis: { ...current.analysis, observations: current.analysis.observations.map((item) => item.id === reviewing.id ? { ...item, status: newStatus, reason: reviewJustification.trim(), includedInStatistics: reviewDecision === "Approved" } : item) } } : current);
      setNotice("Officer review saved and written to the audit trail. Run the analysis again to refresh aggregate statistics.");
      setReviewing(null); setReviewJustification("");
    } catch (exception) { setError(exception instanceof Error ? exception.message : "Review could not be saved."); }
    finally { setReviewBusy(false); }
  }

  const visibleObservations = useMemo(() => {
    const observations = data?.analysis.observations ?? [];
    return observations.filter((item) => {
      const categoryMatches = observationFilter === "ALL" ||
        (observationFilter === "USED" && item.includedInStatistics) ||
        (observationFilter === "EXCLUDED" && !item.includedInStatistics) || item.status === observationFilter;
      const sellerMatches = !sellerFilter.trim() || (item.listing.seller ?? "").toLowerCase().includes(sellerFilter.trim().toLowerCase());
      return categoryMatches && sellerMatches;
    });
  }, [data, observationFilter, sellerFilter]);

  const analysis = data?.analysis;
  const stats = includeOutliers ? analysis?.statisticsIncludingOutliers : analysis?.robustStatistics;
  const money = (value: number | null | undefined) => value == null ? "—" : new Intl.NumberFormat("en-ET", { style: "currency", currency: "ETB", maximumFractionDigits: 2 }).format(value);
  const qualityCards = analysis ? [
    { label: "Fetched", value: analysis.collection.rawListings, filter: "ALL" as ObservationFilter, color: "blue" },
    { label: "Used", value: analysis.collection.validObservations, filter: "USED" as ObservationFilter, color: "green" },
    { label: "Excluded", value: analysis.collection.excluded, filter: "EXCLUDED" as ObservationFilter, color: "red" },
    { label: "Irrelevant", value: analysis.collection.rejectedIrrelevant, filter: "RejectedIrrelevant" as ObservationFilter, color: "orange" },
    { label: "Wrong variant", value: analysis.collection.wrongVariant, filter: "WrongVariant" as ObservationFilter, color: "yellow" },
    { label: "Duplicates", value: analysis.collection.duplicates, filter: "Duplicate" as ObservationFilter, color: "gray" },
    { label: "Outliers", value: analysis.collection.potentialOutliers, filter: "PotentialOutlier" as ObservationFilter, color: "grape" },
  ] : [];

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void loadPrices("search"); }

  function clearSearch() {
    setQuery(""); setHsCode(""); setBrand(""); setModel(""); setVariant(""); setProductType(null);
    setCondition("New"); setPriceType("Retail"); setOutlierMethod("Iqr"); setIncludeOutliers(false);
    setThreshold(80); setMaximumAgeDays(180); setSelectedSources(providerChoices.map((item) => item.id));
    setData(null); setError(""); setNotice(""); setObservationFilter("ALL"); setSellerFilter("");
    setReviewing(null); setReviewJustification(""); setActiveSnapshot(null);
  }

  return (
    <Box className="data-page"><Container fluid p={0}><Stack gap="xl">
      <Box className="data-page-heading"><Text className="eyebrow">PRICE REVIEW / LOCAL MARKET</Text><Title order={1}>Local market</Title><Text c="dimmed" mt="xs">Review the saved local evidence for the active valuation session, then classify and approve comparable observations when needed.</Text></Box>
      {activeSnapshot && <Paper withBorder radius="lg" p="lg"><Group justify="space-between" mb="md"><Box><Text className="eyebrow">ACTIVE VALUATION SESSION</Text><Title order={3}>{activeSnapshot.query}</Title><Text size="sm" c="dimmed">Saved local-market evidence from the current search. This snapshot remains available while you move through the workflow.</Text></Box><Badge color="green" variant="light">Session evidence</Badge></Group><PriceStatisticsPanel statistics={activeSnapshot.statistics} currency="ETB" scopeLabel="Local market · saved search" /><Box mt="lg" style={{ overflowX: "auto" }}><Table striped><Table.Thead><Table.Tr><Table.Th>Product</Table.Th><Table.Th>Source</Table.Th><Table.Th>Price</Table.Th><Table.Th>Observed</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{activeSnapshot.items.map(item => <Table.Tr key={`${item.source}-${item.sourceListingId}`}><Table.Td>{item.title}</Table.Td><Table.Td>{item.source}</Table.Td><Table.Td>{item.currency} {item.price.toLocaleString()}</Table.Td><Table.Td>{item.listingDate ? new Date(item.listingDate).toLocaleDateString() : new Date(activeSnapshot.retrievedAt).toLocaleDateString()}</Table.Td></Table.Tr>)}</Table.Tbody></Table></Box></Paper>}

      <Paper component="form" onSubmit={submit} withBorder radius="lg" p="lg" shadow="xs" className="local-market-form"><Stack gap="lg">
        <Box className="local-form-intro"><Text className="eyebrow">STEP 1 · PRODUCT IDENTITY</Text><Title order={2} size="h3">Define the product</Title><Text size="sm" c="dimmed" mt={4}>Use an exact description and HS code to keep every listing comparable.</Text></Box>
        <SimpleGrid className="evidence-query-fields local-product-fields" cols={{ base: 1, md: 3 }}>
          <TextInput required label="Product description" placeholder="Apple iPhone 13 128GB" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
          <TextInput required label="HS code" placeholder="851713" value={hsCode} onChange={(event) => setHsCode(event.currentTarget.value)} />
          <Select clearable searchable label="Product type" placeholder="Auto-detect or select" data={productTypes} value={productType} onChange={setProductType} />
          <TextInput label="Brand" placeholder="Apple" value={brand} onChange={(event) => setBrand(event.currentTarget.value)} />
          <TextInput label="Exact model" placeholder="iPhone 13" value={model} onChange={(event) => setModel(event.currentTarget.value)} />
          <TextInput label="Variant / specification" placeholder="128GB" value={variant} onChange={(event) => setVariant(event.currentTarget.value)} />
        </SimpleGrid>
        <Box className="form-section-heading"><Text className="eyebrow">STEP 2 · COMPARISON RULES</Text><Title order={2} size="h3">Set the comparison criteria</Title><Text size="sm" c="dimmed" mt={4}>Separate condition and price type before assessing quality and outliers.</Text></Box>
        <SimpleGrid cols={{ base: 1, md: 3 }}>
          <Select label="Condition pool" data={conditions} value={condition} onChange={(value) => setCondition(value ?? "New")} allowDeselect={false} />
          <Select label="Price type" data={priceTypes} value={priceType} onChange={(value) => setPriceType(value ?? "Retail")} allowDeselect={false} />
          <Select label="Outlier method" data={outlierMethods} value={outlierMethod} onChange={(value) => setOutlierMethod(value ?? "Iqr")} allowDeselect={false} />
          <NumberInput label="Relevance threshold" min={0} max={100} value={threshold} onChange={setThreshold} suffix=" / 100" />
          <NumberInput label="Maximum listing age" min={1} max={3650} value={maximumAgeDays} onChange={setMaximumAgeDays} suffix=" days" />
          <Switch mt="xl" checked={includeOutliers} onChange={(event) => setIncludeOutliers(event.currentTarget.checked)} label="Include flagged outliers in representative statistics" />
        </SimpleGrid>
        <Box className="local-market-sources"><Text size="sm" fw={600} mb="xs">Marketplaces</Text><Text size="xs" c="dimmed" mb="sm">Select the sources that should contribute evidence to this review.</Text><SimpleGrid cols={{ base: 1, sm: 3 }}>{providerChoices.map((provider) => <Paper key={provider.id} withBorder p="sm" radius="md" className="local-market-source"><Checkbox checked={selectedSources.includes(provider.id)} onChange={(event) => toggleSource(provider.id, event.currentTarget.checked)} label={<><Text size="sm" fw={600}>{provider.label}</Text><Text size="xs" c="dimmed">{provider.description}</Text></>} /></Paper>)}</SimpleGrid></Box>
        <Group justify="flex-end" className="data-actions"><Button type="button" variant="subtle" disabled={busyAction !== null} onClick={clearSearch}>Clear search</Button><Button type="button" variant="outline" disabled={busyAction !== null} onClick={() => void loadPrices("sync")}>{busyAction === "sync" ? "Saving clean evidence…" : "Save clean evidence"}</Button><Button type="submit" disabled={busyAction !== null}>{busyAction === "search" ? "Fetching and classifying…" : "Analyze live results"}</Button></Group>
      </Stack></Paper>

      <FeedbackToast error={error} success={notice} onDismissError={() => setError("")} onDismissSuccess={() => setNotice("")} />
      {!data && !busyAction && !error && <DataState kind="empty" title="Your evidence review starts with a search" description="Choose a product and marketplaces above to review comparable listings and their classification."/>}
      {busyAction && <DataState kind="loading" title={busyAction === "sync" ? "Saving local evidence" : "Analyzing local listings"} description="Collecting marketplace listings, checking product matches and calculating statistics. Results will appear when analysis completes."/>}

      {!busyAction && data && analysis && <>
        <SimpleGrid cols={{ base: 1, md: 3 }}>
          <Paper withBorder radius="lg" p="lg" className="representative-price"><Text size="sm" opacity={0.8}>Representative Local Market Price</Text><Title order={2} mt="xs">{money(analysis.representativePrice.value)}</Title><Text size="sm" mt="xs">Median of {analysis.representativePrice.comparableListings} comparable listings {analysis.representativePrice.excludesOutliers ? "after excluding flagged outliers" : "including flagged outliers"}.</Text></Paper>
          <Paper withBorder radius="lg" p="lg"><Group justify="space-between"><Box><Text size="sm" c="dimmed">Confidence</Text><Title order={2}>{analysis.confidence.level.replace("_", " ")}</Title></Box><Badge size="xl" variant="light" color={analysis.confidence.level === "HIGH" ? "green" : analysis.confidence.level === "MEDIUM" ? "yellow" : "red"}>{analysis.confidence.score}/100</Badge></Group><Text size="xs" c="dimmed" mt="md">Decision-support indicator—not a legally authoritative Customs value.</Text></Paper>
          <Paper withBorder radius="lg" p="lg"><Text size="sm" c="dimmed">Comparable pool</Text><Title order={2}>{analysis.collection.validObservations} of {analysis.collection.rawListings}</Title><Text size="sm" mt="xs">Condition: {analysis.product.condition} · Price type: {analysis.product.priceType} · Threshold: {analysis.relevanceThreshold}/100</Text></Paper>
        </SimpleGrid>

        <Paper withBorder radius="lg" p="lg"><Title order={2} size="h3" mb="md">Data quality</Title><SimpleGrid cols={{ base: 2, sm: 4, lg: 7 }}>{qualityCards.map((card) => <Paper key={card.label} component="button" type="button" aria-pressed={observationFilter === card.filter} withBorder radius="md" p="md" onClick={() => setObservationFilter(card.filter)} style={{ cursor: "pointer", textAlign: "left", borderColor: observationFilter === card.filter ? "var(--mantine-color-blue-6)" : undefined }}><Text size="xs" c="dimmed" tt="uppercase" fw={700}>{card.label}</Text><Text size="xl" fw={800} c={card.color}>{card.value}</Text></Paper>)}</SimpleGrid><Text size="xs" c="dimmed" mt="sm">Select a category to inspect every underlying listing and its classification reason.</Text></Paper>

        {stats && <Paper withBorder radius="lg" p="lg"><Group justify="space-between" mb="md"><Box><Title order={2} size="h3">Supporting statistics</Title><Text size="sm" c="dimmed">{includeOutliers ? "Comparable observations including potential outliers" : "Robust pool excluding potential outliers"}</Text></Box><Badge variant="light">{analysis.outlierMethod.toUpperCase()}</Badge></Group><SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }}>{[["Minimum", money(stats.minimum)], ["Maximum", money(stats.maximum)], ["Mean", money(stats.mean)], ["Median", money(stats.median)], ["Std. deviation", money(stats.populationStandardDeviation)], ["Q1 / 25th", money(stats.q1)], ["Q3 / 75th", money(stats.q3)], ["IQR", money(stats.iqr)], ["Observations", stats.count.toString()], ["Date range", `${new Date(stats.oldestObservation).toLocaleDateString()} – ${new Date(stats.newestObservation).toLocaleDateString()}`]].map(([label, value]) => <Paper key={label} className="data-metric" radius="md" p="md"><Text size="xs" c="dimmed" tt="uppercase" fw={700}>{label}</Text><Text fw={700} mt={4}>{value}</Text></Paper>)}</SimpleGrid></Paper>}

        <SimpleGrid cols={{ base: 1, md: data.sources.length }}>{data.sources.map((source) => <Paper key={source.id} withBorder radius="lg" p="md"><Group justify="space-between"><Box><Text fw={700}>{source.name}</Text><Text size="xs" c="dimmed">{source.resultCount} fetched</Text></Box><Badge color={source.status === "Available" ? "green" : "yellow"}>{source.status === "PartnerAccessRequired" ? "Partner access" : source.status}</Badge></Group>{source.message && <Text size="sm" c="dimmed" mt="sm">{source.message}</Text>}<Anchor href={source.websiteUrl} target="_blank" size="xs">Source website</Anchor></Paper>)}</SimpleGrid>

        <Paper className="data-results" withBorder radius="lg" style={{ overflow: "hidden" }}>
          <Group justify="space-between" p="md"><Box><Title order={2} size="h3">Underlying observations</Title><Text size="sm" c="dimmed">Showing {visibleObservations.length} records · nothing is silently deleted</Text></Box><Group><Select w={220} data={[{ value: "ALL", label: "All classifications" }, { value: "USED", label: "Used in statistics" }, { value: "EXCLUDED", label: "All excluded" }, ...Array.from(new Set(analysis.observations.map((item) => item.status))).map((status) => ({ value: status, label: labelStatus(status) }))]} value={observationFilter} onChange={(value) => setObservationFilter((value ?? "ALL") as ObservationFilter)} /><TextInput placeholder="Filter seller" value={sellerFilter} onChange={(event) => setSellerFilter(event.currentTarget.value)} />{(observationFilter !== "ALL" || sellerFilter) && <Button variant="subtle" onClick={() => { setObservationFilter("ALL"); setSellerFilter(""); }}>Clear filters</Button>}</Group></Group>
          {reviewing && <Paper m="md" p="md" withBorder radius="md" bg="blue.0"><Text fw={700}>Review: {reviewing.listing.title}</Text><SimpleGrid cols={{ base: 1, md: 3 }} mt="sm"><Select label="Decision" data={["Approved", "Rejected", "ConfirmedOutlier"]} value={reviewDecision} onChange={(value) => setReviewDecision(value ?? "Approved")} /><Textarea label="Review note (optional)" placeholder="Optionally explain why this observation should be included or excluded" value={reviewJustification} onChange={(event) => setReviewJustification(event.currentTarget.value)} /><Group align="flex-end"><Button loading={reviewBusy} onClick={() => void submitReview()}>Save audited review</Button><Button variant="subtle" onClick={() => setReviewing(null)}>Cancel</Button></Group></SimpleGrid></Paper>}
          <Box style={{ overflowX: "auto" }}><Table striped highlightOnHover verticalSpacing="md"><Table.Thead><Table.Tr><Table.Th>Listing</Table.Th><Table.Th>Price</Table.Th><Table.Th>Match</Table.Th><Table.Th>Status</Table.Th><Table.Th>Reason</Table.Th><Table.Th>Review</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{visibleObservations.map((item) => <Table.Tr key={item.id}><Table.Td><Anchor href={item.listing.url} target="_blank" fw={600} size="sm">{item.listing.title}</Anchor><Text size="xs" c="dimmed">{item.listing.source} · {item.listing.seller ?? "Seller unavailable"} · {item.listing.condition}</Text></Table.Td><Table.Td><Text fw={700}>{money(item.listing.price)}</Text>{item.originalQuantity > 1 && <Text size="xs" c="dimmed">{money(item.normalizedUnitPrice)} / piece</Text>}</Table.Td><Table.Td><Badge variant="light" color={item.relevanceScore >= analysis.relevanceThreshold ? "green" : "red"}>{item.relevanceScore}/100</Badge></Table.Td><Table.Td><Badge color={statusColor(item.status)} variant="light">{labelStatus(item.status)}</Badge></Table.Td><Table.Td maw={340}><Text size="sm">{item.outlierReason ?? item.reason}</Text>{item.excludedKeywords.length > 0 && <Text size="xs" c="red">Detected: {item.excludedKeywords.join(", ")}</Text>}</Table.Td><Table.Td><Button size="xs" variant="subtle" onClick={() => { setReviewing(item); setReviewJustification(""); }}>Review</Button></Table.Td></Table.Tr>)}</Table.Tbody></Table></Box>
          {visibleObservations.length === 0 && <DataState kind="empty" compact title="No matching observations" description="Try another classification or clear the seller filter."/>}
        </Paper>

        <Paper withBorder radius="lg" p="lg"><Title order={2} size="h3">Confidence factors</Title><SimpleGrid cols={{ base: 1, md: 2 }} mt="md">{analysis.confidence.factors.map((factor) => <Box key={factor.name}><Group justify="space-between"><Text fw={600} size="sm">{factor.name}</Text><Text size="sm">{factor.score.toFixed(1)} / {factor.maximum}</Text></Group><Text size="xs" c="dimmed">{factor.explanation}</Text></Box>)}</SimpleGrid></Paper>
        <Alert color="blue" title="Customs decision-support only">This representative price presents market evidence and never automatically becomes the legally applicable Customs value. The Customs Officer remains responsible for the valuation decision.</Alert>
      </>}
    </Stack></Container></Box>
  );
}
