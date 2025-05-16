"use client";

import type { Task } from "@/db/indexeddb";
import type { DataTableRowAction } from "@/types/data-table";
import * as React from "react";
import Fuse from "fuse.js";
import debounce from "lodash/debounce";

import { DataTable } from "@/components/data-table/data-table";
import { useDataTable } from "@/hooks/use-data-table";
import { DataTableAdvancedToolbar } from "@/components/data-table/data-table-advanced-toolbar";
import { DataTableFilterList } from "@/components/data-table/data-table-filter-list";
import { DataTableSortList } from "@/components/data-table/data-table-sort-list";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";

import { DeleteTasksDialog } from "./delete-tasks-dialog";
import { useFeatureFlags } from "./feature-flags-provider";
import { TasksTableActionBar } from "./tasks-table-action-bar";
import { getTasksTableColumns } from "./tasks-table-columns";
import { UpdateTaskSheet } from "./update-task-sheet";

import type { GetTasksSchema } from "../_lib/validations";
import { useTasks } from "@/stores/task-store";

interface TasksTableProps {
  searchParams: GetTasksSchema;
}

const DEBOUNCE_SEARCH_MS = 150;
const PAGE_SIZE = 50;

type StatusType = "todo" | "in-progress" | "done" | "canceled";
type PriorityType = "high" | "medium" | "low";

const createSearchIndex = (tasks: Task[]): Fuse<Task> | null => {
  if (typeof window === "undefined") return null;
  return new Fuse(tasks, {
    keys: ["title", "label", "code"],
    threshold: 0.3,
    distance: 100,
    minMatchCharLength: 2,
  });
};

export function TasksTable({ searchParams }: TasksTableProps) {
  const { enableAdvancedFilter } = useFeatureFlags();
  const {
    allTasks,
    isLoadingAllTasks,
    errorLoadingAllTasks,
    fetchAllTasksFromServer,
  } = useTasks();

  const [displayedTasks, setDisplayedTasks] = React.useState<Task[]>([]);
  const [rowAction, setRowAction] =
    React.useState<DataTableRowAction<Task> | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");

  // Update displayed tasks when allTasks changes
  React.useEffect(() => {
    if (allTasks?.length) {
      console.log(`Setting displayed tasks: ${allTasks.length} tasks`);
      setDisplayedTasks(allTasks);
    } else {
      setDisplayedTasks([]);
    }
  }, [allTasks]);

  // Calculate faceted data for columns
  const facetedData = React.useMemo(() => {
    const emptyFacets = {
      statusCounts: {
        todo: 0,
        "in-progress": 0,
        done: 0,
        canceled: 0,
      } as Record<StatusType, number>,
      priorityCounts: {
        low: 0,
        medium: 0,
        high: 0,
      } as Record<PriorityType, number>,
      estimatedHoursRange: { min: 0, max: 0 },
    };

    if (!allTasks?.length) return emptyFacets;

    return allTasks.reduce(
      (acc, task) => {
        // Status counts
        if (task.status) {
          acc.statusCounts[task.status as StatusType] =
            (acc.statusCounts[task.status as StatusType] || 0) + 1;
        }

        // Priority counts
        if (task.priority) {
          acc.priorityCounts[task.priority as PriorityType] =
            (acc.priorityCounts[task.priority as PriorityType] || 0) + 1;
        }

        // Estimated hours range
        if (task.estimatedHours != null) {
          acc.estimatedHoursRange.min = Math.min(
            acc.estimatedHoursRange.min,
            task.estimatedHours
          );
          acc.estimatedHoursRange.max = Math.max(
            acc.estimatedHoursRange.max,
            task.estimatedHours
          );
        }

        return acc;
      },
      { ...emptyFacets }
    );
  }, [allTasks]);

  // Memoize table columns
  const columns = React.useMemo(
    () =>
      getTasksTableColumns({
        statusCounts: facetedData.statusCounts,
        priorityCounts: facetedData.priorityCounts,
        estimatedHoursRange: facetedData.estimatedHoursRange,
        setRowAction,
        refreshTableData: fetchAllTasksFromServer,
      }),
    [facetedData, fetchAllTasksFromServer]
  );

  // Table configuration
  const { table } = useDataTable({
    data: displayedTasks,
    columns,
    pageCount: Math.ceil(
      displayedTasks.length / (searchParams.perPage ?? PAGE_SIZE)
    ),
    enableAdvancedFilter,
    initialState: {
      sorting: searchParams.sort,
      columnFilters: searchParams.filters,
      pagination: {
        pageIndex: searchParams.page ? searchParams.page - 1 : 0,
        pageSize: searchParams.perPage ?? PAGE_SIZE,
      },
      columnVisibility: {},
      columnPinning: { right: ["actions"] },
    },
    getRowId: (row) => row.id,
  });

  // Debounced search function
  const debouncedSearch = React.useCallback(
    debounce((query: string, tasks: Task[]) => {
      if (!query.trim()) {
        setDisplayedTasks(tasks);
        return;
      }

      const searchIndex = createSearchIndex(tasks);
      if (!searchIndex) return;

      const results = searchIndex.search(query).map((result) => result.item);

      setDisplayedTasks(results);
    }, DEBOUNCE_SEARCH_MS),
    []
  );

  // Handle search and filter changes
  React.useEffect(() => {
    if (!allTasks?.length) {
      setDisplayedTasks([]);
      return;
    }

    let filteredTasks = allTasks;

    // Apply status filter
    if (searchParams.status?.length) {
      filteredTasks = filteredTasks.filter((task) =>
        searchParams.status.includes(task.status)
      );
    }

    // Apply priority filter
    if (searchParams.priority?.length) {
      filteredTasks = filteredTasks.filter((task) =>
        searchParams.priority.includes(task.priority)
      );
    }

    // Apply search if exists
    if (searchQuery.trim()) {
      debouncedSearch(searchQuery, filteredTasks);
    } else {
      setDisplayedTasks(filteredTasks);
    }

    return () => {
      debouncedSearch.cancel();
    };
  }, [allTasks, searchParams, searchQuery, debouncedSearch]);

  // Error state
  if (errorLoadingAllTasks && (!allTasks || allTasks.length === 0)) {
    return (
      <div className='text-red-500 p-4'>
        Error loading tasks: {errorLoadingAllTasks}
      </div>
    );
  }

  // Loading state
  if (isLoadingAllTasks && displayedTasks.length === 0) {
    return (
      <div className='w-full h-full'>
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
      </div>
    );
  }

  return (
    <div className='h-full flex flex-col'>
      <DataTable table={table}>
        {enableAdvancedFilter ? (
          <DataTableAdvancedToolbar table={table}>
            <DataTableSortList table={table} align='start' />
            <DataTableFilterList table={table} align='start' />
          </DataTableAdvancedToolbar>
        ) : (
          <DataTableToolbar table={table}>
            <DataTableSortList table={table} align='end' />
          </DataTableToolbar>
        )}

        <TasksTableActionBar table={table} />
      </DataTable>

      {rowAction?.variant === "update" && (
        <UpdateTaskSheet
          open={true}
          onOpenChange={() => setRowAction(null)}
          task={rowAction.row.original}
        />
      )}

      {rowAction?.variant === "delete" && (
        <DeleteTasksDialog
          open={true}
          onOpenChange={() => setRowAction(null)}
          tasks={[rowAction.row.original]}
          showTrigger={false}
          onSuccess={() => {
            setRowAction(null);
            fetchAllTasksFromServer();
          }}
        />
      )}
    </div>
  );
}
