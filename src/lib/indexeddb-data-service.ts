import { db } from "@/db/indexeddb";
import { type Task } from "@/db/indexeddb";

// This file will contain functions to interact with the IndexedDB database using Dexie.

export async function initializeDatabase() {
  const taskCount = await db.tasks.count();
  // console.log(`[IndexedDB Service] Initial task count: ${taskCount}`);
  // The following block for seeding from mock-tasks.json is now disabled
  // as Redis is the master and TasksTable component handles syncing from KV to IndexedDB.
  /*
  if (taskCount === 0) {
    try {
      console.log("[IndexedDB Service] Attempting to seed from /mock-tasks.json as count is 0.");
      const response = await fetch("/mock-tasks.json"); // This was causing 404
      if (!response.ok) {
        throw new Error(`Failed to fetch mock-tasks.json: ${response.statusText}`);
      }
      const tasks = (await response.json()) as Task[];
      const tasksToInsert = tasks.map((task) => ({
        ...task,
        title: task.title ?? "",
        updatedAt: task.updatedAt ?? new Date(),
      }));
      await db.tasks.bulkAdd(tasksToInsert);
      console.log("[IndexedDB Service] Mock tasks added to IndexedDB from JSON.");
    } catch (error) {
      console.error("[IndexedDB Service] Error fetching or adding mock tasks from JSON:", error);
    }
  }
  */
  console.log(
    "[IndexedDB Service] initializeDatabase called. Seeding from JSON is disabled. Sync from Redis is handled by TasksTable."
  );
}

export async function getTasks() {
  return db.tasks.toArray();
}
