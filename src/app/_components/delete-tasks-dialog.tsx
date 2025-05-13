"use client";

import type { Task } from "@/db/indexeddb"; // Import Task from indexeddb
import type { Row } from "@tanstack/react-table";
import { Loader, Trash } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useMediaQuery } from "@/hooks/use-media-query";
import { db } from "@/db/indexeddb"; // Import Dexie db instance

import { deleteTask, deleteTasks } from "../_lib/actions"; // Import both actions

interface DeleteTasksDialogProps
  extends React.ComponentPropsWithoutRef<typeof Dialog> {
  tasks: Row<Task>["original"][];
  showTrigger?: boolean;
  onSuccess?: () => void;
}

export function DeleteTasksDialog({
  tasks,
  showTrigger = true,
  onSuccess,
  ...props
}: DeleteTasksDialogProps) {
  const [isDeletePending, startDeleteTransition] = React.useTransition();
  const isDesktop = useMediaQuery("(min-width: 640px)");

  function onDelete() {
    startDeleteTransition(async () => {
      let result: { error: string | null } | undefined;
      const taskIdsToDelete = tasks.map((task) => task.id);

      if (tasks.length === 1 && tasks[0]) {
        result = await deleteTask({ id: tasks[0].id });
      } else if (tasks.length > 0) {
        result = await deleteTasks({ ids: taskIdsToDelete });
      } else {
        toast.error("No tasks selected for deletion.");
        return;
      }

      if (result?.error) {
        toast.error(result.error);
        return;
      }

      // Successfully deleted from server (Redis), now delete from IndexedDB
      try {
        await db.tasks.bulkDelete(taskIdsToDelete);
        toast.success(
          tasks.length === 1 ? "Task deleted" : `${tasks.length} tasks deleted`
        );
        props.onOpenChange?.(false); // Close dialog
        onSuccess?.(); // Trigger table refresh (passed from TasksTable)
      } catch (idbError) {
        console.error("Error deleting tasks from IndexedDB:", idbError);
        toast.error(
          "Tasks deleted from server, but failed to update local data."
        );
        // Still call onSuccess to refresh from server/IDB state if possible
        props.onOpenChange?.(false);
        onSuccess?.();
      }
    });
  }

  if (isDesktop) {
    return (
      <Dialog {...props}>
        {showTrigger ? (
          <DialogTrigger asChild>
            <Button variant='outline' size='sm'>
              <Trash className='mr-2 size-4' aria-hidden='true' />
              Delete ({tasks.length})
            </Button>
          </DialogTrigger>
        ) : null}
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you absolutely sure?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete your{" "}
              <span className='font-medium'>{tasks.length}</span>
              {tasks.length === 1 ? " task" : " tasks"} from our servers.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className='gap-2 sm:space-x-0'>
            <DialogClose asChild>
              <Button variant='outline'>Cancel</Button>
            </DialogClose>
            <Button
              aria-label='Delete selected rows'
              variant='destructive'
              onClick={onDelete}
              disabled={isDeletePending}
            >
              {isDeletePending && (
                <Loader
                  className='mr-2 size-4 animate-spin'
                  aria-hidden='true'
                />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer {...props}>
      {showTrigger ? (
        <DrawerTrigger asChild>
          <Button variant='outline' size='sm'>
            <Trash className='mr-2 size-4' aria-hidden='true' />
            Delete ({tasks.length})
          </Button>
        </DrawerTrigger>
      ) : null}
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Are you absolutely sure?</DrawerTitle>
          <DrawerDescription>
            This action cannot be undone. This will permanently delete your{" "}
            <span className='font-medium'>{tasks.length}</span>
            {tasks.length === 1 ? " task" : " tasks"} from our servers.
          </DrawerDescription>
        </DrawerHeader>
        <DrawerFooter className='gap-2 sm:space-x-0'>
          <DrawerClose asChild>
            <Button variant='outline'>Cancel</Button>
          </DrawerClose>
          <Button
            aria-label='Delete selected rows'
            variant='destructive'
            onClick={onDelete}
            disabled={isDeletePending}
          >
            {isDeletePending && (
              <Loader className='mr-2 size-4 animate-spin' aria-hidden='true' />
            )}
            Delete
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
