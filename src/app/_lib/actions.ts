"use server";

"use server";

import { redis } from "@/lib/redis"; // Import Upstash Redis client
// import { db } from "@/db/indexeddb"; // No longer needed
import type { Task } from "@/db/indexeddb"; // Keep Task type
import { customAlphabet } from "nanoid";
import { unstable_noStore } from "next/cache";
import fs from "node:fs/promises"; // For reading the JSON file
import path from "node:path"; // For constructing the file path

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

    // Optionally, add the new task's ID to a Redis Set for easy retrieval of all task IDs
    // await redis.sadd("task_ids", newTask.id);

    return {
      data: newTask, // Return the created task
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

    const existingTask = JSON.parse(existingTaskJSON as string) as Task; // Assert type after parsing
    let hasActualChanges = false;
    const updatedTask: Task = { ...existingTask };

    // Apply updates
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

    // No actual changes other than potentially updatedAt, return existing task or null
    // Depending on desired behavior, you might still update `updatedAt` if no other fields changed.
    // For now, if no data fields changed, we return the existing task data without a new DB write.
    return { data: existingTask, error: null }; // Or return null data if no change is not an "update"
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
      return { data: [], error: null }; // No tasks to update
    }

    // mget returns (string | null)[] for existing/non-existing keys
    const existingTaskStrings = await redis.mget<string[]>(...taskKeys);
    const updatedTasks: Task[] = [];
    const pipeline = redis.pipeline();
    let overallChangesMade = false;

    existingTaskStrings.forEach((taskString, index) => {
      const currentTaskKey = taskKeys[index];
      if (taskString && currentTaskKey) {
        // Task string exists and key is valid
        const task = JSON.parse(taskString) as Task; // Parse the string to Task
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
          pipeline.set(currentTaskKey, JSON.stringify(updatedTask)); // Use checked currentTaskKey
          updatedTasks.push(updatedTask);
          overallChangesMade = true;
        } else {
          updatedTasks.push(task); // No changes for this specific task, push original parsed task
        }
      } else {
        // Task with id input.ids[index] not found, or key was undefined
        // Optionally, log this or handle as an error for specific ID
      }
    });

    if (overallChangesMade) {
      await pipeline.exec();
    }

    return {
      data: updatedTasks, // Return all processed tasks (updated or not)
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

    // Optionally, remove the task's ID from a Redis Set if you're maintaining an index
    // await redis.srem("task_ids", input.id);

    if (result === 0) {
      // Task key did not exist
      return { data: null, error: "Task not found or already deleted." };
    }

    return {
      data: { id: input.id }, // Indicate success by returning the ID of the deleted task
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

    // Optionally, remove IDs from a "task_ids" set if used
    // if (count > 0) {
    //   await redis.srem("task_ids", ...input.ids.filter((id, index) => taskKeysToDelete.includes(`task:${id}`)));
    // }

    return {
      data: { count }, // Return the number of tasks deleted
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: getErrorMessage(err),
    };
  }
}

export async function getAllTasksFromKV(): Promise<{
  data: Task[] | null;
  error: string | null;
}> {
  unstable_noStore();
  try {
    console.log(
      "[getAllTasksFromKV] Starting to fetch all task keys from Redis."
    );
    const taskKeys: string[] = [];
    let cursor = "0"; // SCAN cursor is a string, starts at "0"
    do {
      // redis.scan returns [string, string[]]
      const [nextCursorString, keys] = await redis.scan(cursor, {
        match: "task:*",
      });
      taskKeys.push(...keys);
      cursor = nextCursorString;
    } while (cursor !== "0"); // Loop until cursor is "0"

    console.log(
      `[getAllTasksFromKV] Found ${
        taskKeys.length
      } keys matching 'task:*'. Keys: ${taskKeys.join(", ")}`
    );
    if (taskKeys.length === 0) {
      console.log("[getAllTasksFromKV] No task keys found in Redis.");
      return { data: [], error: null };
    }

    const taskJSONStrings = await redis.mget<string[]>(...taskKeys);
    console.log(
      `[getAllTasksFromKV] Retrieved ${
        taskJSONStrings.filter(Boolean).length
      } task JSON strings from Redis.`
    );
    const tasks = taskJSONStrings
      .map((json) => (json ? (JSON.parse(json) as Task) : null))
      .filter((task): task is Task => task !== null);

    return { data: tasks, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

export async function seedTasksToRedis(): Promise<{
  count: number;
  error: string | null;
}> {
  unstable_noStore();
  console.log(
    "[seedTasksToRedis] Attempting to seed tasks from JSON to Redis..."
  );
  try {
    const filePath = path.join(process.cwd(), "public", "mock-tasks.json");
    const fileContent = await fs.readFile(filePath, "utf-8");
    const tasks = JSON.parse(fileContent) as Task[];

    if (!Array.isArray(tasks)) {
      console.error(
        "[seedTasksToRedis] mock-tasks.json did not contain an array."
      );
      return { count: 0, error: "Invalid format in mock-tasks.json." };
    }

    if (tasks.length === 0) {
      console.log(
        "[seedTasksToRedis] mock-tasks.json is empty. No tasks to seed."
      );
      return { count: 0, error: null };
    }

    const pipeline = redis.pipeline();
    let validTasksProcessed = 0;

    for (const task of tasks) {
      if (task && task.id) {
        // Basic validation
        const taskKey = `task:${task.id}`;
        // Ensure all task fields are present or have defaults if necessary
        const taskToStore: Task = {
          id: task.id,
          code: task.code || task.id, // Ensure code exists
          title: task.title,
          status: task.status || "todo", // Ensure status exists
          label: task.label || "bug", // Ensure label exists
          priority: task.priority || "low", // Ensure priority exists
          estimatedHours: task.estimatedHours || 0,
          archived: task.archived || false,
          createdAt: task.createdAt ? new Date(task.createdAt) : new Date(),
          updatedAt: task.updatedAt ? new Date(task.updatedAt) : new Date(),
        };
        pipeline.set(taskKey, JSON.stringify(taskToStore));
        validTasksProcessed++;
      } else {
        console.warn(
          "[seedTasksToRedis] Skipping task due to missing id:",
          task
        );
      }
    }

    if (validTasksProcessed > 0) {
      await pipeline.exec();
      console.log(
        `[seedTasksToRedis] Successfully seeded ${validTasksProcessed} tasks to Redis.`
      );
      return { count: validTasksProcessed, error: null };
    } else {
      console.log("[seedTasksToRedis] No valid tasks found in JSON to seed.");
      return { count: 0, error: "No valid tasks in JSON to seed." };
    }
  } catch (err) {
    const errorMessage = getErrorMessage(err);
    console.error("[seedTasksToRedis] Error seeding tasks:", errorMessage);
    if (errorMessage.includes("ENOENT")) {
      return { count: 0, error: "mock-tasks.json not found." };
    }
    return { count: 0, error: errorMessage };
  }
}
