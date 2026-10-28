/** The invite token from a pasted link (`mega://join/<token>`, `https://…/join/<token>`) or a bare code. */
export function extractToken(input: string): string {
  const trimmed = input.trim();
  return trimmed.split('/').filter(Boolean).pop() ?? trimmed;
}
