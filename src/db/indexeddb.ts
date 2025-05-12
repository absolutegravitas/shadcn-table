import Dexie, { type Table } from "dexie";

export interface Task {
  id: string;
  code: string;
  title: string;
  estimatedHours: number;
  status: "todo" | "in-progress" | "done" | "canceled";
  label: "bug" | "feature" | "documentation" | "enhancement";
  priority: "low" | "medium" | "high";
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class TasksDexie extends Dexie {
  tasks!: Table<Task>;

  constructor() {
    super("tasksDatabase");
    this.version(1).stores({
      tasks: "id, status, priority, estimatedHours, createdAt", // Primary key and indexed properties
    });
  }
}

export const db = new TasksDexie();
