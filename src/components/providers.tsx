"use client";

import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps,
} from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { useEffect } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { initializeDatabase } from "@/lib/indexeddb-data-service";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  useEffect(() => {
    initializeDatabase();
  }, []);

  return (
    <NextThemesProvider {...props}>
      <TooltipProvider delayDuration={120}>
        <NuqsAdapter>{children}</NuqsAdapter>
      </TooltipProvider>
    </NextThemesProvider>
  );
}
