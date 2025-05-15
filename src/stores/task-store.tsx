"use client";

import * as React from "react";
import type { Task } from "@/db/indexeddb";
import { getAllTasksFromKV } from "@/app/_lib/actions";
import { db } from "@/db/indexeddb";
import debounce from "lodash/debounce";

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
  const [currentTasksSignature, setCurrentTasksSignature] = React.useState("");

  const workerRef = React.useRef<Worker | null>(null);

  // Initialize worker
  React.useEffect(() => {
    // Ensure worker is only created in the browser environment
    if (typeof window !== "undefined") {
      workerRef.current = new Worker(
        new URL("../workers/task-processor.worker.ts", import.meta.url)
      );

      workerRef.current.onmessage = (event: MessageEvent<string>) => {
        // This listener is generic; specific logic will decide if this signature
        // is for currentTasks or fetchedTasks based on context when worker was called.
        // For now, we assume it's for currentTasks if called from the allTasks effect.
        // A more robust solution might involve message IDs or types if contention occurs.
        setCurrentTasksSignature(event.data);
      };

      workerRef.current.onerror = (error) => {
        console.error("[TasksProvider] Worker error:", error);
        // Handle worker errors, perhaps by falling back to main thread processing
        // or setting an error state.
      };
    }
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  // Effect to update currentTasksSignature when allTasks changes, using the worker
  const debouncedUpdateSignature = React.useCallback(
    React.useMemo(
      () =>
        debounce((tasks: Task[]) => {
          if (workerRef.current && tasks.length > 0) {
            workerRef.current.postMessage(tasks);
          } else if (tasks.length === 0) {
            const emptyTasksSignature = JSON.stringify([]);
            setCurrentTasksSignature(emptyTasksSignature);
          }
        }, 100),
      []
    ),
    []
  );

  React.useEffect(() => {
    debouncedUpdateSignature(allTasks);
    return () => debouncedUpdateSignature.cancel();
  }, [allTasks, debouncedUpdateSignature]);

  const fetchAllTasksFromServer = React.useCallback(async () => {
    setIsLoadingAllTasks(true);
    setErrorLoadingAllTasks(null);
    console.log("[TasksProvider] Fetching all tasks from server...");

    try {
      const result = await getAllTasksFromKV();
      if (result.error) {
        console.error("[TasksProvider] Error fetching tasks:", result.error);
        setErrorLoadingAllTasks(result.error);
        const offlineTasks = await db.tasks.toArray();
        if (offlineTasks.length > 0) {
          setAllTasks(offlineTasks);
        } else {
          setAllTasks([]);
        }
      } else if (result.data) {
        console.log(
          `[TasksProvider] Successfully fetched ${result.data.length} tasks.`
        );
        const fetchedDataSafe = result.data ?? [];

        if (workerRef.current) {
          const worker = workerRef.current; // Capture current worker in a variable for safety within promise
          // Create a promise to wait for the worker's response
          const fetchedSignaturePromise = new Promise<string>(
            (resolve, reject) => {
              const tempWorkerListener = (event: MessageEvent<string>) => {
                worker.removeEventListener("message", tempWorkerListener);
                worker.removeEventListener("error", tempErrorListener); // Also remove error listener
                resolve(event.data);
              };
              const tempErrorListener = (error: ErrorEvent) => {
                worker.removeEventListener("message", tempWorkerListener);
                worker.removeEventListener("error", tempErrorListener);
                reject(error);
              };

              worker.addEventListener("message", tempWorkerListener);
              worker.addEventListener("error", tempErrorListener);
              worker.postMessage(fetchedDataSafe);
            }
          );

          try {
            const fetchedTasksSignature = await fetchedSignaturePromise;
            if (currentTasksSignature !== fetchedTasksSignature) {
              console.log(
                "[TasksProvider] Fetched data signature is different, updating."
              );
              setAllTasks(fetchedDataSafe);
              await db.tasks.clear();
              await db.tasks.bulkPut(fetchedDataSafe);
              console.log("[TasksProvider] Synced tasks to IndexedDB.");
            } else {
              console.log(
                "[TasksProvider] Fetched data signature is same, no update."
              );
            }
          } catch (workerError) {
            console.error(
              "[TasksProvider] Error getting signature from worker for fetched tasks:",
              workerError
            );
            // Fallback or error handling if worker fails for fetched tasks
            // For simplicity, could attempt main thread comparison or just log
          }
        } else {
          // Fallback if worker is not available (should not happen if initialized correctly)
          console.warn(
            "[TasksProvider] Worker not available for fetched tasks comparison. Skipping optimized check."
          );
          // Potentially do a main-thread comparison or just update if this case is critical
        }
      } else {
        // KV is empty
        const emptyTasksSignature = JSON.stringify([]); // Assuming normalize of [] is []
        if (currentTasksSignature !== emptyTasksSignature) {
          console.log("[TasksProvider] KV empty, clearing local state.");
          setAllTasks([]);
          await db.tasks.clear();
        } else {
          console.log("[TasksProvider] KV empty, local state already empty.");
        }
      }
    } catch (err) {
      console.error("[TasksProvider] Critical error in fetchAllTasks:", err);
      setErrorLoadingAllTasks(err instanceof Error ? err.message : String(err));
      const offlineTasks = await db.tasks.toArray();
      if (offlineTasks.length > 0) {
        setAllTasks(offlineTasks);
      } else {
        setAllTasks([]);
      }
    } finally {
      setIsLoadingAllTasks(false);
    }
  }, [currentTasksSignature]); // currentTasksSignature is a dependency

  const initialLoadEffectRan = React.useRef(false);

  React.useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      if (initialLoadEffectRan.current === true) {
        return;
      }
      initialLoadEffectRan.current = true;
    }

    const loadInitialData = async () => {
      setIsLoadingAllTasks(true);
      try {
        const [offlineTasks, serverResult] = await Promise.all([
          db.tasks.toArray(),
          getAllTasksFromKV()
        ]);

        if (offlineTasks.length > 0) {
          setAllTasks(offlineTasks);
        }

        if (serverResult.error) {
          setErrorLoadingAllTasks(serverResult.error);
          if (!offlineTasks.length) setAllTasks([]);
        } else if (serverResult.data) {
          const fetchedDataSafe = serverResult.data;
          setAllTasks(fetchedDataSafe);
          await db.tasks.clear();
          await db.tasks.bulkPut(fetchedDataSafe);
        } else {
          setAllTasks([]);
          await db.tasks.clear();
        }
      } catch (error) {
        console.error("[TasksProvider] Error:", error);
        setErrorLoadingAllTasks(
          error instanceof Error ? error.message : String(error)
        );
        setAllTasks([]);
      }
      // setIsLoadingAllTasks(false) is handled by fetchAllTasksFromServer's finally block
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
