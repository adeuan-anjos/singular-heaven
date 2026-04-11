import { create } from "zustand";

type NavigateOptions = { replace?: boolean };

interface HistoryState {
  stack: string[];
  index: number;
  forward: string[];
}

interface HistoryActions {
  navigate: (to: string, opts?: NavigateOptions) => void;
  back: () => void;
  forwardOne: () => void;
  reset: (to: string) => void;
}

const INITIAL_PATH = "/home";

export const useHistoryStore = create<HistoryState & HistoryActions>((set, get) => ({
  stack: [INITIAL_PATH],
  index: 0,
  forward: [],

  navigate: (to, opts) => {
    const { stack, index } = get();
    if (stack[index] === to) return;

    if (opts?.replace) {
      const next = stack.slice(0, index).concat(to);
      console.log(`[history] replace ${JSON.stringify({ from: stack[index], to })}`);
      set({ stack: next, index: next.length - 1, forward: [] });
      return;
    }

    const truncated = stack.slice(0, index + 1);
    console.log(`[history] push ${JSON.stringify({ from: stack[index], to, newIndex: truncated.length })}`);
    set({ stack: [...truncated, to], index: truncated.length, forward: [] });
  },

  back: () => {
    const { stack, index, forward } = get();
    if (index === 0) return;
    console.log(`[history] back ${JSON.stringify({ from: stack[index], to: stack[index - 1] })}`);
    set({ index: index - 1, forward: [stack[index], ...forward] });
  },

  forwardOne: () => {
    const { stack, index, forward } = get();
    if (forward.length === 0) return;
    const [next, ...rest] = forward;
    console.log(`[history] forward ${JSON.stringify({ from: stack[index], to: next })}`);
    set({ stack: [...stack.slice(0, index + 1), next], index: index + 1, forward: rest });
  },

  reset: (to) => {
    console.log(`[history] reset ${JSON.stringify({ to })}`);
    set({ stack: [to], index: 0, forward: [] });
  },
}));

const useFullLocation = () => useHistoryStore((s) => s.stack[s.index]);

function splitPath(full: string): string {
  const idx = full.indexOf("?");
  return idx >= 0 ? full.slice(0, idx) : full;
}

function splitSearch(full: string): string {
  const idx = full.indexOf("?");
  return idx >= 0 ? full.slice(idx + 1) : "";
}

export const useMemoryLocation = (): [
  string,
  (to: string, opts?: NavigateOptions) => void,
] => {
  const full = useFullLocation();
  const navigate = useHistoryStore((s) => s.navigate);
  return [splitPath(full), navigate];
};

export const useMemorySearch = (): string => {
  const full = useFullLocation();
  return splitSearch(full);
};

export const useCanGoBack = () => useHistoryStore((s) => s.index > 0);
export const useCanGoForward = () => useHistoryStore((s) => s.forward.length > 0);
export const useHistoryBack = () => useHistoryStore((s) => s.back);
export const useHistoryForward = () => useHistoryStore((s) => s.forwardOne);
