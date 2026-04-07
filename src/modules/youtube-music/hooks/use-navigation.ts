import { useState, useCallback } from "react";
import type { StackPage } from "../types/music";

export function useNavigation() {
  const [stack, setStack] = useState<StackPage[]>([]);

  const push = useCallback((page: StackPage) => {
    setStack((prev) => [...prev, page]);
  }, []);

  const pop = useCallback(() => {
    setStack((prev) => prev.slice(0, -1));
  }, []);

  const clear = useCallback(() => {
    setStack([]);
  }, []);

  const currentPage = stack.length > 0 ? stack[stack.length - 1] : null;

  return { stack, currentPage, push, pop, clear } as const;
}
