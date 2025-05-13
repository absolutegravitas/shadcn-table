"use client";

import type { Column } from "@tanstack/react-table";
import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ExtendedColumnFilter } from "@/types/data-table";

interface DataTableRangeFilterProps<TData> extends React.ComponentProps<"div"> {
  filter: ExtendedColumnFilter<TData>;
  column: Column<TData>;
  inputId: string;
  onFilterUpdate: (
    filterId: string,
    updates: Partial<Omit<ExtendedColumnFilter<TData>, "filterId">>
  ) => void;
}

export function DataTableRangeFilter<TData>({
  filter,
  column,
  inputId,
  onFilterUpdate,
  className,
  ...props
}: DataTableRangeFilterProps<TData>) {
  const meta = column.columnDef.meta;

  const [min, max] = React.useMemo(() => {
    const range = column.columnDef.meta?.range;
    if (range) return range;

    const values = column.getFacetedMinMaxValues();
    if (!values) return [0, 100];

    return [values[0], values[1]];
  }, [column]);

  const formatValue = React.useCallback(
    (value: string | number | undefined) => {
      if (value === undefined || value === "") return "";
      const numValue = Number(value);
      return Number.isNaN(numValue)
        ? ""
        : numValue.toLocaleString(undefined, {
            maximumFractionDigits: 0,
          });
    },
    []
  );

  const value = React.useMemo(() => {
    if (
      Array.isArray(filter.value) &&
      typeof filter.value[0] === "number" &&
      typeof filter.value[1] === "number"
    ) {
      return [formatValue(filter.value[0]), formatValue(filter.value[1])];
    }
    return ["", ""];
  }, [filter.value, formatValue]);

  const onRangeValueChange = React.useCallback(
    (inputValue: string, isMin?: boolean) => {
      const numValue = Number(inputValue);
      const parsedNumValue = Number.isNaN(numValue) ? undefined : numValue;

      // Treat current filter.value as [number, number] | undefined
      const currentValues: [number | undefined, number | undefined] =
        Array.isArray(filter.value) &&
        typeof filter.value[0] === "number" &&
        typeof filter.value[1] === "number"
          ? [filter.value[0], filter.value[1]]
          : [undefined, undefined];

      const newValues: [number | undefined, number | undefined] = isMin
        ? [parsedNumValue, currentValues[1]]
        : [currentValues[0], parsedNumValue];

      // Determine the value to update the filter state with based on the schema
      let updatedFilterValue: number[] | undefined = undefined;
      if (
        typeof newValues[0] === "number" &&
        typeof newValues[1] === "number"
      ) {
        updatedFilterValue = [newValues[0], newValues[1]];
      } else if (newValues[0] === undefined && newValues[1] === undefined) {
        updatedFilterValue = undefined; // Clear the filter if both are empty
      } else {
        // If only one value is set, clear the filter as partial ranges are not supported by the schema
        updatedFilterValue = undefined;
      }

      onFilterUpdate(filter.filterId, {
        value: updatedFilterValue,
      });
    },
    [filter.filterId, filter.value, onFilterUpdate]
  );

  return (
    <div
      data-slot='range'
      className={cn("flex w-full items-center gap-2", className)}
      {...props}
    >
      <Input
        id={`${inputId}-min`}
        type='number'
        aria-label={`${meta?.label} minimum value`}
        aria-valuemin={min}
        aria-valuemax={max}
        data-slot='range-min'
        inputMode='numeric'
        placeholder={min.toString()}
        min={min}
        max={max}
        className='h-8 w-full rounded'
        defaultValue={value[0]}
        onChange={(event) => onRangeValueChange(event.target.value, true)}
      />
      <span className='sr-only shrink-0 text-muted-foreground'>to</span>
      <Input
        id={`${inputId}-max`}
        type='number'
        aria-label={`${meta?.label} maximum value`}
        aria-valuemin={min}
        aria-valuemax={max}
        data-slot='range-max'
        inputMode='numeric'
        placeholder={max.toString()}
        min={min}
        max={max}
        className='h-8 w-full rounded'
        defaultValue={value[1]}
        onChange={(event) => onRangeValueChange(event.target.value)}
      />
    </div>
  );
}
