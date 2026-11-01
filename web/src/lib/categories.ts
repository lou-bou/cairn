/** Category colors are theme tokens: --color-cat-<id>. */
export function categoryColor(id: string): string {
  return `var(--color-cat-${id})`;
}
