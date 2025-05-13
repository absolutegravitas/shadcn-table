"use client";

import type { Task } from "@/db/indexeddb";
import type {
  DataTableRowAction,
  ExtendedColumnFilter,
} from "@/types/data-table";
import type { SearchParams } from "@/types";
import * as React from "react";

import { DataTable } from "@/components/data-table/data-table";
import { useDataTable } from "@/hooks/use-data-table";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback"; // Import useDebouncedCallback

import { DataTableAdvancedToolbar } from "@/components/data-table/data-table-advanced-toolbar";
import { DataTableFilterList } from "@/components/data-table/data-table-filter-list";
import { DataTableFilterMenu } from "@/components/data-table/data-table-filter-menu";
import { DataTableSortList } from "@/components/data-table/data-table-sort-list";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"; // Import skeleton
import { db } from "@/db/indexeddb"; // Import Dexie db instance
import {
  getEstimatedHoursRange,
  getTaskPriorityCounts,
  getTaskStatusCounts,
  getTasks, // This is the client-side getTasks from queries.ts (reads from IDB)
} from "../_lib/queries";
import { getAllTasksFromKV } from "../_lib/actions"; // Import new server action
import { DeleteTasksDialog } from "./delete-tasks-dialog";
import { useFeatureFlags } from "./feature-flags-provider";
import { TasksTableActionBar } from "./tasks-table-action-bar";
import { getTasksTableColumns } from "./tasks-table-columns";
import { UpdateTaskSheet } from "./update-task-sheet";

import type { GetTasksSchema } from "../_lib/validations"; // Import GetTasksSchema

interface TasksTableProps {
  searchParams: GetTasksSchema; // Use GetTasksSchema for the prop type
}

export function TasksTable({ searchParams }: TasksTableProps) {
  const { enableAdvancedFilter, filterFlag } = useFeatureFlags();

  const [data, setData] = React.useState<Task[]>([]);
  const [pageCount, setPageCount] = React.useState(0);
  const [statusCounts, setStatusCounts] = React.useState<
    Record<Task["status"], number>
  >({ todo: 0, "in-progress": 0, done: 0, canceled: 0 });
  const [priorityCounts, setPriorityCounts] = React.useState<
    Record<Task["priority"], number>
  >({ low: 0, medium: 0, high: 0 });
  const [estimatedHoursRange, setEstimatedHoursRange] = React.useState({
    min: 0,
    max: 0,
  });
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSyncing, setIsSyncing] = React.useState(true); // For initial KV to IDB sync

  const [rowAction, setRowAction] =
    React.useState<DataTableRowAction<Task> | null>(null);

  // This function fetches data from IndexedDB based on current searchParams
  const fetchFromIndexedDB = React.useCallback(async () => {
    console.log(
      "[TasksTable] fetchFromIndexedDB called with searchParams:",
      JSON.stringify(searchParams, null, 2)
    );
    setIsLoading(true);
    try {
      // getTasks from queries.ts reads from IndexedDB and applies filtering/sorting/pagination
      const tasksResult = await getTasks(searchParams);
      const [
        statusCountsResult,
        priorityCountsResult,
        estimatedHoursRangeResult,
      ] = await Promise.all([
        getTaskStatusCounts(), // These can also be refactored to read from IDB if populated
        getTaskPriorityCounts(),
        getEstimatedHoursRange(),
      ]);

      setData(tasksResult.data);
      setPageCount(tasksResult.pageCount); // pageCount from client-side getTasks
      setStatusCounts(statusCountsResult);
      setPriorityCounts(priorityCountsResult);
      setEstimatedHoursRange(estimatedHoursRangeResult);
    } catch (error) {
      console.error("Error fetching data:", error);
      // Handle error state
    } finally {
      setIsLoading(false);
    }
  }, [searchParams]); // Add searchParams to dependency array

  // Effect for initial data sync from KV to IndexedDB
  React.useEffect(() => {
    async function syncKVtoIndexedDB() {
      setIsSyncing(true);
      setIsLoading(true); // Also set general loading true
      try {
        const kvTasksResult = await getAllTasksFromKV();
        if (kvTasksResult.data) {
          await db.tasks.bulkPut(kvTasksResult.data); // Populate/update IndexedDB
          // After syncing, trigger a fetch from IndexedDB to populate the table
          await fetchFromIndexedDB();
        } else if (kvTasksResult.error) {
          console.error("Error syncing KV to IndexedDB:", kvTasksResult.error);
          // Fallback or error display if KV fetch fails
          // For now, try to load from IDB anyway or show error
          await fetchFromIndexedDB(); // Attempt to load from IDB even if KV sync failed
        }
      } catch (error: any) {
        // Catch as 'any' to inspect properties
        console.error("--- Detailed Error in syncKVtoIndexedDB ---");
        console.error("Caught Error Object:", error);
        if (error instanceof Error) {
          console.error("Error Name:", error.name);
          console.error("Error Message:", error.message);
          console.error("Error Stack:", error.stack);
        } else if (typeof error === "object" && error !== null) {
          // Fallback for non-Error objects
          console.error("Error (raw object):", JSON.stringify(error, null, 2));
        }

        // Attempt to log response text if it's a fetch-like error response object
        if (
          error &&
          error.response &&
          typeof error.response.text === "function"
        ) {
          error.response
            .text()
            .then((text: string) => {
              console.error("Error Response Text:", text);
            })
            .catch((textErr: any) => {
              console.error("Error trying to get response text:", textErr);
            });
        }
        console.error("--- End Detailed Error ---");
        // Attempt to load from IDB on any sync error, IDB might have stale data but better than nothing
        await fetchFromIndexedDB();
      } finally {
        setIsSyncing(false);
        // setIsLoading(false); // setIsLoading will be handled by fetchFromIndexedDB
      }
    }
    syncKVtoIndexedDB();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // Debounced fetch from IndexedDB when searchParams change
  const debouncedFetchFromIndexedDB = useDebouncedCallback(
    fetchFromIndexedDB,
    500
  );

  React.useEffect(() => {
    // Don't fetch if initial sync is still happening, unless it's the very first call from sync
    if (!isSyncing) {
      debouncedFetchFromIndexedDB();
    }
  }, [searchParams, isSyncing, debouncedFetchFromIndexedDB]);

  const columns = React.useMemo(
    () =>
      getTasksTableColumns({
        statusCounts,
        priorityCounts,
        estimatedHoursRange,
        setRowAction,
        refreshTableData: fetchFromIndexedDB, // Pass the function here
      }),
    [
      statusCounts,
      priorityCounts,
      estimatedHoursRange,
      setRowAction,
      fetchFromIndexedDB,
    ] // Add dependencies
  );

  const { table, shallow, debounceMs, throttleMs } = useDataTable({
    data,
    columns,
    pageCount,
    enableAdvancedFilter,
    initialState: {
      sorting: searchParams.sort, // Use sort from searchParams
      columnFilters: searchParams.filters, // Use filters from searchParams
      pagination: {
        // Use pagination from searchParams
        pageIndex: searchParams.page - 1,
        pageSize: searchParams.perPage,
      },
      columnPinning: { right: ["actions"] },
    },
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  });

  return (
    <>
      {isLoading ? (
        <DataTableSkeleton
          columnCount={7}
          filterCount={2}
          cellWidths={[
            "10rem",
            "30rem",
            "10rem",
            "10rem",
            "6rem",
            "6rem",
            "6rem",
          ]}
          shrinkZero
        />
      ) : (
        <DataTable
          table={table}
          actionBar={<TasksTableActionBar table={table} />}
        >
          {enableAdvancedFilter ? (
            <DataTableAdvancedToolbar table={table}>
              <DataTableSortList table={table} align='start' />
              {filterFlag === "advancedFilters" ? (
                <DataTableFilterList
                  table={table}
                  shallow={shallow}
                  debounceMs={debounceMs}
                  throttleMs={throttleMs}
                  align='start'
                />
              ) : (
                <DataTableFilterMenu
                  table={table}
                  shallow={shallow}
                  debounceMs={debounceMs}
                  throttleMs={throttleMs}
                />
              )}
            </DataTableAdvancedToolbar>
          ) : (
            <DataTableToolbar table={table}>
              <DataTableSortList table={table} align='end' />
            </DataTableToolbar>
          )}
        </DataTable>
      )}
      <UpdateTaskSheet
        open={rowAction?.variant === "update"}
        onOpenChange={() => setRowAction(null)}
        task={rowAction?.row.original ?? null}
      />
      <DeleteTasksDialog
        open={rowAction?.variant === "delete"}
        onOpenChange={() => setRowAction(null)}
        tasks={rowAction?.row.original ? [rowAction?.row.original] : []}
        showTrigger={false}
        onSuccess={() => {
          // First, ensure row selection is cleared if the row still exists in the table's context
          // This might be less relevant if fetchFromIndexedDB causes a full re-render with new row objects
          rowAction?.row.toggleSelected(false);
          // Then, refresh the table data from IndexedDB
          fetchFromIndexedDB();
        }}
      />
    </>
  );
}
