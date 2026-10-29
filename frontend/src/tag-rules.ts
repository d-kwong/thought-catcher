export const typeTags = ['note', 'task', 'event'] as const;
export function addLabels(current: string[], incoming: string[]): string[] {
  const names = incoming.map(name => name.trim()).filter(Boolean);
  const selected = names.filter(name => typeTags.includes(name as typeof typeTags[number])).at(-1);
  return [...new Set([
    ...(selected ? [selected] : current.filter(name => typeTags.includes(name as typeof typeTags[number]))),
    ...current.filter(name => !typeTags.includes(name as typeof typeTags[number])),
    ...names.filter(name => !typeTags.includes(name as typeof typeTags[number])),
  ])];
}
