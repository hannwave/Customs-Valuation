import { PageSkeleton } from "@/components/PageSkeleton";

/** Shown inside the importer portal frame while the next portal page loads. */
export default function Loading() {
  return <PageSkeleton variant="table" label="Loading portal page" />;
}
