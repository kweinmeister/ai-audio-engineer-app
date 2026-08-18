/**
 * Pull a human readable message out of an unknown thrown value.
 *
 * Fall back to the supplied text when the value carries no usable message,
 * which keeps `catch` blocks free of `any` without losing the original detail.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;

  if (typeof error === "object" && error !== null && "message" in error) {
    const { message } = error as { message: unknown };
    if (typeof message === "string" && message) return message;
  }

  return fallback;
}
