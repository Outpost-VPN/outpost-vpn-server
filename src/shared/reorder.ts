export function reorder<T extends {id: string}>(items: readonly T[], source: string, target: string, after = false): T[] {
  const next = items.slice();
  const from = next.findIndex((item) => item.id === source);
  if (from < 0 || source === target || !next.some((item) => item.id === target)) return next;
  const moved = next.splice(from, 1)[0]!;
  const to = next.findIndex((item) => item.id === target) + Number(after);
  next.splice(to, 0, moved);
  return next;
}
