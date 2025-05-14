/// <reference lib="webworker" />
import type { Task } from "@/db/indexeddb";

function normalizeTasksForComparison(tasks: Task[]): any[] {
  // Ensure tasks is an array before trying to map/sort
  if (!Array.isArray(tasks)) return [];
  return tasks
    .map((task) => ({
      ...task,
      // Ensure createdAt/updatedAt are valid dates before calling getTime
      createdAt: task.createdAt ? new Date(task.createdAt).getTime() : 0,
      updatedAt: task.updatedAt ? new Date(task.updatedAt).getTime() : 0,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

self.onmessage = (event: MessageEvent<Task[]>) => {
  const tasks = event.data;
  const normalizedTasks = normalizeTasksForComparison(tasks);
  const signature = JSON.stringify(normalizedTasks);
  self.postMessage(signature);
};

// Export {} to make it a module, satisfying TypeScript's isolatedModules.
export {};
