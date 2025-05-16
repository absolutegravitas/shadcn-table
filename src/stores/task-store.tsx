"use client";

import * as React from "react";
import type { Task } from "@/db/indexeddb";
import { getAllTasksFromKV } from "@/app/_lib/actions";
import { db } from "@/db/indexeddb";

interface TasksContextType {
  allTasks: Task[];
  isLoadingAllTasks: boolean;
  errorLoadingAllTasks: string | null;
  fetchAllTasksFromServer: () => Promise<void>;
  getTaskById: (id: string) => Task | undefined;
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
  const [retryCount, setRetryCount] = React.useState(0);
  const MAX_RETRIES = 3;

  const fetchAllTasksFromServer = React.useCallback(async () => {
    setIsLoadingAllTasks(true);
    setErrorLoadingAllTasks(null);

    try {
      console.log("[TasksProvider] Fetching all tasks from server...");
      const result = await getAllTasksFromKV();

      if (result.error) {
        console.error("[TasksProvider] Server error:", result.error);
        setErrorLoadingAllTasks(result.error);

        // Try to load from IndexedDB as fallback
        const offlineTasks = await db.tasks.toArray();
        if (offlineTasks.length > 0) {
          console.log("[TasksProvider] Loading from IndexedDB fallback");
          setAllTasks(offlineTasks);
        } else {
          setAllTasks([]);
        }
      } else if (result.data) {
        console.log(
          `[TasksProvider] Successfully fetched ${result.data.length} tasks`
        );
        setAllTasks(result.data);
        // Update IndexedDB
        await db.tasks.clear();
        await db.tasks.bulkPut(result.data);
      }
    } catch (error) {
      console.error("[TasksProvider] Critical error:", error);
      setErrorLoadingAllTasks(
        error instanceof Error ? error.message : String(error)
      );

      // Try to load from IndexedDB
      try {
        const offlineTasks = await db.tasks.toArray();
        if (offlineTasks.length > 0) {
          setAllTasks(offlineTasks);
        } else {
          setAllTasks([]);
        }
      } catch (dbError) {
        console.error("[TasksProvider] IndexedDB error:", dbError);
        setAllTasks([]);
      }
    } finally {
      setIsLoadingAllTasks(false);
    }
  }, []);

  // Initial load with retry logic
  React.useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const loadInitialData = async () => {
      try {
        await fetchAllTasksFromServer();
      } catch (error) {
        console.error("[TasksProvider] Initial load error:", error);
        if (retryCount < MAX_RETRIES) {
          console.log(
            `[TasksProvider] Retrying... (${retryCount + 1}/${MAX_RETRIES})`
          );
          timeoutId = setTimeout(() => {
            setRetryCount((prev) => prev + 1);
          }, Math.min(1000 * Math.pow(2, retryCount), 10000)); // Exponential backoff
        }
      }
    };

    loadInitialData();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [fetchAllTasksFromServer, retryCount]);

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
