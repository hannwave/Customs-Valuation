import { AuditHistory } from "@/components/AuditHistory";

export default async function CaseHistoryPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return <AuditHistory caseId={caseId} />;
}
