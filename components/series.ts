/** Resolves a store's palette slot to the CSS variable holding its colour. */
export function seriesVar(slot: number): string {
  const clamped = ((slot - 1) % 6 + 6) % 6 + 1;
  return `var(--series-${clamped})`;
}
