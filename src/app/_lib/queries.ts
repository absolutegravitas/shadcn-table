// src/app/_lib/queries.ts

import { db } from "@/db/indexeddb";
import type { Task } from "@/db/indexeddb";
// ExtendedColumnFilter and FilterItemSchema might be less relevant here if advanced filters are simplified
// or handled differently with Fuse.js. Kept for now.
import type { ExtendedColumnFilter } from "@/types/data-table";
import type { FilterItemSchema } from "@/lib/parsers";
import type { GetTasksSchema } from "./validations";

// This function might be used by client-side Fuse.js or advanced client-side filters
// For server-side Dexie queries, we'll use more direct Dexie methods.
const evaluateFilterCondition = (
  task: Task,
  filter: FilterItemSchema
): boolean => {
  const taskValue = (task as any)[filter.id];
  let filterValue = filter.value;

  if (
    Array.isArray(filterValue) &&
    filterValue.length === 0 &&
    !["inArray", "notInArray", "isBetween"].includes(filter.operator)
  ) {
    filterValue = "";
  }

  let result = false;
  switch (filter.operator) {
    case "eq":
      result = taskValue === filterValue;
      break;
    case "ne":
      result = taskValue !== filterValue;
      break;
    case "iLike":
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
        }
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
      result = Array.isArray(filterValue) && filterValue.includes(taskValue);
      break;
    case "notInArray":
      result = Array.isArray(filterValue) && !filterValue.includes(taskValue);
      break;
    default:
      result = true;
  }
  return result;
};

export async function getTasks(
  params: GetTasksSchema
): Promise<{ data: Task[]; pageCount: number; total: number }> {
  console.log(
    "[getTasks Re-Refactored with Fuse.js strategy] Received params:",
    JSON.stringify(params, null, 2)
  );
  const {
    page = 1,
    perPage = 10,
    sort = [],
    // title parameter is intentionally not destructured here,
    // as it will be handled by Fuse.js on the client-side.
    status: statusParams,
    priority: priorityParams,
    estimatedHours: estimatedHoursParams,
    createdAt: createdAtParams,
    filters: advancedFilters = [],
  } = params;

  try {
    let collection = db.tasks.toCollection();

    // Apply direct indexed filters from params
    if (statusParams && statusParams.length > 0) {
      collection = collection.filter((task) =>
        statusParams.includes(task.status)
      );
    }
    if (priorityParams && priorityParams.length > 0) {
      collection = collection.filter((task) =>
        priorityParams.includes(task.priority)
      );
    }
    if (
      Array.isArray(estimatedHoursParams) &&
      estimatedHoursParams.length === 2
    ) {
      const min = Number(estimatedHoursParams[0]);
      const max = Number(estimatedHoursParams[1]);
      if (!isNaN(min) && !isNaN(max)) {
        collection = collection.filter(
          (task) => task.estimatedHours >= min && task.estimatedHours <= max
        );
      }
    }
    if (Array.isArray(createdAtParams) && createdAtParams.length === 2) {
      const startDateInput = createdAtParams[0];
      const endDateInput = createdAtParams[1];
      if (startDateInput !== undefined && endDateInput !== undefined) {
        try {
          const startDate = new Date(startDateInput);
          const endDate = new Date(endDateInput);
          if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
            collection = collection.filter(
              (task) => task.createdAt >= startDate && task.createdAt <= endDate
            );
          }
        } catch (e) {
          console.warn("Error parsing createdAt in getTasks", e);
        }
      }
    }

    // Apply advancedFilters that target indexed fields
    // Label and Title filters will be handled by Fuse.js on the client side.
    advancedFilters.forEach((advFilter) => {
      if (
        advFilter.id === "status" &&
        advFilter.operator === "inArray" &&
        Array.isArray(advFilter.value)
      ) {
        collection = collection.filter((task) =>
          (advFilter.value as string[]).includes(task.status)
        );
      } else if (
        advFilter.id === "priority" &&
        advFilter.operator === "inArray" &&
        Array.isArray(advFilter.value)
      ) {
        collection = collection.filter((task) =>
          (advFilter.value as string[]).includes(task.priority)
        );
      } else if (
        advFilter.id === "estimatedHours" &&
        advFilter.operator === "isBetween" &&
        Array.isArray(advFilter.value) &&
        advFilter.value.length === 2
      ) {
        const min = Number(advFilter.value[0]);
        const max = Number(advFilter.value[1]);
        if (!isNaN(min) && !isNaN(max)) {
          collection = collection.filter(
            (task) => task.estimatedHours >= min && task.estimatedHours <= max
          );
        }
      } else if (
        advFilter.id === "createdAt" &&
        advFilter.operator === "isBetween" &&
        Array.isArray(advFilter.value) &&
        advFilter.value.length === 2
      ) {
        const startDateInput = advFilter.value[0];
        const endDateInput = advFilter.value[1];
        if (startDateInput !== undefined && endDateInput !== undefined) {
          try {
            const startDate = new Date(
              startDateInput as string | number | Date
            );
            const endDate = new Date(endDateInput as string | number | Date);
            if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
              collection = collection.filter(
                (task) =>
                  task.createdAt >= startDate && task.createdAt <= endDate
              );
            }
          } catch (e) {
            console.warn("Error parsing advanced createdAt filter", e);
          }
        }
      }
    });

    // Fetch the filtered data from Dexie
    let tasksToProcess = await collection.toArray();

    // Total count is based on data after Dexie filters, before client-side Fuse.js
    const total = tasksToProcess.length;

    // Apply JavaScript sorting (as per TanStack Table's manual sorting requirement)
    if (sort && sort.length > 0) {
      for (let i = sort.length - 1; i >= 0; i--) {
        const sortParam = sort[i];
        if (sortParam) {
          tasksToProcess.sort((a, b) => {
            const valA = (a as any)[sortParam.id];
            const valB = (b as any)[sortParam.id];
            let comparison = 0;
            if (valA === null || valA === undefined)
              comparison = valB === null || valB === undefined ? 0 : -1;
            else if (valB === null || valB === undefined) comparison = 1;
            else if (valA instanceof Date && valB instanceof Date)
              comparison = valA.getTime() - valB.getTime();
            else if (typeof valA === "number" && typeof valB === "number")
              comparison = valA - valB;
            else if (typeof valA === "string" && typeof valB === "string")
              comparison = valA.localeCompare(valB);
            else {
              const strA = String(valA).toLowerCase();
              const strB = String(valB).toLowerCase();
              if (strA < strB) comparison = -1;
              else if (strA > strB) comparison = 1;
            }
            return sortParam.desc ? comparison * -1 : comparison;
          });
        }
      }
    } else {
      // Default sort if none provided
      tasksToProcess.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );
    }

    const offset = (page - 1) * perPage;
    const paginatedData = tasksToProcess.slice(offset, offset + perPage);

    console.log(
      `[getTasks Re-Refactored] Returning ${paginatedData.length} tasks for page ${page}. Total matched by Dexie: ${total}`
    );

    return {
      data: paginatedData,
      pageCount: Math.ceil(total / perPage),
      total,
    };
  } catch (err) {
    console.error("[getTasks Re-Refactored] Error fetching tasks:", err);
    return { data: [], pageCount: 0, total: 0 };
  }
}

// Optimized faceted count functions
export async function getTaskStatusCounts(): Promise<
  Record<Task["status"], number>
> {
  try {
    const statuses: Task["status"][] = [
      "todo",
      "in-progress",
      "done",
      "canceled",
    ];
    const countsArray = await Promise.all(
      statuses.map((status) => db.tasks.where("status").equals(status).count())
    );
    const counts: Record<Task["status"], number> = {
      todo: 0,
      "in-progress": 0,
      done: 0,
      canceled: 0,
    };
    statuses.forEach((status, index) => {
      const countValue = countsArray[index];
      if (typeof countValue === "number") {
        counts[status] = countValue;
      } else {
        console.warn(
          `[getTaskStatusCounts] Unexpected non-number count for status ${status}`
        );
        counts[status] = 0;
      }
    });
    return counts;
  } catch (_err) {
    console.error("Error fetching task status counts:", _err);
    return { todo: 0, "in-progress": 0, done: 0, canceled: 0 };
  }
}

export async function getTaskPriorityCounts(): Promise<
  Record<Task["priority"], number>
> {
  try {
    const priorities: Task["priority"][] = ["low", "medium", "high"];
    const countsArray = await Promise.all(
      priorities.map((priority) =>
        db.tasks.where("priority").equals(priority).count()
      )
    );
    const counts: Record<Task["priority"], number> = {
      low: 0,
      medium: 0,
      high: 0,
    };
    priorities.forEach((priority, index) => {
      const countValue = countsArray[index];
      if (typeof countValue === "number") {
        counts[priority] = countValue;
      } else {
        console.warn(
          `[getTaskPriorityCounts] Unexpected non-number count for priority ${priority}`
        );
        counts[priority] = 0;
      }
    });
    return counts;
  } catch (_err) {
    console.error("Error fetching task priority counts:", _err);
    return { low: 0, medium: 0, high: 0 };
  }
}

export async function getEstimatedHoursRange(): Promise<{
  min: number;
  max: number;
}> {
  try {
    const recordCount = await db.tasks.count();
    if (recordCount === 0) {
      return { min: 0, max: 0 };
    }

    const minTask = await db.tasks.orderBy("estimatedHours").first();
    const maxTask = await db.tasks.orderBy("estimatedHours").last();

    return {
      min: minTask?.estimatedHours ?? 0,
      max: maxTask?.estimatedHours ?? 0,
    };
  } catch (_err) {
    console.error("Error fetching estimated hours range:", _err);
    return { min: 0, max: 0 };
  }
}
