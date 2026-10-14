import { officerStatus } from "@/lib/officer-case";

export function StatusBadge({ status }: { status: string }) {
  const meta = officerStatus[status] ?? { label: status.replaceAll("_", " ").toLowerCase(), tone: "neutral" };
  return <span className={`oc-pill is-${meta.tone}`}>{meta.label}</span>;
}
