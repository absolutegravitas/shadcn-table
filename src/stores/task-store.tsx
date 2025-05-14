"use client";

import * as React from "react";
import isEqual from "lodash.isequal"; // Import isEqual
import type { Task } from "@/db/indexeddb";
import { getAllTasksFromKV } from "@/app/_lib/actions"; // Server action to get all tasks
import { db } from "@/db/indexeddb"; // Dexie instance for offline persistence

interface TasksContextType {
  allTasks: Task[];
  isLoadingAllTasks: boolean;
  errorLoadingAllTasks: string | null;
  fetchAllTasksFromServer: () => Promise<void>;
  getTaskById: (id: string) => Task | undefined;
  // Add update/delete functions here if needed to sync with server & update local state
}

const TasksContext = React.createContext<TasksContextType | undefined>(
  undefined
);

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const [allTasks, setAllTasks] = React.useState<Task[]>([]);
  const [isLoadingAllTasks, setIsLoadingAllTasks] = React.useState(true);
  const [errorLoadingAllTasks, setErrorLoadingAllTasks] = React.useState<
    string | null
  >(null);

  const fetchAllTasksFromServer = React.useCallback(async () => {
    setIsLoadingAllTasks(true);
    setErrorLoadingAllTasks(null);
    console.log("[TasksProvider] Fetching all tasks from server...");
    try {
      const result = await getAllTasksFromKV();
      if (result.error) {
        console.error(
          "[TasksProvider] Error fetching all tasks:",
          result.error
        );
        setErrorLoadingAllTasks(result.error);
        // Attempt to load from IndexedDB as a fallback if server fetch fails
        const offlineTasks = await db.tasks.toArray();
        if (offlineTasks.length > 0) {
          console.log(
            "[TasksProvider] Loaded tasks from IndexedDB as fallback.",
            offlineTasks.length
          );
          setAllTasks(offlineTasks);
        } else {
          setAllTasks([]);
        }
      } else if (result.data) {
        console.log(
          `[TasksProvider] Successfully fetched ${result.data.length} tasks from server.`
        );

        const normalizeTasksForComparison = (tasks: Task[]) => {
          // Ensure tasks is an array before trying to map/sort
          if (!Array.isArray(tasks)) return [];
          return tasks
            .map((task) => ({
              ...task,
              // Ensure createdAt/updatedAt are valid dates before calling getTime
              createdAt: task.createdAt
                ? new Date(task.createdAt).getTime()
                : 0,
              updatedAt: task.updatedAt
                ? new Date(task.updatedAt).getTime()
                : 0,
            }))
            .sort((a, b) => a.id.localeCompare(b.id));
        };

        const currentTasksForComparison = normalizeTasksForComparison(allTasks);
        const fetchedTasksForComparison = normalizeTasksForComparison(
          result.data
        );

        if (!isEqual(currentTasksForComparison, fetchedTasksForComparison)) {
          console.log(
            "[TasksProvider] Fetched data is different (after normalization), updating state and IndexedDB."
          );
          setAllTasks(result.data); // Set original result.data with Date objects
          // Persist to IndexedDB for offline access
          await db.tasks.clear(); // Clear old data
          await db.tasks.bulkPut(result.data); // Store original result.data
          console.log("[TasksProvider] Synced all tasks to IndexedDB.");
        } else {
          console.log(
            "[TasksProvider] Fetched data is the same as current state (after normalization), no update needed."
          );
        }
      } else {
        // if result.data is null but there was no error, means KV is empty
        if (allTasks.length > 0) {
          // Clear if local state has tasks
          console.log(
            "[TasksProvider] KV is empty, clearing local state and IndexedDB."
          );
          setAllTasks([]);
          await db.tasks.clear();
          console.log("[TasksProvider] Cleared IndexedDB as KV is empty.");
        } else {
          console.log(
            "[TasksProvider] KV is empty, local state already empty."
          );
        }
      }
    } catch (err) {
      console.error("[TasksProvider] Critical error fetching all tasks:", err);
      setErrorLoadingAllTasks(err instanceof Error ? err.message : String(err));
      // Attempt to load from IndexedDB as a fallback
      const offlineTasks = await db.tasks.toArray();
      if (offlineTasks.length > 0) {
        console.log(
          "[TasksProvider] Loaded tasks from IndexedDB as fallback after critical error.",
          offlineTasks.length
        );
        setAllTasks(offlineTasks);
      } else {
        setAllTasks([]);
      }
    } finally {
      setIsLoadingAllTasks(false);
    }
  }, [allTasks]); // Added allTasks to dependency array for useCallback as it's used in comparison

  // Initial fetch on mount
  React.useEffect(() => {
    // Check if tasks are already in IndexedDB (e.g., from previous session, for PWA offline start)
    const loadInitialData = async () => {
      console.log(
        "[TasksProvider] Initializing... attempting to load from IDB first."
      );
      const offlineTasks = await db.tasks.toArray();
      if (offlineTasks.length > 0) {
        console.log(
          `[TasksProvider] Found ${offlineTasks.length} tasks in IndexedDB on initial load.`
        );
        setAllTasks(offlineTasks);
        setIsLoadingAllTasks(false); // Assume IDB data is good enough for initial render
        // Then, try to refresh from server.
        fetchAllTasksFromServer(); // Refresh in background
      } else {
        console.log(
          "[TasksProvider] No tasks in IndexedDB on initial load, fetching from server."
        );
        fetchAllTasksFromServer();
      }
    };
    loadInitialData();
  }, [fetchAllTasksFromServer]);

  const getTaskById = React.useCallback(
    (id: string): Task | undefined => {
      return allTasks.find((task) => task.id === id);
    },
    [allTasks]
  );

  return (
    <TasksContext.Provider
      value={{
        allTasks,
        isLoadingAllTasks,
        errorLoadingAllTasks,
        fetchAllTasksFromServer,
        getTaskById,
      }}
    >
      {children}
    </TasksContext.Provider>
  );
}

export function useTasks() {
  const context = React.useContext(TasksContext);
  if (context === undefined) {
    throw new Error("useTasks must be used within a TasksProvider");
  }
  return context;
}
