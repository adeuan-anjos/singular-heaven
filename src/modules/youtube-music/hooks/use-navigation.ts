import { useState, useCallback } from "react";
import type { StackPage } from "../types/music";

export function useNavigation() {
  const [stack, setStack] = useState<StackPage[]>([]);
  const [forwardStack, setForwardStack] = useState<StackPage[]>([]);

  const push = useCallback((page: StackPage) => {
    setStack((prev) => [...prev, page]);
    setForwardStack([]);
  }, []);

  const pop = useCallback(() => {
    setStack((prev) => {
      if (prev.length === 0) return prev;
      const popped = prev[prev.length - 1];
      setForwardStack((fwd) => [popped, ...fwd]);
      return prev.slice(0, -1);
    });
  }, []);

  const forward = useCallback(() => {
    setForwardStack((fwd) => {
      if (fwd.length === 0) return fwd;
      const next = fwd[0];
      setStack((prev) => [...prev, next]);
      return fwd.slice(1);
    });
  }, []);

  const clear = useCallback(() => {
    setStack([]);
    setForwardStack([]);
  }, []);

  const currentPage = stack.length > 0 ? stack[stack.length - 1] : null;
  const canGoBack = stack.length > 0;
  const canGoForward = forwardStack.length > 0;

  return { stack, currentPage, push, pop, forward, clear, canGoBack, canGoForward } as const;
}
