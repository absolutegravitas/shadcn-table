import { db } from "@/db/indexeddb";
import type { Task } from "@/db/indexeddb";
import type { Collection } from "dexie"; // Import Collection

import type { GetTasksSchema } from "./validations";

export async function getTasks(): Promise<{ data: Task[]; pageCount: number }> {
  try {
    const data = await db.tasks.toArray(); // Fetch all tasks
    const total = data.length; // Total count is the total number of tasks fetched

    // Since filtering, sorting, and pagination are handled client-side by TanStack Table,
    // we return all data and the total count.
    // The pageCount will be calculated by TanStack Table based on the client-side data and a default perPage (e.g., 10).
    return { data, pageCount: Math.ceil(total / 10) };
  } catch (_err) {
    console.error("Error fetching tasks:", _err);
    return { data: [], pageCount: 0 };
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
