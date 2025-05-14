"use client";

import type { Column, Table } from "@tanstack/react-table";
import {
  BadgeCheck,
  CalendarIcon,
  Check,
  ListFilter,
  Text,
  X,
} from "lucide-react";
import { useQueryState } from "nuqs";
import * as React from "react";

import { DataTableRangeFilter } from "@/components/data-table/data-table-range-filter";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { getDefaultFilterOperator, getFilterOperators } from "@/lib/data-table";
import { formatDate } from "@/lib/format";
import { generateId } from "@/lib/id";
import { getFiltersStateParser } from "@/lib/parsers";
import { cn } from "@/lib/utils";
import type { ExtendedColumnFilter, FilterOperator } from "@/types/data-table";

const FILTERS_KEY = "filters";
const DEBOUNCE_MS = 300;
const THROTTLE_MS = 50;
const OPEN_MENU_SHORTCUT = "f";
const REMOVE_FILTER_SHORTCUTS = ["backspace", "delete"];

interface DataTableFilterMenuProps<TData>
  extends React.ComponentProps<typeof PopoverContent> {
  table: Table<TData>;
  debounceMs?: number;
  throttleMs?: number;
  shallow?: boolean;
}

export function DataTableFilterMenu<TData>({
  table,
  debounceMs = DEBOUNCE_MS,
  throttleMs = THROTTLE_MS,
  shallow = true,
  align = "start",
  ...props
}: DataTableFilterMenuProps<TData>) {
  const id = React.useId();

  const columns = React.useMemo(() => {
    return table
      .getAllColumns()
      .filter((column) => column.columnDef.enableColumnFilter);
  }, [table]);

  const [open, setOpen] = React.useState(false);
  const [selectedColumn, setSelectedColumn] =
    React.useState<Column<TData> | null>(null);
  const [inputValue, setInputValue] = React.useState("");
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const onOpenChange = React.useCallback((open: boolean) => {
    setOpen(open);

    if (!open) {
      setTimeout(() => {
        setSelectedColumn(null);
        setInputValue("");
      }, 100);
    }
  }, []);

  const onInputKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (
        REMOVE_FILTER_SHORTCUTS.includes(event.key.toLowerCase()) &&
        !inputValue &&
        selectedColumn
      ) {
        event.preventDefault();
        setSelectedColumn(null);
      }
    },
    [inputValue, selectedColumn]
  );

  const [filters, setFilters] = useQueryState(
    FILTERS_KEY,
    getFiltersStateParser<TData>(columns.map((field) => field.id))
      .withDefault([])
      .withOptions({
        clearOnDefault: true,
        shallow,
        throttleMs,
      })
  );
  const debouncedSetFilters = useDebouncedCallback(setFilters, debounceMs);

  const onFilterAdd = React.useCallback(
    (column: Column<TData>, value: string) => {
      if (!value.trim() && column.columnDef.meta?.variant !== "boolean") {
        return;
      }

      const filterValue =
        column.columnDef.meta?.variant === "multiSelect" ? [value] : value;

      const newFilter: ExtendedColumnFilter<TData> = {
        id: column.id as Extract<keyof TData, string>,
        value: filterValue,
        variant: column.columnDef.meta?.variant ?? "text",
        operator: getDefaultFilterOperator(
          column.columnDef.meta?.variant ?? "text"
        ),
        filterId: generateId({ length: 8 }),
      };

      debouncedSetFilters([...filters, newFilter]);
      setOpen(false);

      setTimeout(() => {
        setSelectedColumn(null);
        setInputValue("");
      }, 100);
    },
    [filters, debouncedSetFilters]
  );

  const onFilterRemove = React.useCallback(
    (filterId: string) => {
      const updatedFilters = filters.filter(
        (filter) => filter.filterId !== filterId
      );
      debouncedSetFilters(updatedFilters);
      requestAnimationFrame(() => {
        triggerRef.current?.focus();
      });
    },
    [filters, debouncedSetFilters]
  );

  const onFilterUpdate = React.useCallback(
    (
      filterId: string,
      updates: Partial<Omit<ExtendedColumnFilter<TData>, "filterId">>
    ) => {
      debouncedSetFilters((prevFilters) => {
        const updatedFilters = prevFilters.map((filter) => {
          if (filter.filterId === filterId) {
            return { ...filter, ...updates } as ExtendedColumnFilter<TData>;
          }
          return filter;
        });
        return updatedFilters;
      });
    },
    [debouncedSetFilters]
  );

  const onFiltersReset = React.useCallback(() => {
    debouncedSetFilters([]);
  }, [debouncedSetFilters]);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (
        event.key.toLowerCase() === OPEN_MENU_SHORTCUT &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        setOpen(true);
      }

      if (
        event.key.toLowerCase() === OPEN_MENU_SHORTCUT &&
        event.shiftKey &&
        !open &&
        filters.length > 0
      ) {
        event.preventDefault();
        onFilterRemove(filters[filters.length - 1]?.filterId ?? "");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, filters, onFilterRemove]);

  const onTriggerKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (
        REMOVE_FILTER_SHORTCUTS.includes(event.key.toLowerCase()) &&
        filters.length > 0
      ) {
        event.preventDefault();
        onFilterRemove(filters[filters.length - 1]?.filterId ?? "");
      }
    },
    [filters, onFilterRemove]
  );

  return (
    <div className='flex flex-wrap items-center gap-2'>
      {filters.map((filter) => (
        <DataTableFilterItem
          key={filter.filterId}
          filter={filter}
          filterItemId={`${id}-filter-${filter.filterId}`}
          columns={columns}
          onFilterUpdate={onFilterUpdate}
          onFilterRemove={onFilterRemove}
        />
      ))}
      {filters.length > 0 && (
        <Button
          aria-label='Reset all filters'
          variant='outline'
          size='icon'
          className='size-8'
          onClick={onFiltersReset}
        >
          <X />
        </Button>
      )}
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            aria-label='Open filter command menu'
            variant='outline'
            size={filters.length > 0 ? "icon" : "sm"}
            className={cn(filters.length > 0 && "size-8", "h-8")}
            ref={triggerRef}
            onKeyDown={onTriggerKeyDown}
          >
            <ListFilter />
            {filters.length > 0 ? null : "Filter"}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align={align}
          className='w-full max-w-[var(--radix-popover-content-available-width)] origin-[var(--radix-popover-content-transform-origin)] p-0'
          {...props}
        >
          <Command loop className='[&_[cmdk-input-wrapper]_svg]:hidden'>
            <CommandInput
              ref={inputRef}
              placeholder={
                selectedColumn
                  ? selectedColumn.columnDef.meta?.label ?? selectedColumn.id
                  : "Search fields..."
              }
              value={inputValue}
              onValueChange={setInputValue}
              onKeyDown={onInputKeyDown}
            />
            <CommandList>
              {selectedColumn ? (
                <>
                  {selectedColumn.columnDef.meta?.options && ( // This check is for simple options list
                    <CommandEmpty>No options found.</CommandEmpty>
                  )}
                  <FilterValueSelector // This renders specific command items based on variant
                    column={selectedColumn}
                    value={inputValue} // inputValue is for text search within options if FilterValueSelector implements it
                    onSelect={(value) => onFilterAdd(selectedColumn, value)}
                  />
                </>
              ) : (
                <>
                  <CommandEmpty>No fields found.</CommandEmpty>
                  <CommandGroup>
                    {columns.map((column) => (
                      <CommandItem
                        key={column.id}
                        value={column.id}
                        onSelect={() => {
                          setSelectedColumn(column);
                          setInputValue("");
                          requestAnimationFrame(() => {
                            inputRef.current?.focus();
                          });
                        }}
                      >
                        {column.columnDef.meta?.icon && (
                          <column.columnDef.meta.icon />
                        )}
                        <span className='truncate'>
                          {column.columnDef.meta?.label ?? column.id}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface DataTableFilterItemProps<TData> {
  filter: ExtendedColumnFilter<TData>;
  filterItemId: string;
  columns: Column<TData>[];
  onFilterUpdate: (
    filterId: string,
    updates: Partial<Omit<ExtendedColumnFilter<TData>, "filterId">>
  ) => void;
  onFilterRemove: (filterId: string) => void;
}

function _DataTableFilterItem<TData>({
  filter,
  filterItemId,
  columns,
  onFilterUpdate,
  onFilterRemove,
}: DataTableFilterItemProps<TData>) {
  const [showFieldSelector, setShowFieldSelector] = React.useState(false);
  const [showOperatorSelector, setShowOperatorSelector] = React.useState(false);
  const [showValueSelector, setShowValueSelector] = React.useState(false);

  const column = columns.find((column) => column.id === filter.id);
  if (!column) return null;

  const operatorListboxId = `${filterItemId}-operator-listbox`;
  const inputId = `${filterItemId}-input`;

  const columnMeta = column.columnDef.meta;
  const filterOperators = getFilterOperators(filter.variant);

  const onItemKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (showFieldSelector || showOperatorSelector || showValueSelector) {
        return;
      }

      if (REMOVE_FILTER_SHORTCUTS.includes(event.key.toLowerCase())) {
        event.preventDefault();
        onFilterRemove(filter.filterId);
      }
    },
    [
      filter.filterId,
      showFieldSelector,
      showOperatorSelector,
      showValueSelector,
      onFilterRemove,
    ]
  );

  return (
    <div
      key={filter.filterId}
      role='listitem'
      id={filterItemId}
      className='flex h-8 items-center rounded-md bg-background'
      onKeyDown={onItemKeyDown}
    >
      <Popover open={showFieldSelector} onOpenChange={setShowFieldSelector}>
        <PopoverTrigger asChild>
          <Button
            variant='ghost'
            size='sm'
            className='rounded-none rounded-l-md border border-r-0 font-normal dark:bg-input/30'
          >
            {columnMeta?.icon && (
              <columnMeta.icon className='text-muted-foreground' />
            )}
            {columnMeta?.label ?? column.id}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align='start'
          className='w-48 origin-[var(--radix-popover-content-transform-origin)] p-0'
        >
          <Command loop>
            <CommandInput placeholder='Search fields...' />
            <CommandList>
              <CommandEmpty>No fields found.</CommandEmpty>
              <CommandGroup>
                {columns.map((column) => (
                  <CommandItem
                    key={column.id}
                    value={column.id}
                    onSelect={() => {
                      onFilterUpdate(filter.filterId, {
                        id: column.id as Extract<keyof TData, string>,
                        variant: column.columnDef.meta?.variant ?? "text",
                        operator: getDefaultFilterOperator(
                          column.columnDef.meta?.variant ?? "text"
                        ),
                        value: "",
                      });

                      setShowFieldSelector(false);
                    }}
                  >
                    {column.columnDef.meta?.icon && (
                      <column.columnDef.meta.icon />
                    )}
                    <span className='truncate'>
                      {column.columnDef.meta?.label ?? column.id}
                    </span>
                    <Check
                      className={cn(
                        "ml-auto",
                        column.id === filter.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Select
        open={showOperatorSelector}
        onOpenChange={setShowOperatorSelector}
        value={filter.operator}
        onValueChange={(value: FilterOperator) =>
          onFilterUpdate(filter.filterId, {
            operator: value,
            value:
              value === "isEmpty" || value === "isNotEmpty" ? "" : filter.value,
          })
        }
      >
        <SelectTrigger
          aria-controls={operatorListboxId}
          className='h-8 rounded-none border-r-0 px-2.5 lowercase [&[data-size]]:h-8 [&_svg]:hidden'
        >
          <SelectValue placeholder={filter.operator} />
        </SelectTrigger>
        <SelectContent
          id={operatorListboxId}
          className='origin-[var(--radix-select-content-transform-origin)]'
        >
          {filterOperators.map((operator) => (
            <SelectItem
              key={operator.value}
              className='lowercase'
              value={operator.value}
            >
              {operator.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {onFilterInputRender({
        filter,
        column,
        inputId,
        onFilterUpdate,
        showValueSelector,
        setShowValueSelector,
      })}
      <Button
        aria-label='Remove filter'
        variant='ghost'
        size='icon'
        className='size-8 rounded-none rounded-r-md border border-l-0'
        onClick={() => onFilterRemove(filter.filterId)}
      >
        <X />
      </Button>
    </div>
  );
}
const DataTableFilterItem = React.memo(_DataTableFilterItem) as <TData>(
  props: DataTableFilterItemProps<TData>
) => React.ReactElement | null;

interface FilterValueSelectorProps<TData> {
  column: Column<TData>;
  value: string; // Input value for searching/matching options
  onSelect: (value: string) => void; // Callback with the selected option's actual value
}

function _FilterValueSelector<TData>({
  column,
  value,
  onSelect,
}: FilterValueSelectorProps<TData>) {
  const variant = column.columnDef.meta?.variant ?? "text";

  switch (variant) {
    case "boolean":
      return (
        <CommandGroup>
          <CommandItem value='true' onSelect={() => onSelect("true")}>
            True
          </CommandItem>
          <CommandItem value='false' onSelect={() => onSelect("false")}>
            False
          </CommandItem>
        </CommandGroup>
      );

    case "select": // Handles single select
    case "multiSelect": // multiSelect in FilterValueSelector implies adding one value at a time
      return (
        <CommandGroup>
          {column.columnDef.meta?.options
            ?.filter(
              (option) =>
                !value || // Show all if no input value
                option.label.toLowerCase().includes(value.toLowerCase())
            )
            .map((option) => (
              <CommandItem
                key={option.value}
                value={option.value}
                onSelect={() => onSelect(option.value)} // Pass option.value to onSelect
              >
                {option.icon && <option.icon />}
                <span className='truncate'>{option.label}</span>
                {option.count && (
                  <span className='ml-auto font-mono text-xs'>
                    {option.count}
                  </span>
                )}
              </CommandItem>
            ))}
        </CommandGroup>
      );

    case "date":
    case "dateRange": // For adding a single date point, then operator can make it a range
      return (
        <Calendar
          mode='single'
          // selected={value ? new Date(value) : undefined} // This might be tricky if value is not a valid date string
          onSelect={(date) => date && onSelect(date.toISOString())}
          className='p-2'
        />
      );
    default: {
      // Default to text-like behavior, potentially with suggestions
      const suggestions =
        column.columnDef.meta?.options
          ?.filter((option) =>
            option.label.toLowerCase().includes(value.toLowerCase())
          )
          .slice(0, 5) ?? [];
      // If no suggestions, or if user wants to input free text for a 'text' variant
      // A CommandItem to use the current input value directly might be needed here
      // For now, it only shows suggestions.
      return (
        <CommandGroup>
          {suggestions.map((option) => (
            <CommandItem
              key={option.value}
              value={option.value}
              onSelect={() => onSelect(option.value)}
            >
              {option.icon && <option.icon />}
              <span className='truncate'>{option.label}</span>
              {option.count && (
                <span className='ml-auto font-mono text-xs'>
                  {option.count}
                </span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      );
    }
  }
}
const FilterValueSelector = React.memo(_FilterValueSelector) as <TData>(
  props: FilterValueSelectorProps<TData>
) => React.ReactElement | null;

function onFilterInputRender<TData>({
  filter,
  column,
  inputId,
  onFilterUpdate,
  showValueSelector,
  setShowValueSelector,
}: {
  filter: ExtendedColumnFilter<TData>;
  column: Column<TData>;
  inputId: string;
  onFilterUpdate: (
    filterId: string,
    updates: Partial<Omit<ExtendedColumnFilter<TData>, "filterId">>
  ) => void;
  showValueSelector: boolean;
  setShowValueSelector: (value: boolean) => void;
}) {
  const columnMeta = column.columnDef.meta;

  if (filter.operator === "isEmpty" || filter.operator === "isNotEmpty") {
    return (
      <div
        id={inputId}
        role='status'
        aria-label={`${columnMeta?.label} filter is ${
          filter.operator === "isEmpty" ? "empty" : "not empty"
        }`}
        aria-live='polite'
        className='h-8 w-full rounded-r-md border border-l-0 bg-transparent dark:bg-input/30'
      />
    );
  }

  switch (filter.variant) {
    case "text":
    case "number":
    case "range": {
      if (
        (filter.variant === "range" && filter.operator === "isBetween") ||
        filter.operator === "isBetween" // Handles 'number' variant with 'isBetween' too
      ) {
        return (
          <DataTableRangeFilter
            filter={filter}
            column={column}
            inputId={inputId}
            onFilterUpdate={onFilterUpdate}
          />
        );
      }

      const isNumber =
        filter.variant === "number" || filter.variant === "range";

      return (
        <Input
          id={inputId}
          type={isNumber ? "number" : "text"} // Ensure type is "text" for text variant
          aria-label={`${columnMeta?.label} filter value`}
          aria-describedby={`${inputId}-description`}
          inputMode={isNumber ? "numeric" : "text"}
          placeholder={columnMeta?.placeholder ?? "Enter a value..."}
          className='h-8 w-full rounded-none rounded-r-md border border-l-0'
          defaultValue={
            // Use defaultValue for uncontrolled input if updates are debounced
            typeof filter.value === "string"
              ? filter.value
              : typeof filter.value === "number"
              ? String(filter.value)
              : ""
          }
          onChange={(
            event // This should ideally be debounced or use onBlur if performance is an issue
          ) =>
            onFilterUpdate(filter.filterId, {
              value: event.target.value,
            })
          }
        />
      );
    }

    case "boolean": {
      if (Array.isArray(filter.value)) return null;
      const inputListboxId = `${inputId}-listbox`;
      return (
        <Select
          open={showValueSelector}
          onOpenChange={setShowValueSelector}
          value={typeof filter.value === "boolean" ? String(filter.value) : ""}
          onValueChange={(value: string) =>
            onFilterUpdate(filter.filterId, {
              value: value === "true",
            })
          }
        >
          <SelectTrigger
            id={inputId}
            aria-controls={inputListboxId}
            aria-label={`${columnMeta?.label} boolean filter`}
            className='h-8 w-full rounded-none rounded-r-md border border-l-0 [&[data-size]]:h-8'
          >
            <SelectValue
              placeholder={
                filter.value === true
                  ? "True"
                  : filter.value === false
                  ? "False"
                  : "Select..."
              }
            />
          </SelectTrigger>
          <SelectContent id={inputListboxId}>
            <SelectItem value='true'>True</SelectItem>
            <SelectItem value='false'>False</SelectItem>
          </SelectContent>
        </Select>
      );
    }

    case "select":
    case "multiSelect": {
      const inputListboxId = `${inputId}-listbox`;
      const multiple = filter.variant === "multiSelect";
      const currentFilterValue = filter.value;
      let displayValue = `Select option${multiple ? "s" : ""}...`;

      if (multiple) {
        if (
          Array.isArray(currentFilterValue) &&
          currentFilterValue.length > 0
        ) {
          const validValues = currentFilterValue.filter(
            (v) => typeof v === "string"
          ) as string[];
          if (validValues.length > 0) {
            const optionsMap = new Map(
              columnMeta?.options?.map((opt) => [opt.value, opt.label])
            );
            displayValue = validValues
              .map((v) => optionsMap.get(v) || v)
              .join(", ");
            if (validValues.length > 2) {
              displayValue = `${validValues.length} selected`;
            }
          }
        }
      } else if (typeof currentFilterValue === "string" && currentFilterValue) {
        displayValue =
          columnMeta?.options?.find((opt) => opt.value === currentFilterValue)
            ?.label || currentFilterValue;
      }

      return (
        <Popover open={showValueSelector} onOpenChange={setShowValueSelector}>
          <PopoverTrigger asChild>
            <Button
              id={inputId}
              aria-controls={inputListboxId}
              aria-label={`${columnMeta?.label} filter value`}
              variant='ghost'
              size='sm'
              className='h-8 w-full justify-start rounded-none rounded-r-md border border-l-0 font-normal dark:bg-input/30'
            >
              <span className='truncate'>{displayValue}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            id={inputListboxId}
            align='start'
            className='w-[200px] origin-[var(--radix-popover-content-transform-origin)] p-0'
          >
            <Command loop>
              <CommandInput
                aria-label={`Search ${columnMeta?.label} options`}
                placeholder={columnMeta?.placeholder ?? "Search options..."}
              />
              <CommandList>
                <CommandEmpty>No options found.</CommandEmpty>
                <CommandGroup>
                  {columnMeta?.options?.map((option) => {
                    const isSelected = multiple
                      ? Array.isArray(currentFilterValue) &&
                        currentFilterValue.includes(option.value)
                      : currentFilterValue === option.value;
                    return (
                      <CommandItem
                        key={option.value}
                        value={option.value}
                        onSelect={() => {
                          let newValue: string | string[];
                          if (multiple) {
                            const currentArray = (
                              Array.isArray(currentFilterValue)
                                ? currentFilterValue.filter(
                                    (v) => typeof v === "string"
                                  )
                                : []
                            ) as string[];
                            if (isSelected) {
                              newValue = currentArray.filter(
                                (v) => v !== option.value
                              );
                            } else {
                              newValue = [...currentArray, option.value];
                            }
                          } else {
                            newValue = option.value;
                            setShowValueSelector(false); // Close popover on single select
                          }
                          onFilterUpdate(filter.filterId, { value: newValue });
                        }}
                      >
                        {option.icon && <option.icon />}
                        <span className='truncate'>{option.label}</span>
                        {multiple && (
                          <Check
                            className={cn(
                              "ml-auto h-4 w-4 text-primary",
                              isSelected ? "opacity-100" : "opacity-0"
                            )}
                          />
                        )}
                        {!multiple && isSelected && (
                          <Check className='ml-auto h-4 w-4 text-primary opacity-100' />
                        )}
                        {option.count && (
                          <span className='ml-auto font-mono text-xs'>
                            {option.count}
                          </span>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      );
    }

    case "date":
    case "dateRange": {
      const inputListboxId = `${inputId}-listbox`;
      const dateValue = Array.isArray(filter.value)
        ? (filter.value
            .map((v) => (v ? new Date(Number(v)) : undefined))
            .filter(Boolean) as Date[])
        : filter.value
        ? [new Date(Number(filter.value))]
        : [];

      let displayValue = "Pick a date";
      if (
        filter.operator === "isBetween" &&
        dateValue.length === 2 &&
        dateValue[0] &&
        dateValue[1]
      ) {
        displayValue = `${formatDate(dateValue[0])} - ${formatDate(
          dateValue[1]
        )}`;
      } else if (dateValue.length === 1 && dateValue[0]) {
        displayValue = formatDate(dateValue[0]);
      }

      return (
        <Popover open={showValueSelector} onOpenChange={setShowValueSelector}>
          <PopoverTrigger asChild>
            <Button
              id={inputId}
              aria-controls={inputListboxId}
              aria-label={`${columnMeta?.label} date filter`}
              variant='ghost'
              size='sm'
              className={cn(
                "h-8 w-full justify-start rounded-none rounded-r-md border border-l-0 text-left font-normal dark:bg-input/30",
                !filter.value && "text-muted-foreground"
              )}
            >
              <CalendarIcon className='mr-2 h-4 w-4' />
              <span className='truncate'>{displayValue}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            id={inputListboxId}
            align='start'
            className='w-auto origin-[var(--radix-popover-content-transform-origin)] p-0'
          >
            {filter.operator === "isBetween" ? (
              <Calendar
                aria-label={`Select ${columnMeta?.label} date range`}
                mode='range'
                initialFocus
                selected={
                  dateValue.length === 2 && dateValue[0] && dateValue[1]
                    ? { from: dateValue[0], to: dateValue[1] }
                    : undefined
                }
                onSelect={(dateRange) => {
                  onFilterUpdate(filter.filterId, {
                    value: dateRange
                      ? [
                          (dateRange.from?.getTime() ?? "").toString(),
                          (dateRange.to?.getTime() ?? "").toString(),
                        ]
                      : [],
                  });
                  if (dateRange?.from && dateRange.to)
                    setShowValueSelector(false);
                }}
              />
            ) : (
              <Calendar
                aria-label={`Select ${columnMeta?.label} date`}
                mode='single'
                initialFocus
                selected={dateValue[0] ?? undefined}
                onSelect={(date) => {
                  onFilterUpdate(filter.filterId, {
                    value: (date?.getTime() ?? "").toString(),
                  });
                  if (date) setShowValueSelector(false);
                }}
              />
            )}
          </PopoverContent>
        </Popover>
      );
    }

    default:
      return null;
  }
}
