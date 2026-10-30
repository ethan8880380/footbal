"use client";

import { useState, type KeyboardEvent } from "react";

/** Hover or arrow keys pick a column; leaving the chart snaps back to `fallback`. */
export function useScrubber(length: number, fallback: number) {
  const [selected, setSelected] = useState<number | null>(null);
  const active = selected ?? fallback;
  const clear = () => setSelected(null);

  function onKeyDown(event: KeyboardEvent) {
    const move = KEY_MOVES[event.key];
    if (!move) return;
    event.preventDefault();
    setSelected((prev) => Math.min(length - 1, Math.max(0, move(prev ?? fallback, length))));
  }

  return {
    active,
    surfaceProps: { tabIndex: 0, onKeyDown, onBlur: clear, onPointerLeave: clear },
    columnProps: (index: number) => ({ onPointerEnter: () => setSelected(index) }),
  };
}

const KEY_MOVES: Record<string, (index: number, length: number) => number> = {
  ArrowLeft: (i) => i - 1,
  ArrowRight: (i) => i + 1,
  Home: () => 0,
  End: (_, length) => length - 1,
};
