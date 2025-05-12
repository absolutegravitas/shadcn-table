import { db } from "@/db/indexeddb";
import { type Task } from "@/db/indexeddb";

// This file will contain functions to interact with the IndexedDB database using Dexie.

export async function initializeDatabase() {
  const taskCount = await db.tasks.count();

  if (taskCount === 0) {
    try {
      const response = await fetch("/mock-tasks.json");
      const tasks = (await response.json()) as Task[];
      // Map the fetched data to match the Task type, handling potential null titles and updated dates
      const tasksToInsert = tasks.map((task) => ({
        ...task,
        title: task.title ?? "", // Provide a default empty string if title is null
        updatedAt: task.updatedAt ?? new Date(), // Provide a default date if updatedAt is null
      }));
      await db.tasks.bulkAdd(tasksToInsert);
      console.log("Mock tasks added to IndexedDB");
    } catch (error) {
      console.error("Error fetching or adding mock tasks:", error);
    }
  }
}

export async function getTasks() {
  return db.tasks.toArray();
}
