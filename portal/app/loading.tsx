import { PageSkeleton } from "@/components/PageSkeleton";

/** Shown inside the workspace frame as soon as a link is clicked, while the next page loads. */
export default function Loading() {
  return <PageSkeleton />;
}
