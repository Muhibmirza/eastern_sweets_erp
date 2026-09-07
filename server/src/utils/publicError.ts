const safeMessages = new Set([
  'Employee not found', 'Production order not found', 'Completed production orders cannot be edited',
  'Recipe not found', 'Planned quantity must be greater than zero', 'Production order is already completed'
]);

export function publicError(error: unknown, fallback: string) {
  return error instanceof Error && safeMessages.has(error.message) ? error.message : fallback;
}
