import isEqual from "lodash.isequal";
import * as React from "react";

// Helper hook to store the previous value
function usePrevious<T>(value: T): T | undefined {
  const ref = React.useRef<T | undefined>(undefined); // Correctly initialized with undefined
  React.useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}

/**
 * A custom useEffect hook that only triggers if the dependencies have changed based on a deep comparison.
 * @param callback Effect callback to run.
 * @param dependencies Dependencies array to compare.
 */
export function useDeepCompareEffect(
  callback: React.EffectCallback,
  dependencies: React.DependencyList
): void {
  const previousDependencies = usePrevious(dependencies);

  React.useEffect(() => {
    // Only call the callback if the dependencies array has actually changed deeply.
    if (!isEqual(previousDependencies, dependencies)) {
      return callback();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dependencies, callback, previousDependencies]);
}
