import type { Task } from "@/db/indexeddb";
import {
  createSearchParamsCache,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
} from "nuqs/server";
import * as z from "zod";

import { flagConfig } from "@/config/flag";
import { getFiltersStateParser, getSortingStateParser } from "@/lib/parsers";

export const taskStatuses = [
  "todo",
  "in-progress",
  "done",
  "canceled",
] as const;
export const taskPriorities = ["low", "medium", "high"] as const;
export const taskLabels = [
  "bug",
  "feature",
  "documentation",
  "enhancement",
] as const; // Assuming these based on common usage

export const searchParamsCache = createSearchParamsCache({
  filterFlag: parseAsStringEnum(
    flagConfig.featureFlags.map((flag) => flag.value)
  ),
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<Task>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  title: parseAsString.withDefault(""),
  status: parseAsArrayOf(z.enum(taskStatuses)).withDefault([]),
  priority: parseAsArrayOf(z.enum(taskPriorities)).withDefault([]),
  estimatedHours: parseAsArrayOf(z.coerce.number()).withDefault([]),
  createdAt: parseAsArrayOf(z.coerce.number()).withDefault([]),
  // advanced filter
  filters: getFiltersStateParser().withDefault([]),
  joinOperator: parseAsStringEnum(["and", "or"]).withDefault("and"),
});

export const createTaskSchema = z.object({
  title: z.string(),
  label: z.enum(taskLabels),
  status: z.enum(taskStatuses),
  priority: z.enum(taskPriorities),
  estimatedHours: z.coerce.number().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().optional(),
  label: z.enum(taskLabels).optional(),
  status: z.enum(taskStatuses).optional(),
  priority: z.enum(taskPriorities).optional(),
  estimatedHours: z.coerce.number().optional(),
});

export type GetTasksSchema = Awaited<
  ReturnType<typeof searchParamsCache.parse>
>;
export type CreateTaskSchema = z.infer<typeof createTaskSchema>;
export type UpdateTaskSchema = z.infer<typeof updateTaskSchema>;
