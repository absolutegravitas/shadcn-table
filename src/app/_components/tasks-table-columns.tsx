"use client";

import type { Task } from "@/db/indexeddb";
import type { DataTableRowAction } from "@/types/data-table";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ArrowUpDown,
  CalendarIcon,
  CircleDashed,
  Clock,
  Ellipsis,
  Text,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { db } from "@/db/indexeddb"; // Import Dexie db instance
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/format";
import { getErrorMessage } from "@/lib/handle-error";

import { updateTask } from "../_lib/actions";
import { getPriorityIcon, getStatusIcon } from "../_lib/utils";

export interface GetTasksTableColumnsProps {
  statusCounts: Record<Task["status"], number>;
  priorityCounts: Record<Task["priority"], number>;
  estimatedHoursRange: { min: number; max: number };
  setRowAction: React.Dispatch<
    React.SetStateAction<DataTableRowAction<Task> | null>
  >;
  refreshTableData: () => Promise<void>; // Callback to refresh table data from IDB
}

export function getTasksTableColumns({
  statusCounts,
  priorityCounts,
  estimatedHoursRange,
  setRowAction,
  refreshTableData, // Destructure the new prop
}: GetTasksTableColumnsProps): ColumnDef<Task>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label='Select all'
          className='translate-y-0.5'
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label='Select row'
          className='translate-y-0.5'
        />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 40,
    },
    {
      id: "code",
      accessorKey: "code",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Task' />
      ),
      cell: ({ row }) => <div className='w-20'>{row.getValue("code")}</div>,
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "title",
      accessorKey: "title",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Title' />
      ),
      cell: ({ row }) => {
        const label = ["bug", "feature", "documentation", "enhancement"].find(
          (label) => label === row.original.label
        );

        return (
          <div className='flex items-center gap-2'>
            {label && <Badge variant='outline'>{label}</Badge>}
            <span className='max-w-[31.25rem] truncate font-medium'>
              {row.getValue("title")}
            </span>
          </div>
        );
      },
      meta: {
        label: "Title",
        placeholder: "Search titles...",
        variant: "text",
        icon: Text,
      },
      enableColumnFilter: true,
    },
    {
      id: "status",
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Status' />
      ),
      cell: ({ cell }) => {
        const status = cell.getValue<Task["status"]>();

        if (!status) return null;

        const Icon = getStatusIcon(status);

        return (
          <Badge variant='outline' className='py-1 [&>svg]:size-3.5'>
            <Icon />
            <span className='capitalize'>{status}</span>
          </Badge>
        );
      },
      meta: {
        label: "Status",
        variant: "multiSelect",
        options: ["todo", "in-progress", "done", "canceled"].map((status) => ({
          label: status.charAt(0).toUpperCase() + status.slice(1),
          value: status,
          count: statusCounts[status as Task["status"]],
          icon: getStatusIcon(status as Task["status"]),
        })),
        icon: CircleDashed,
      },
      enableColumnFilter: true,
    },
    {
      id: "priority",
      accessorKey: "priority",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Priority' />
      ),
      cell: ({ cell }) => {
        const priority = cell.getValue<Task["priority"]>();

        if (!priority) return null;

        const Icon = getPriorityIcon(priority);

        return (
          <Badge variant='outline' className='py-1 [&>svg]:size-3.5'>
            <Icon />
            <span className='capitalize'>{priority}</span>
          </Badge>
        );
      },
      meta: {
        label: "Priority",
        variant: "multiSelect",
        options: ["low", "medium", "high"].map((priority) => ({
          label: priority.charAt(0).toUpperCase() + priority.slice(1),
          value: priority,
          count: priorityCounts[priority as Task["priority"]],
          icon: getPriorityIcon(priority as Task["priority"]),
        })),
        icon: ArrowUpDown,
      },
      enableColumnFilter: true,
    },
    {
      id: "estimatedHours",
      accessorKey: "estimatedHours",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Est. Hours' />
      ),
      cell: ({ cell }) => {
        const estimatedHours = cell.getValue<number>();
        return <div className='w-20 text-right'>{estimatedHours}</div>;
      },
      meta: {
        label: "Est. Hours",
        variant: "range",
        range: [estimatedHoursRange.min, estimatedHoursRange.max],
        unit: "hr",
        icon: Clock,
      },
      enableColumnFilter: true,
    },
    {
      id: "createdAt",
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Created At' />
      ),
      cell: ({ cell }) => formatDate(cell.getValue<Date>()),
      meta: {
        label: "Created At",
        variant: "dateRange",
        icon: CalendarIcon,
      },
      enableColumnFilter: true,
    },
    {
      id: "actions",
      cell: function Cell({ row }) {
        const [isUpdatePending, startUpdateTransition] = React.useTransition();

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label='Open menu'
                variant='ghost'
                className='flex size-8 p-0 data-[state=open]:bg-muted'
              >
                <Ellipsis className='size-4' aria-hidden='true' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-40'>
              <DropdownMenuItem
                onSelect={() => setRowAction({ row, variant: "update" })}
              >
                Edit
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Labels</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={row.original.label}
                    onValueChange={(value) => {
                      startUpdateTransition(() => {
                        toast.promise(
                          updateTask({
                            id: row.original.id,
                            label: value as Task["label"],
                          }).then(async (result) => {
                            if (result.data && !result.error) {
                              await db.tasks.put(result.data); // Update IndexedDB
                              await refreshTableData(); // Refresh table from IndexedDB
                              return "Label updated and synced"; // Message for success toast
                            } else if (result.error) {
                              throw new Error(result.error);
                            }
                            return "Label updated (no data returned or error)"; // Fallback message
                          }),
                          {
                            loading: "Updating label...",
                            success: (message) => message, // Use the message from the promise chain
                            error: (err) => getErrorMessage(err),
                          }
                        );
                      });
                    }}
                  >
                    {["bug", "feature", "documentation", "enhancement"].map(
                      (label) => (
                        <DropdownMenuRadioItem
                          key={label}
                          value={label}
                          className='capitalize'
                          disabled={isUpdatePending}
                        >
                          {label}
                        </DropdownMenuRadioItem>
                      )
                    )}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setRowAction({ row, variant: "delete" })}
              >
                Delete
                <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
      size: 40,
    },
  ];
}
