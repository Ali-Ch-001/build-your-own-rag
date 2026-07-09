import { LoadingGrid, PageHeader, Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div>
      <PageHeader eyebrow="Loading" title="Preparing workspace" description="Retrieving Atlas RAG control-plane state." />
      <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
        <LoadingGrid />
        <Skeleton className="h-80 w-full" />
      </div>
    </div>
  );
}
