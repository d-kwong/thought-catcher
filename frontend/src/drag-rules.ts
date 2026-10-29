export function dragStarted(x: number, y: number, startX: number, startY: number): boolean {
  return Math.hypot(x - startX, y - startY) >= 5;
}
export function validDrop(isTrash: boolean, column: string | undefined, activityType: string): boolean {
  return isTrash || (activityType === 'task' && ['todo', 'in_progress', 'done'].includes(column || ''));
}
