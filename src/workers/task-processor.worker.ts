/// <reference lib="webworker" />
import type { Task } from "@/db/indexeddb";

interface WorkerMessage {
  id: string;
  tasks: Task[];
  type: "process" | "cleanup";
}

interface WorkerResponse {
  id: string;
  signature?: string;
  error?: string;
  type?: string;
}

const CHUNK_SIZE = 1000;
const CACHE_SIZE = 100;
const DEBOUNCE_TIME = 50;

// Use a more efficient cache structure
const taskCache = new Map<
  string,
  {
    signature: string;
    timestamp: number;
    weight: number; // For weighted LRU
  }
>();

let debounceTimeout: number | undefined;
const pendingTasks = new Map<
  string,
  {
    tasks: Task[];
    resolve: (value: WorkerResponse) => void;
  }
>();

// Improved signature generation with better memory usage
function generateSignature(tasks: Task[]): string {
  const chunks: Task[][] = [];
  for (let i = 0; i < tasks.length; i += CHUNK_SIZE) {
    chunks.push(tasks.slice(i, i + CHUNK_SIZE));
  }

  return chunks
    .map((chunk) => {
      const minimalChunk = chunk.map((t) => ({
        id: t.id,
        status: t.status,
        priority: t.priority,
        updatedAt:
          t.updatedAt instanceof Date ? t.updatedAt.toISOString() : t.updatedAt,
      }));
      return JSON.stringify(minimalChunk);
    })
    .join("");
}

function generateCacheKey(tasks: Task[]): string {
  return tasks
    .map((t) => `${t.id}:${t.updatedAt}`)
    .sort()
    .join("|");
}

// Improved cache cleaning with weighted LRU
function cleanCache() {
  if (taskCache.size <= CACHE_SIZE) return;

  const entries = Array.from(taskCache.entries()).sort((a, b) => {
    // Consider both age and access frequency
    const weightA = a[1].weight * (Date.now() - a[1].timestamp);
    const weightB = b[1].weight * (Date.now() - b[1].timestamp);
    return weightA - weightB;
  });

  // Remove oldest/least used entries
  const entriesToRemove = entries.slice(0, entries.length - CACHE_SIZE);
  for (const [key] of entriesToRemove) {
    taskCache.delete(key);
  }
}

function processTasks(id: string, tasks: Task[]): Promise<WorkerResponse> {
  return new Promise((resolve) => {
    try {
      const cacheKey = generateCacheKey(tasks);

      // Check cache first
      const cached = taskCache.get(cacheKey);
      if (cached) {
        // Update cache entry weight and timestamp
        cached.weight++;
        cached.timestamp = Date.now();
        resolve({ id, signature: cached.signature });
        return;
      }

      // Store in pending tasks if we're debouncing
      pendingTasks.set(id, { tasks, resolve });

      // Clear existing timeout
      if (debounceTimeout !== undefined) {
        self.clearTimeout(debounceTimeout);
      }

      // Set new debounce timeout
      debounceTimeout = self.setTimeout(() => {
        processPendingTasks();
      }, DEBOUNCE_TIME);
    } catch (error) {
      resolve({
        id,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error in processTasks",
      });
    }
  });
}

function processPendingTasks() {
  // Process all pending tasks in batches
  for (const [id, { tasks, resolve }] of pendingTasks) {
    try {
      const cacheKey = generateCacheKey(tasks);
      const signature = generateSignature(tasks);

      // Update cache
      taskCache.set(cacheKey, {
        signature,
        timestamp: Date.now(),
        weight: 1,
      });

      // Clean cache if needed
      cleanCache();

      // Resolve promise
      resolve({ id, signature });
    } catch (error) {
      resolve({
        id,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error in processPendingTasks",
      });
    }
  }

  // Clear pending tasks
  pendingTasks.clear();
  debounceTimeout = undefined;
}

// Message handler with error boundary
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  try {
    const { id, tasks, type } = event.data;

    switch (type) {
      case "process":
        const result = await processTasks(id, tasks);
        self.postMessage(result);
        break;

      case "cleanup":
        taskCache.clear();
        pendingTasks.clear();
        if (debounceTimeout !== undefined) {
          self.clearTimeout(debounceTimeout);
          debounceTimeout = undefined;
        }
        self.postMessage({ id, type: "cleanup" });
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    self.postMessage({
      id: event.data.id,
      error:
        error instanceof Error ? error.message : "Unknown error in onmessage",
    });
  }
};

export {};
