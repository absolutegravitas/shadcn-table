import { isRedirectError } from "next/dist/client/components/redirect-error";
import { z } from "zod";

export function getErrorMessage(err: unknown) {
  const unknownError = "Something went wrong, please try again later.";

  if (err instanceof z.ZodError) {
    const errors = err.issues.map((issue) => {
      return issue.message;
    });
    return errors.join("\n");
  }

  if (err instanceof Error) {
    return err.message;
  }

  if (isRedirectError(err)) {
    throw err;
  }

  // Handle other unknown types, including plain objects
  if (typeof err === "object" && err !== null) {
    try {
      // Attempt to stringify the object if it's a plain object
      return JSON.stringify(err);
    } catch (stringifyError) {
      // If stringification fails, fall back to a generic error message
      console.error("Failed to stringify error object:", stringifyError);
      return unknownError;
    }
  }

  // For primitive types or other unhandled cases, convert to string
  if (typeof err === "string") {
    return err;
  }

  // Fallback for anything else
  // Fallback for anything else - ensure a string is always returned
  return String(err);
}
