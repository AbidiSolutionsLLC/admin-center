import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Keeps one string value in the URL query string (DRD 9.2: filter, tab and
 * drawer state live in the URL). An empty or default value removes the key.
 */
export function useUrlParam(key: string, defaultValue = ''): [string, (value: string) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? defaultValue;
  const setValue = useCallback(
    (next: string) => {
      setParams(
        (prev) => {
          const copy = new URLSearchParams(prev);
          if (!next || next === defaultValue) copy.delete(key);
          else copy.set(key, next);
          return copy;
        },
        { replace: true },
      );
    },
    [key, defaultValue, setParams],
  );
  return [value, setValue];
}
