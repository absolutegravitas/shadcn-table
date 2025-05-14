"use client";

import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps,
} from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/next/app";
// import { useEffect } from "react"; // No longer needed for initializeDatabase

import { TooltipProvider } from "@/components/ui/tooltip";
// import { initializeDatabase } from "@/lib/indexeddb-data-service"; // No longer called here

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  // initializeDatabase(); // Removed from here, TasksProvider handles data initialization

  return (
    <NextThemesProvider {...props}>
      <TooltipProvider delayDuration={120}>
        <NuqsAdapter>{children}</NuqsAdapter>
      </TooltipProvider>
    </NextThemesProvider>
  );
}
