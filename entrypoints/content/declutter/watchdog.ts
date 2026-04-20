import type { DeclutterRule } from "./rules";

export const evaluateSelectorMisses = (
  activeRules: DeclutterRule[],
  querySelector: (selector: string) => boolean
): string[] => {
  const misses: string[] = [];

  for (const rule of activeRules) {
    if (rule.selector.health !== "required") {
      continue;
    }

    if (querySelector(rule.selector.primary)) {
      continue;
    }

    if (rule.selector.fallbacks.length === 0) {
      continue;
    }

    const hasFallback = rule.selector.fallbacks.some((selector) => querySelector(selector));
    if (!hasFallback) {
      continue;
    }

    misses.push(rule.id);
  }

  return misses;
};
