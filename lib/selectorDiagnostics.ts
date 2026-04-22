import type { SelectorMissEvent } from "./messaging";

export interface SelectorMissBuffer {
  push: (entry: SelectorMissEvent) => void;
  snapshot: () => SelectorMissEvent[];
  size: () => number;
}

export const createSelectorMissBuffer = (maxEntries: number): SelectorMissBuffer => {
  const events: SelectorMissEvent[] = [];

  return {
    push(entry) {
      events.push(entry);
      if (events.length > maxEntries) {
        events.shift();
      }
    },
    snapshot() {
      return [...events];
    },
    size() {
      return events.length;
    }
  };
};
