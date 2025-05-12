"use server";

"use server";

import { db } from "@/db/indexeddb";
import type { Task } from "@/db/indexeddb";
import { customAlphabet } from "nanoid";
import { unstable_noStore } from "next/cache";

import { getErrorMessage } from "@/lib/handle-error";

import type { CreateTaskSchema, UpdateTaskSchema } from "./validations";

export async function createTask(input: CreateTaskSchema) {
  unstable_noStore();
  try {
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

    await db.tasks.add(newTask);

    // Dexie doesn't have automatic data balancing like the Drizzle seed
    // If needed, implement custom logic here to maintain task count

    return {
      data: null,
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
    await db.tasks.update(input.id, {
      title: input.title,
      label: input.label,
      status: input.status,
      priority: input.priority,
      updatedAt: new Date(),
    });

    return {
      data: null,
      error: null,
    };
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
    const updates: Partial<Task> = { updatedAt: new Date() };
    if (input.label !== undefined) updates.label = input.label;
    if (input.status !== undefined) updates.status = input.status;
    if (input.priority !== undefined) updates.priority = input.priority;

    await db.tasks.bulkUpdate(
      input.ids.map((id) => ({
        key: id,
        changes: updates,
      }))
    );

    return {
      data: null,
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
    await db.tasks.delete(input.id);

    // Dexie doesn't have automatic data balancing like the Drizzle seed
    // If needed, implement custom logic here to maintain task count

    return {
      data: null,
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
    await db.tasks.bulkDelete(input.ids);

    // Dexie doesn't have automatic data balancing like the Drizzle seed
    // If needed, implement custom logic here to maintain task count

    return {
      data: null,
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: getErrorMessage(err),
    };
  }
}
