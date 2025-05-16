"use server";

import { redis } from "@/lib/redis"; // Import Upstash Redis client
// import { db } from "@/db/indexeddb"; // No longer needed
import type { Task } from "@/db/indexeddb"; // Keep Task type
import { faker } from "@faker-js/faker"; // Import faker
import { customAlphabet } from "nanoid";
import { unstable_noStore } from "next/cache";
// import fs from "node:fs/promises"; // No longer needed for seeding
// import path from "node:path"; // No longer needed for seeding

import { getErrorMessage } from "@/lib/handle-error";

import type { CreateTaskSchema, UpdateTaskSchema } from "./validations";

export async function createTask(input: CreateTaskSchema) {
  unstable_noStore();
  try {
    console.log("[createTask] Received input:", JSON.stringify(input, null, 2));
    const newTask: Task = {
      id: `TASK-${customAlphabet("0123456789", 4)()}`,
      code: `TASK-${customAlphabet("0123456789", 4)()}`, // Assuming code is same format as id
      title: input.title,
      status: input.status,
      label: input.label,
      priority: input.priority,
      estimatedHours: 0, // Default value
      archived: false, // Default value
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const taskKey = `task:${newTask.id}`;
    console.log(
      `[createTask] Creating task with ID: ${newTask.id}, Redis key: ${taskKey}`
    );
    await redis.set(taskKey, JSON.stringify(newTask));

    return {
      data: newTask,
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: getErrorMessage(err),
    };
  }
}

export async function updateTask(input: UpdateTaskSchema & { id: string }) {
  unstable_noStore();
  try {
    console.log("[updateTask] Received input:", JSON.stringify(input, null, 2));
    const { id, ...updateData } = input;
    const taskKey = `task:${id}`;
    console.log(`[updateTask] Operating on Redis key: ${taskKey}`);

    const existingTaskJSON = await redis.get(taskKey);
    if (!existingTaskJSON) {
      return { data: null, error: "Task not found" };
    }

    // Assuming existingTaskJSON is an object because Upstash client auto-parses
    const existingTask = existingTaskJSON as Task;
    // Ensure dates are Date objects if they were stringified
    existingTask.createdAt = new Date(existingTask.createdAt);
    existingTask.updatedAt = new Date(existingTask.updatedAt);

    let hasActualChanges = false;
    const updatedTask: Task = { ...existingTask };

    const updatableKeys: (keyof UpdateTaskSchema)[] = [
      "title",
      "label",
      "status",
      "priority",
      "estimatedHours",
    ];

    for (const key of updatableKeys) {
      if (
        updateData[key] !== undefined &&
        updateData[key] !== (existingTask as any)[key]
      ) {
        (updatedTask as any)[key] = updateData[key];
        hasActualChanges = true;
      }
    }

    if (hasActualChanges) {
      updatedTask.updatedAt = new Date();
      await redis.set(taskKey, JSON.stringify(updatedTask));
      return { data: updatedTask, error: null };
    }

    return { data: existingTask, error: null };
  } catch (err) {
    return {
      data: null,
      error: getErrorMessage(err),
    };
  }
}

export async function updateTasks(input: {
  ids: string[];
  label?: Task["label"];
  status?: Task["status"];
  priority?: Task["priority"];
}) {
  unstable_noStore();
  try {
    const taskKeys = input.ids.map((id) => `task:${id}`);
    if (taskKeys.length === 0) {
      return { data: [], error: null };
    }

    const existingTasksObjects = await redis.mget<any[]>(...taskKeys);
    const updatedTasks: Task[] = [];
    const pipeline = redis.pipeline();
    let overallChangesMade = false;

    existingTasksObjects.forEach((taskObject, index) => {
      const currentTaskKey = taskKeys[index];
      if (taskObject && currentTaskKey) {
        const task = {
          ...taskObject,
          createdAt: new Date(taskObject.createdAt),
          updatedAt: new Date(taskObject.updatedAt),
        } as Task;
        const updatedTask: Task = { ...task };
        let taskSpecificChangesMade = false;

        if (input.label !== undefined && updatedTask.label !== input.label) {
          updatedTask.label = input.label;
          taskSpecificChangesMade = true;
        }
        if (input.status !== undefined && updatedTask.status !== input.status) {
          updatedTask.status = input.status;
          taskSpecificChangesMade = true;
        }
        if (
          input.priority !== undefined &&
          updatedTask.priority !== input.priority
        ) {
          updatedTask.priority = input.priority;
          taskSpecificChangesMade = true;
        }

        if (taskSpecificChangesMade) {
          updatedTask.updatedAt = new Date();
          pipeline.set(currentTaskKey, JSON.stringify(updatedTask));
          updatedTasks.push(updatedTask);
          overallChangesMade = true;
        } else {
          updatedTasks.push(task);
        }
      }
    });

    if (overallChangesMade) {
      await pipeline.exec();
    }

    return {
      data: updatedTasks,
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: getErrorMessage(err),
    };
  }
}

export async function deleteTask(input: { id: string }) {
  unstable_noStore();
  try {
    console.log("[deleteTask] Received input:", JSON.stringify(input, null, 2));
    const taskKey = `task:${input.id}`;
    console.log(`[deleteTask] Operating on Redis key: ${taskKey}`);
    const result = await redis.del(taskKey);

    if (result === 0) {
      return { data: null, error: "Task not found or already deleted." };
    }

    return {
      data: { id: input.id },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: getErrorMessage(err),
    };
  }
}

export async function deleteTasks(input: { ids: string[] }) {
  unstable_noStore();
  try {
    if (input.ids.length === 0) {
      return { data: { count: 0 }, error: null };
    }
    const taskKeysToDelete = input.ids.map((id) => `task:${id}`);
    const count = await redis.del(...taskKeysToDelete);

    return {
      data: { count },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: getErrorMessage(err),
    };
  }
}

// Fetches ALL tasks from Redis. Filtering/sorting/pagination will be client-side for PWA.
export async function getAllTasksFromKV(): Promise<{
  data: Task[] | null;
  error: string | null;
}> {
  unstable_noStore();
  console.log("[getAllTasksFromKV] Attempting to fetch all tasks...");

  try {
    // First verify Redis connection
    try {
      await redis.ping();
    } catch (connErr) {
      console.error("[getAllTasksFromKV] Redis connection error:", connErr);
      throw new Error(
        "Failed to connect to Redis. Please check your connection and try again."
      );
    }

    // Scan for all task keys
    const taskKeys: string[] = [];
    let cursor = "0";

    try {
      do {
        const [nextCursor, keys] = await redis.scan(cursor, {
          match: "task:*",
        });
        taskKeys.push(...keys);
        cursor = nextCursor;
      } while (cursor !== "0");
    } catch (scanErr) {
      console.error("[getAllTasksFromKV] Error scanning keys:", scanErr);
      throw new Error("Failed to retrieve task keys from Redis.");
    }

    if (taskKeys.length === 0) {
      console.log("[getAllTasksFromKV] No tasks found.");
      return { data: [], error: null };
    }

    console.log(
      `[getAllTasksFromKV] Found ${taskKeys.length} tasks. Fetching data...`
    );

    // Batch fetch tasks
    try {
      const tasks = await redis.mget<Task[]>(...taskKeys);

      if (!tasks || !Array.isArray(tasks)) {
        console.error(
          "[getAllTasksFromKV] Invalid data format received:",
          tasks
        );
        throw new Error("Received invalid data format from Redis.");
      }

      const validTasks = tasks
        .filter((task): task is Task => task !== null)
        .map((task) => {
          if (typeof task === "string") {
            try {
              return JSON.parse(task);
            } catch (e) {
              console.warn("[getAllTasksFromKV] Failed to parse task:", task);
              return null;
            }
          }
          return task;
        })
        .filter((task): task is Task => task !== null);

      console.log(
        `[getAllTasksFromKV] Successfully fetched ${validTasks.length} tasks.`
      );
      return { data: validTasks, error: null };
    } catch (fetchErr) {
      console.error("[getAllTasksFromKV] Error fetching tasks:", fetchErr);
      throw new Error("Failed to retrieve task data from Redis.");
    }
  } catch (err) {
    const errorMessage = getErrorMessage(err);
    console.error("[getAllTasksFromKV] Fatal error:", errorMessage);
    return { data: null, error: errorMessage };
  }
}

// Helper function to generate a random task based on project's Task interface
function generateRandomTaskForProject(): Task {
  const taskId = `TASK-${customAlphabet("0123456789", 4)()}`;
  const statuses: Task["status"][] = [
    "todo",
    "in-progress",
    "done",
    "canceled",
  ];
  const labels: Task["label"][] = [
    "bug",
    "feature",
    "documentation",
    "enhancement",
  ];
  const priorities: Task["priority"][] = ["low", "medium", "high"];

  return {
    id: taskId,
    code: taskId, // Using the same as id, consistent with createTask
    title: faker.hacker
      .phrase()
      .replace(/^./, (letter) => letter.toUpperCase()),
    estimatedHours: faker.number.int({ min: 0, max: 24 }), // Can be 0
    status: faker.helpers.arrayElement(statuses),
    label: faker.helpers.arrayElement(labels),
    priority: faker.helpers.arrayElement(priorities),
    archived: faker.datatype.boolean({ probability: 0.15 }),
    createdAt: faker.date.recent({ days: 30 }),
    updatedAt: faker.date.recent({ days: 10 }),
  };
}

export async function seedTasksToRedis(input?: { count?: number }): Promise<{
  count: number;
  error: string | null;
}> {
  unstable_noStore();
  const taskCount = input?.count ?? 50;
  console.log(
    `[seedTasksToRedis] Attempting to seed ${taskCount} new tasks to Redis...`
  );

  try {
    console.log(
      "[seedTasksToRedis] Deleting existing task:* keys from Redis..."
    );
    let cursor = "0";
    const existingTaskKeys: string[] = [];
    do {
      const [nextCursor, keys] = await redis.scan(cursor, { match: "task:*" });
      existingTaskKeys.push(...keys);
      cursor = nextCursor;
    } while (cursor !== "0");

    if (existingTaskKeys.length > 0) {
      await redis.del(...existingTaskKeys);
      console.log(
        `[seedTasksToRedis] Deleted ${existingTaskKeys.length} existing task keys.`
      );
    } else {
      console.log(
        "[seedTasksToRedis] No existing task:* keys found to delete."
      );
    }

    const newTasks: Task[] = [];
    for (let i = 0; i < taskCount; i++) {
      newTasks.push(generateRandomTaskForProject());
    }

    if (newTasks.length === 0) {
      console.log("[seedTasksToRedis] No tasks generated to seed.");
      return { count: 0, error: null };
    }

    const pipeline = redis.pipeline();
    for (const task of newTasks) {
      const taskKey = `task:${task.id}`;
      pipeline.set(taskKey, JSON.stringify(task));
    }

    await pipeline.exec();
    console.log(
      `[seedTasksToRedis] Successfully seeded ${newTasks.length} new tasks to Redis.`
    );
    return { count: newTasks.length, error: null };
  } catch (err) {
    const errorMessage = getErrorMessage(err);
    console.error("[seedTasksToRedis] Error seeding tasks:", errorMessage);
    return { count: 0, error: errorMessage };
  }
}
