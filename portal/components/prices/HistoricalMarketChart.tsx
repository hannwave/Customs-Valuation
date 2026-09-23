"use client";
import { Box, Group, Text } from "@mantine/core";

export type HistoricalRow = { date: string; internationalPrice: number | null; localPrice: number | null; difference: number | null; percentageDifference: number | null; countryCount: number; localCount: number };
const series = [
  { field: "internationalPrice" as const, label: "International Market", color: "#2563eb" },
  { field: "localPrice" as const, label: "Local Market", color: "#059669" },
];

export function HistoricalMarketChart({ rows }: { rows: HistoricalRow[] }) {
  const values = rows.flatMap(row => [row.internationalPrice, row.localPrice]).filter((x): x is number => x !== null);
  const minimum = values.length ? Math.min(...values) * .95 : 0;
  const maximum = values.length ? Math.max(...values) * 1.05 : 1;
  const x = (index: number) => 85 + index / Math.max(rows.length - 1, 1) * 850;
  const y = (value: number) => 285 - (value - minimum) / Math.max(maximum - minimum, 1) * 235;
  return <Box>
    <Group justify="center" gap="xl" mb="sm">{series.map(s => <Text key={s.field} size="sm" c={s.color} fw={600}>● {s.label}</Text>)}</Group>
    <svg viewBox="0 0 980 330" role="img" aria-label="International Market and Local Market daily prices in ETB. Missing observations break the lines." style={{ width: "100%", minHeight: 230 }}>
      <text x="10" y="22" fontSize="12" fill="#64748b">ETB</text>
      {[0, 1, 2, 3, 4].map(i => { const value = minimum + (maximum - minimum) * i / 4; return <g key={i}><line x1="85" x2="935" y1={y(value)} y2={y(value)} stroke="#e2e8f0" /><text x="75" y={y(value) + 4} textAnchor="end" fontSize="12" fill="#64748b">{values.length ? Math.round(value).toLocaleString() : "—"}</text></g>; })}
      {series.map(s => {
        let connected = false;
        const path = rows.map((r, i) => { const value = r[s.field]; if (value === null) { connected = false; return ""; } const segment = `${connected ? "L" : "M"}${x(i)},${y(value)}`; connected = true; return segment; }).join(" ");
        return <g key={s.field}><path data-series={s.label} d={path} fill="none" stroke={s.color} strokeWidth="2" />{rows.map((r, i) => r[s.field] === null ? null : <circle key={r.date} cx={x(i)} cy={y(r[s.field]!)} r="2.5" fill={s.color}><title>{s.label} · {r.date} · ETB {r[s.field]!.toLocaleString(undefined, { maximumFractionDigits: 2 })}</title></circle>)}</g>;
      })}
      {[0, Math.floor((rows.length - 1) / 2), rows.length - 1].filter((n, i, a) => n >= 0 && a.indexOf(n) === i).map(index => <text key={index} x={x(index)} y="317" textAnchor="middle" fontSize="12" fill="#64748b">{rows[index].date}</text>)}
      {values.length === 0 && <text x="500" y="155" textAnchor="middle" fill="#64748b" fontSize="15">No observations in this date range</text>}
    </svg>
    <Text size="xs" c="dimmed">Points show recorded daily prices. Gaps mean no observation or no same-date exchange rate. Hover over a point for its value.</Text>
  </Box>;
}
