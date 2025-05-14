"use client";

import type { Task } from "@/db/indexeddb";
import type { DataTableRowAction } from "@/types/data-table";
import * as React from "react";
import Fuse from "fuse.js";

import { useDeepCompareEffect } from "@/hooks/use-deep-compare-effect"; // Import the new hook
import { DataTable } from "@/components/data-table/data-table";
import { useDataTable } from "@/hooks/use-data-table";

import { DataTableAdvancedToolbar } from "@/components/data-table/data-table-advanced-toolbar";
import { DataTableFilterList } from "@/components/data-table/data-table-filter-list";
import { DataTableFilterMenu } from "@/components/data-table/data-table-filter-menu";
import { DataTableSortList } from "@/components/data-table/data-table-sort-list";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";

import { DeleteTasksDialog } from "./delete-tasks-dialog";
import { useFeatureFlags } from "./feature-flags-provider";
import { TasksTableActionBar } from "./tasks-table-action-bar";
import {
  getTasksTableColumns,
  type GetTasksTableColumnsProps,
} from "./tasks-table-columns"; // Correctly import props type
import { UpdateTaskSheet } from "./update-task-sheet";

import type { GetTasksSchema } from "../_lib/validations";
import { useTasks } from "@/stores/task-store";

interface TasksTableProps {
  searchParams: GetTasksSchema;
}

export function TasksTable({ searchParams }: TasksTableProps) {
  const { enableAdvancedFilter, filterFlag } = useFeatureFlags();

  const {
    allTasks,
    isLoadingAllTasks,
    errorLoadingAllTasks,
    fetchAllTasksFromServer,
  } = useTasks();

  const [displayedTasks, setDisplayedTasks] = React.useState<Task[]>([]);
  const [rowAction, setRowAction] =
    React.useState<DataTableRowAction<Task> | null>(null);

  // Client-side calculation for faceted data
  const facetedData = React.useMemo((): Pick<
    GetTasksTableColumnsProps,
    "statusCounts" | "priorityCounts" | "estimatedHoursRange"
  > => {
    const defaultStatusCounts: Record<Task["status"], number> = {
      todo: 0,
      "in-progress": 0,
      done: 0,
      canceled: 0,
    };
    const defaultPriorityCounts: Record<Task["priority"], number> = {
      low: 0,
      medium: 0,
      high: 0,
    };
    const defaultEstimatedHoursRange = { min: 0, max: 0 };

    if (!allTasks || allTasks.length === 0) {
      return {
        statusCounts: defaultStatusCounts,
        priorityCounts: defaultPriorityCounts,
        estimatedHoursRange: defaultEstimatedHoursRange,
      };
    }

    const statusCounts = { ...defaultStatusCounts };
    const priorityCounts = { ...defaultPriorityCounts };
    let minHours = allTasks[0]?.estimatedHours ?? 0;
    let maxHours = allTasks[0]?.estimatedHours ?? 0;

    // Ensure minHours and maxHours are correctly initialized if the first task's estimatedHours is null/undefined
    // by iterating through all tasks to find the initial non-null min/max.
    let firstNonNullHourFound = false;
    for (const task of allTasks) {
      if (task.estimatedHours !== null && task.estimatedHours !== undefined) {
        if (!firstNonNullHourFound) {
          minHours = task.estimatedHours;
          maxHours = task.estimatedHours;
          firstNonNullHourFound = true;
        } else {
          if (task.estimatedHours < minHours) minHours = task.estimatedHours;
          if (task.estimatedHours > maxHours) maxHours = task.estimatedHours;
        }
      }
    }
    // If no tasks have estimated hours, minHours/maxHours will remain 0 or the initial value from the first task if it was 0.
    // If all tasks had null/undefined estimatedHours, and the first task was also null/undefined, min/max remain 0.
    // If allTasks[0].estimatedHours was 0, and all others were null/undefined, min/max remain 0.
    // This logic is fine as the default range is 0-0.

    for (const task of allTasks) {
      if (task.status) {
        statusCounts[task.status] = (statusCounts[task.status] || 0) + 1;
      }
      if (task.priority) {
        priorityCounts[task.priority] =
          (priorityCounts[task.priority] || 0) + 1;
      }
      // Min/max already calculated in the loop above if firstNonNullHourFound was true.
      // If firstNonNullHourFound remained false (all estimatedHours were null/undefined),
      // minHours and maxHours are correctly 0.
    }

    return {
      statusCounts,
      priorityCounts,
      estimatedHoursRange: { min: minHours, max: maxHours },
    };
  }, [allTasks]);

  // Client-side filtering and sorting logic
  useDeepCompareEffect(() => {
    if (!allTasks) {
      setDisplayedTasks([]);
      return;
    }

    let processedTasks = [...allTasks];

    const titleSearch = searchParams.title?.trim().toLowerCase();
    const fuseSearchTerms: string[] = [];
    if (titleSearch) {
      fuseSearchTerms.push(titleSearch);
    }

    const labelFilterInput = Array.isArray(searchParams.filters)
      ? searchParams.filters.find((f) => f.id === "label")?.value
      : undefined;
    const labelSearch =
      typeof labelFilterInput === "string"
        ? labelFilterInput.trim().toLowerCase()
        : undefined;

    if (labelSearch) {
      fuseSearchTerms.push(labelSearch);
    }

    if (fuseSearchTerms.length > 0 && processedTasks.length > 0) {
      const fuse = new Fuse(processedTasks, {
        keys: ["title", "label", "code"],
        threshold: 0.3,
        // For multiple terms, Fuse's default is OR. If AND is needed, apply iteratively or use extended search.
        // This example will effectively OR search if both title and label terms are present.
        // To AND, you'd filter once, then filter the results again.
      });
      // A simple approach for now: if titleSearch exists, it's the primary Fuse search.
      // If you want to combine multiple fuse terms (e.g. title AND label), this needs more complex logic.
      if (titleSearch) {
        // This prioritizes title search if present
        processedTasks = fuse.search(titleSearch).map((result) => result.item);
        // If labelSearch also exists and you want to AND it:
        if (labelSearch && processedTasks.length > 0) {
          const labelFuse = new Fuse(processedTasks, {
            keys: ["label"],
            threshold: 0.3,
          });
          processedTasks = labelFuse
            .search(labelSearch)
            .map((result) => result.item);
        }
      } else if (labelSearch) {
        // Only label search
        processedTasks = fuse.search(labelSearch).map((result) => result.item);
      }
    }

    const {
      status,
      priority,
      estimatedHours,
      createdAt,
      filters: advancedFiltersFromParams = [],
    } = searchParams;

    const statusFilterValues = statusParamsToArray(
      status,
      advancedFiltersFromParams
    );
    if (statusFilterValues.length > 0) {
      processedTasks = processedTasks.filter((task) =>
        statusFilterValues.includes(task.status)
      );
    }

    const priorityFilterValues = priorityParamsToArray(
      priority,
      advancedFiltersFromParams
    );
    if (priorityFilterValues.length > 0) {
      processedTasks = processedTasks.filter((task) =>
        priorityFilterValues.includes(task.priority)
      );
    }

    const ehRange = rangeParamsToArray(
      estimatedHours,
      advancedFiltersFromParams,
      "estimatedHours"
    );
    if (ehRange) {
      processedTasks = processedTasks.filter(
        (task) =>
          task.estimatedHours >= ehRange.min &&
          task.estimatedHours <= ehRange.max
      );
    }

    const caRange = dateRangeParamsToArray(
      createdAt,
      advancedFiltersFromParams,
      "createdAt"
    );
    if (caRange) {
      processedTasks = processedTasks.filter((task) => {
        const taskDate = new Date(task.createdAt).getTime();
        return (
          taskDate >= caRange.min.getTime() && taskDate <= caRange.max.getTime()
        );
      });
    }

    setDisplayedTasks(processedTasks);
  }, [allTasks, searchParams]);

  const statusParamsToArray = (
    direct: string[] | undefined,
    advanced: GetTasksSchema["filters"]
  ): Task["status"][] => {
    const values = new Set<Task["status"]>();
    if (direct) direct.forEach((s) => values.add(s as Task["status"]));
    if (Array.isArray(advanced)) {
      advanced.forEach((f) => {
        if (
          f.id === "status" &&
          f.operator === "inArray" &&
          Array.isArray(f.value)
        ) {
          f.value.forEach((v) => values.add(v as Task["status"]));
        }
      });
    }
    return Array.from(values);
  };

  const priorityParamsToArray = (
    direct: string[] | undefined,
    advanced: GetTasksSchema["filters"]
  ): Task["priority"][] => {
    const values = new Set<Task["priority"]>();
    if (direct) direct.forEach((s) => values.add(s as Task["priority"]));
    if (Array.isArray(advanced)) {
      advanced.forEach((f) => {
        if (
          f.id === "priority" &&
          f.operator === "inArray" &&
          Array.isArray(f.value)
        ) {
          f.value.forEach((v) => values.add(v as Task["priority"]));
        }
      });
    }
    return Array.from(values);
  };

  const rangeParamsToArray = (
    direct: number[] | undefined,
    advanced: GetTasksSchema["filters"],
    id: string
  ): { min: number; max: number } | null => {
    let arr: (string | number)[] | undefined | unknown = direct;
    // Ensure arr is an array before checking its length
    if (!Array.isArray(arr) || arr.length !== 2) {
      const adv = Array.isArray(advanced)
        ? advanced.find(
            (f) =>
              f.id === id &&
              f.operator === "isBetween" &&
              Array.isArray(f.value) &&
              f.value.length === 2
          )
        : undefined;
      if (adv && Array.isArray(adv.value)) arr = adv.value;
    }
    if (Array.isArray(arr) && arr.length === 2) {
      const min = Number(arr[0]);
      const max = Number(arr[1]);
      if (!isNaN(min) && !isNaN(max)) return { min, max };
    }
    return null;
  };

  const dateRangeParamsToArray = (
    direct: (string | number)[] | undefined,
    advanced: GetTasksSchema["filters"],
    id: string
  ): { min: Date; max: Date } | null => {
    let arr: (string | number | Date)[] | undefined | unknown = direct;
    if (!Array.isArray(arr) || arr.length !== 2) {
      const adv = Array.isArray(advanced)
        ? advanced.find(
            (f) =>
              f.id === id &&
              f.operator === "isBetween" &&
              Array.isArray(f.value) &&
              f.value.length === 2
          )
        : undefined;
      if (adv && Array.isArray(adv.value)) arr = adv.value;
    }
    if (
      Array.isArray(arr) &&
      arr.length === 2 &&
      arr[0] !== undefined &&
      arr[1] !== undefined
    ) {
      try {
        const min = new Date(arr[0] as string | number | Date);
        const max = new Date(arr[1] as string | number | Date);
        if (!isNaN(min.getTime()) && !isNaN(max.getTime())) return { min, max };
      } catch (e) {
        /* ignore */
      }
    }
    return null;
  };

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

  const calculatedPageCount = Math.ceil(
    displayedTasks.length / (searchParams.perPage ?? 10)
  );

  const initialTableState = React.useMemo(() => {
    return {
      sorting: searchParams.sort,
      columnFilters: searchParams.filters,
      pagination: {
        pageIndex: searchParams.page - 1,
        pageSize: searchParams.perPage,
      },
      columnPinning: { right: ["actions"] },
    };
  }, [
    searchParams.sort,
    searchParams.filters,
    searchParams.page,
    searchParams.perPage,
  ]);

  const { table, shallow, debounceMs, throttleMs } = useDataTable({
    data: displayedTasks,
    columns,
    pageCount: calculatedPageCount,
    enableAdvancedFilter,
    initialState: initialTableState,
    getRowId: (originalRow) => originalRow.id,
    // These will be set to false in use-data-table.ts hook for client-side processing
    // manualFiltering: false,
    // manualSorting: false,
    // manualPagination: false,
    shallow: false,
    clearOnDefault: true,
  });

  if (errorLoadingAllTasks && (!allTasks || allTasks.length === 0)) {
    return (
      <div className='text-red-500 p-4'>
        Error loading tasks: {errorLoadingAllTasks}
      </div>
    );
  }

  return (
    <>
      {isLoadingAllTasks && displayedTasks.length === 0 ? (
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
        // onSuccess should ideally call fetchAllTasksFromServer or a more targeted update in the store
      />
      <DeleteTasksDialog
        open={rowAction?.variant === "delete"}
        onOpenChange={() => setRowAction(null)}
        tasks={rowAction?.row.original ? [rowAction?.row.original] : []}
        showTrigger={false}
        onSuccess={() => {
          if (rowAction?.row.original?.id) {
            // Ensure id exists
            // TODO: Implement optimistic update or more specific removal from `allTasks` in store
          }
          rowAction?.row.toggleSelected(false);
          fetchAllTasksFromServer();
        }}
      />
    </>
  );
}
