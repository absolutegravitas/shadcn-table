import { db } from "@/db/indexeddb";
import { type Task } from "@/db/indexeddb";
import { getAllTasksFromKV } from "@/app/_lib/actions"; // Import the server action

// This file will contain functions to interact with the IndexedDB database using Dexie and sync with Redis KV.

export async function initializeDatabase() {
  console.log("[IndexedDB Service] Initializing database...");
  try {
    const taskCount = await db.tasks.count();
    console.log(`[IndexedDB Service] Initial task count: ${taskCount}`);

    if (taskCount === 0) {
      console.log(
        "[IndexedDB Service] Database is empty, triggering initial sync from Redis."
      );
      // Trigger sync from Redis if the database is empty
      const syncResult = await syncTasksFromRedis();
      if (syncResult.error) {
        console.error(
          "[IndexedDB Service] Error during initial sync from Redis:",
          syncResult.error
        );
        // Handle error during initial sync - maybe show a message to the user
      } else {
        console.log("[IndexedDB Service] Initial sync from Redis completed.");
      }
    } else {
      console.log(
        "[IndexedDB Service] Database already contains data, skipping initial sync from Redis in initializeDatabase."
      );
      // If database is not empty, the TasksTable component will handle fetching and subsequent syncs.
    }
  } catch (error) {
    console.error(
      "[IndexedDB Service] Error during database initialization:",
      error
    );
    // Handle database initialization errors
  }
}

export async function getTasks() {
  return db.tasks.toArray();
}

/**
 * Syncs tasks from Redis KV (master) to IndexedDB.
 * Clears existing data in IndexedDB and populates it with the latest data from Redis.
 */
export async function syncTasksFromRedis(): Promise<{
  success: boolean;
  error?: string;
}> {
  console.log(
    "[IndexedDB Service] Starting sync from Redis KV to IndexedDB..."
  );
  try {
    // 1. Fetch latest data from Redis KV
    const kvTasksResult = await getAllTasksFromKV();

    console.log(
      "[IndexedDB Service] Result from getAllTasksFromKV:",
      kvTasksResult
    );
    if (kvTasksResult.error) {
      console.log(
        "[IndexedDB Service] Type of kvTasksResult.error:",
        typeof kvTasksResult.error
      );
      console.log(
        "[IndexedDB Service] Value of kvTasksResult.error:",
        kvTasksResult.error
      );
      console.error(
        "[IndexedDB Service] Error fetching tasks from KV:",
        String(kvTasksResult.error) // Explicitly convert error to string for logging
      );
      console.error(
        "[IndexedDB Service] Error fetching tasks from KV:",
        String(kvTasksResult.error) // Explicitly convert error to string for logging
      );
      return { success: false, error: String(kvTasksResult.error) }; // Ensure error is a string
    }

    const kvTasks = kvTasksResult.data;

    if (!kvTasks) {
      console.log("[IndexedDB Service] No tasks found in KV to sync.");
      // Optionally clear IDB if KV is empty, or leave existing data?
      // For now, let's clear to reflect master state.
      await db.tasks.clear();
      console.log("[IndexedDB Service] IndexedDB cleared as KV is empty.");
      return { success: true };
    }

    // 2. Clear existing data in IndexedDB
    await db.tasks.clear();
    console.log(
      `[IndexedDB Service] Cleared ${await db.tasks.count()} tasks from IndexedDB.`
    );

    // 3. Insert fetched data into IndexedDB
    // Ensure tasks have required fields, especially updatedAt for potential future sync logic
    const tasksToInsert = kvTasks.map((task) => ({
      ...task,
      updatedAt: task.updatedAt ? new Date(task.updatedAt) : new Date(), // Ensure updatedAt is a Date object
      createdAt: task.createdAt ? new Date(task.createdAt) : new Date(), // Ensure createdAt is a Date object
    }));

    await db.tasks.bulkPut(tasksToInsert); // Use bulkPut to handle both add and update if needed (though clear makes it effectively bulkAdd)
    console.log(
      `[IndexedDB Service] Successfully added ${tasksToInsert.length} tasks to IndexedDB.`
    );

    return { success: true };
  } catch (error: any) {
    console.error(
      "[IndexedDB Service] Error during sync from Redis KV to IndexedDB:",
      error
    );
    // Attempt to log response text if it's a fetch-like error response object
    if (error && error.response && typeof error.response.text === "function") {
      error.response
        .text()
        .then((text: string) => {
          console.error("[IndexedDB Service] Error Response Text:", text);
        })
        .catch((textErr: any) => {
          console.error(
            "[IndexedDB Service] Error trying to get response text during sync error logging:",
            textErr
          );
        });
    }
    return {
      success: false,
      error: error.message || "An unknown error occurred during sync.",
    };
  }
}
