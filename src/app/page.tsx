import type { SearchParams } from "@/types";
import * as React from "react";

import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import { Shell } from "@/components/shell";

import { FeatureFlagsProvider } from "./_components/feature-flags-provider";
import { TasksTable } from "./_components/tasks-table";
import { searchParamsCache } from "./_lib/validations";

interface IndexPageProps {
  searchParams: Promise<SearchParams>;
}

export default async function IndexPage(props: IndexPageProps) {
  const searchParams = await props.searchParams;
  const search = searchParamsCache.parse(searchParams);

  return (
    <Shell className='gap-2'>
      <FeatureFlagsProvider>
        {/* Data fetching is now handled client-side within TasksTable */}
        <TasksTable searchParams={search} />
      </FeatureFlagsProvider>
    </Shell>
  );
}
