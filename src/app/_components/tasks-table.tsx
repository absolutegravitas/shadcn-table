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
import {
  getEstimatedHoursRange,
  getTaskPriorityCounts,
  getTaskStatusCounts,
  getTasks,
} from "../_lib/queries"; // Keep imports for client-side fetching
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

  const [rowAction, setRowAction] =
    React.useState<DataTableRowAction<Task> | null>(null);

  const debouncedFetchData = useDebouncedCallback(async () => {
    setIsLoading(true);
    try {
      const [
        tasksResult,
        statusCountsResult,
        priorityCountsResult,
        estimatedHoursRangeResult,
      ] = await Promise.all([
        getTasks(), // Call simplified getTasks
        getTaskStatusCounts(),
        getTaskPriorityCounts(),
        getEstimatedHoursRange(),
      ]);

      setData(tasksResult.data);
      // TanStack Table will handle pagination, so pageCount is based on total data
      setPageCount(Math.ceil(tasksResult.data.length / searchParams.perPage));
      setStatusCounts(statusCountsResult);
      setPriorityCounts(priorityCountsResult);
      setEstimatedHoursRange(estimatedHoursRangeResult);
    } catch (error) {
      console.error("Error fetching data:", error);
      // Handle error state
    } finally {
      setIsLoading(false);
    }
  }, 500); // Debounce with a default of 500ms

  React.useEffect(() => {
    debouncedFetchData();
  }, [searchParams, debouncedFetchData]); // Refetch data when searchParams change or debounced function changes

  const columns = React.useMemo(
    () =>
      getTasksTableColumns({
        statusCounts,
        priorityCounts,
        estimatedHoursRange,
        setRowAction,
      }),
    [statusCounts, priorityCounts, estimatedHoursRange]
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
        onSuccess={() => rowAction?.row.toggleSelected(false)}
      />
    </>
  );
}
