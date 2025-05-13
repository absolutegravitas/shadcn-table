import { db } from "@/db/indexeddb";
import type { Task } from "@/db/indexeddb";
import type { Collection } from "dexie"; // Import Collection
import type { ExtendedColumnFilter } from "@/types/data-table"; // Import ExtendedColumnFilter
import type { FilterItemSchema } from "@/lib/parsers"; // Import FilterItemSchema

import type { GetTasksSchema } from "./validations";

export async function getTasks(
  params: GetTasksSchema
): Promise<{ data: Task[]; pageCount: number; total: number }> {
  console.log("[getTasks] Received params:", JSON.stringify(params, null, 2)); // Log incoming params
  try {
    let collection: Collection<Task, string> = db.tasks.toCollection();
    const initialCollectionCount = await collection.count();
    console.log(
      `[getTasks] Initial count from db.tasks.toCollection(): ${initialCollectionCount}`
    );

    // Helper function to evaluate a single filter condition
    const evaluateFilterCondition = (
      task: Task,
      filter: FilterItemSchema // Explicitly type as FilterItemSchema
    ): boolean => {
      console.log(
        `[Filter Debug] Task ID: ${task.id}, Filter ID: ${filter.id}, Operator: ${filter.operator}, Filter Value:`,
        JSON.stringify(filter.value), // Stringify to see arrays clearly
        ` (Type: ${typeof filter.value})`
      );
      const taskValue = (task as any)[filter.id];
      console.log(
        `[Filter Debug] Task Value for ${filter.id}:`,
        taskValue,
        `(Type: ${typeof taskValue})`
      );
      let filterValue = filter.value;

      // Ensure filterValue is not an empty array for operators not expecting arrays
      if (
        Array.isArray(filterValue) &&
        filterValue.length === 0 &&
        !["inArray", "notInArray", "isBetween"].includes(filter.operator)
      ) {
        filterValue = ""; // Treat empty array as empty string for non-array operators
      }

      let result = false; // Variable to store result before returning
      switch (filter.operator) {
        case "eq":
          result = taskValue === filterValue;
          break;
        case "ne":
          result = taskValue !== filterValue;
          break;
        case "iLike": // case-insensitive contains
          result =
            typeof taskValue === "string" &&
            typeof filterValue === "string" &&
            taskValue.toLowerCase().includes(filterValue.toLowerCase());
          break;
        case "notILike":
          result =
            typeof taskValue === "string" &&
            typeof filterValue === "string" &&
            !taskValue.toLowerCase().includes(filterValue.toLowerCase());
          break;
        case "lt":
          result =
            typeof taskValue === typeof filterValue && taskValue < filterValue;
          break;
        case "lte":
          result =
            typeof taskValue === typeof filterValue && taskValue <= filterValue;
          break;
        case "gt":
          result =
            typeof taskValue === typeof filterValue && taskValue > filterValue;
          break;
        case "gte":
          result =
            typeof taskValue === typeof filterValue && taskValue >= filterValue;
          break;
        case "isBetween":
          if (Array.isArray(filterValue) && filterValue.length === 2) {
            const from = Number(filterValue[0]);
            const to = Number(filterValue[1]);
            if (
              !Number.isNaN(from) &&
              !Number.isNaN(to) &&
              typeof taskValue === "number"
            ) {
              result = taskValue >= from && taskValue <= to;
            } else {
              result = false;
            }
          } else {
            result = false;
          }
          break;
        case "isEmpty":
          result =
            taskValue === null || taskValue === undefined || taskValue === "";
          break;
        case "isNotEmpty":
          result =
            taskValue !== null && taskValue !== undefined && taskValue !== "";
          break;
        case "inArray":
          result =
            Array.isArray(filterValue) && filterValue.includes(taskValue);
          break;
        case "notInArray":
          result =
            Array.isArray(filterValue) && !filterValue.includes(taskValue);
          break;
        default:
          console.warn(
            `[Filter Debug] Unknown filter operator: ${filter.operator} for filter ID: ${filter.id}`
          );
          result = true; // Default to true to not exclude data on unknown operator
      }
      console.log(
        `[Filter Debug] Filter ID: ${filter.id}, Operator: ${filter.operator}, Result: ${result}`
      );
      return result;
    };

    // Apply global title filter
    if (params.title) {
      collection = collection.filter((task) =>
        task.title.toLowerCase().includes(params.title.toLowerCase())
      );
    }

    // Consolidate all filters: from direct params and advanced params.filters
    const allFilters: ExtendedColumnFilter<Task>[] = [
      // Explicitly type allFilters
      ...(params.filters || []),
    ];

    if (params.status && params.status.length > 0) {
      allFilters.push({
        id: "status",
        value: params.status,
        operator: "inArray", // Assuming status filter implies 'inArray'
        variant: "multiSelect", // Matches column definition
        filterId: "status_direct_param", // Synthetic filterId
      });
    }
    if (params.priority && params.priority.length > 0) {
      allFilters.push({
        id: "priority",
        value: params.priority,
        operator: "inArray", // Assuming priority filter implies 'inArray'
        variant: "multiSelect", // Matches column definition
        filterId: "priority_direct_param",
      });
    }
    if (params.estimatedHours && params.estimatedHours.length === 2) {
      // Assuming length 2 for isBetween, could be more robust
      allFilters.push({
        id: "estimatedHours",
        value: params.estimatedHours, // Should be [number, number] due to z.coerce.number()
        operator: "isBetween",
        variant: "range", // Matches column definition
        filterId: "estimatedHours_direct_param",
      });
    }
    if (params.createdAt && params.createdAt.length === 2) {
      allFilters.push({
        id: "createdAt",
        value: params.createdAt, // Should be [number, number] (timestamps)
        operator: "isBetween",
        variant: "dateRange", // Matches column definition
        filterId: "createdAt_direct_param",
      });
    }

    console.log(
      "[getTasks] All effective filters:",
      JSON.stringify(allFilters, null, 2)
    );

    // Apply all consolidated filters
    if (allFilters.length > 0) {
      collection = collection.filter((task) => {
        // For simplicity, direct params are combined with AND logic with params.filters
        // If params.filters had its own joinOperator="or", this simple combination might not be what's always desired.
        // Assuming for now that direct params act as an "AND" group with the advanced "filters" group.
        return allFilters.every((filter) =>
          evaluateFilterCondition(task, filter)
        );
      });
    }

    const countAfterFilters = await collection.count();
    console.log(
      `[getTasks] Count after applying all filters (from collection.count()): ${countAfterFilters}`
    );
    const tasksAfterFiltersArray = await collection.toArray();
    console.log(
      `[getTasks] Count after filters (from toArray().length): ${tasksAfterFiltersArray.length}`
    );

    // Count total after all filters are applied to the collection
    const total = countAfterFilters; // Use the already fetched count

    // Clone the collection before sorting and pagination if sortBy is not used directly
    // or if further operations might modify the original collection reference.
    // However, for sortBy, offset, limit, toArray, Dexie handles this well.

    // Apply sorting
    // Dexie's sortBy is efficient for indexed fields.
    // For dynamic multi-sort or non-indexed fields, fetching then sorting in JS is more flexible.
    let sortedTasks: Task[];
    if (params.sort && params.sort.length > 0) {
      // Primary sort using Dexie if possible (most dominant sort)
      // const primarySort = params.sort[0]; // Not directly used with current JS sort strategy
      let tempCollection = collection;

      // Dexie's sortBy is on the collection and returns a promise of an array
      // It doesn't directly support multi-column sort in a single sortBy call in the way Array.sort does.
      // So, we fetch and then sort in JS for multi-column.

      // const tasksToSort = await tempCollection.toArray(); // Already fetched as tasksAfterFiltersArray
      const tasksToSort = [...tasksAfterFiltersArray]; // Use the array fetched before sorting

      // Apply sorts in reverse order of the array for stable multi-sort effect
      // (if primary sort doesn't fully differentiate, secondary sort kicks in)
      for (let i = params.sort.length - 1; i >= 0; i--) {
        const sortParam = params.sort[i];
        if (sortParam) {
          tasksToSort.sort((a, b) => {
            const valA = (a as any)[sortParam.id];
            const valB = (b as any)[sortParam.id];

            let comparison = 0;
            if (valA === null || valA === undefined)
              comparison = valB === null || valB === undefined ? 0 : -1;
            else if (valB === null || valB === undefined) comparison = 1;
            else if (typeof valA === "string" && typeof valB === "string") {
              comparison = valA.localeCompare(valB);
            } else {
              // numbers, dates (as numbers)
              if (valA < valB) comparison = -1;
              else if (valA > valB) comparison = 1;
            }

            return sortParam.desc ? comparison * -1 : comparison;
          });
        }
      }
      sortedTasks = tasksToSort;
    } else {
      // sortedTasks = await collection.toArray(); // No sort, just get all filtered tasks - already fetched
      sortedTasks = [...tasksAfterFiltersArray];
    }

    // Apply pagination to the JavaScript array
    const page = params.page ?? 1;
    const perPage = params.perPage ?? 10;
    const offset = (page - 1) * perPage;
    const paginatedData = sortedTasks.slice(offset, offset + perPage);

    return {
      data: paginatedData,
      pageCount: Math.ceil(total / perPage),
      total,
    };
  } catch (err) {
    // Changed _err to err to avoid lint warning if used
    console.error("Error fetching tasks:", err);
    return { data: [], pageCount: 0, total: 0 };
  }
}

export async function getTaskStatusCounts(): Promise<
  Record<Task["status"], number>
> {
  try {
    const counts: Record<Task["status"], number> = {
      todo: 0,
      "in-progress": 0,
      done: 0,
      canceled: 0,
    };
    const tasks = await db.tasks.toArray();
    tasks.forEach((task) => {
      if (task.status in counts) {
        counts[task.status] = (counts[task.status] || 0) + 1;
      }
    });
    return counts;
  } catch (_err) {
    console.error("Error fetching task status counts:", _err);
    return {
      todo: 0,
      "in-progress": 0,
      done: 0,
      canceled: 0,
    };
  }
}

export async function getTaskPriorityCounts(): Promise<
  Record<Task["priority"], number>
> {
  try {
    const counts: Record<Task["priority"], number> = {
      low: 0,
      medium: 0,
      high: 0,
    };
    const tasks = await db.tasks.toArray();
    tasks.forEach((task) => {
      if (task.priority in counts) {
        counts[task.priority] = (counts[task.priority] || 0) + 1;
      }
    });
    return counts;
  } catch (_err) {
    console.error("Error fetching task priority counts:", _err);
    return {
      low: 0,
      medium: 0,
      high: 0,
    };
  }
}

export async function getEstimatedHoursRange(): Promise<{
  min: number;
  max: number;
}> {
  try {
    const tasks = await db.tasks.toArray();
    if (tasks.length === 0) {
      return { min: 0, max: 0 };
    }
    const estimatedHours = tasks.map((task: Task) => task.estimatedHours ?? 0); // Explicitly type task
    const min = Math.min(...estimatedHours);
    const max = Math.max(...estimatedHours);
    return { min, max };
  } catch (_err) {
    console.error("Error fetching estimated hours range:", _err);
    return { min: 0, max: 0 };
  }
}
