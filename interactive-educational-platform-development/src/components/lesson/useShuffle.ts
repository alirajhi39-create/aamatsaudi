"use client";

import { useMemo, useState } from "react";

/** Fisher–Yates shuffle (new array). */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Random permutation of the indexes 0..n-1. */
export function randomPerm(n: number): number[] {
  return shuffle(Array.from({ length: n }, (_, i) => i));
}

/** Shuffle that is guaranteed to differ from the original order (when n > 1). */
export function shuffleUnsorted<T>(items: readonly T[]): T[] {
  if (items.length < 2) return [...items];
  for (let attempt = 0; attempt < 10; attempt++) {
    const out = shuffle(items);
    if (out.some((v, i) => v !== items[i])) return out;
  }
  return [...items].reverse();
}

/**
 * A shuffled copy created once per mount (so options stay put while the student answers),
 * re-shuffled every time the slide is opened again or when `key` changes (e.g. a retry).
 * Pass a stable array (module constant) to avoid re-shuffling on every render.
 */
export function useShuffled<T>(items: readonly T[], key: unknown = 0): T[] {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => shuffle(items), [items, key]);
}

/** A random index permutation created once per mount. */
export function usePerm(n: number): number[] {
  const [perm] = useState(() => randomPerm(n));
  return perm;
}
