/**
 * Client-side validation helpers. These intentionally mirror the backend's
 * own rules (see apps/api/src/controllers/authController.ts) so a user
 * gets instant feedback in the form instead of waiting on a round-trip to
 * the API to find out a field was invalid — the backend still re-validates
 * everything itself and remains the actual source of truth.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export const PASSWORD_MIN_LENGTH = 8;

export function passwordError(value: string): string | null {
  if (!value) return "Password is required.";
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  return null;
}

export function emailError(value: string): string | null {
  if (!value.trim()) return "Email is required.";
  if (!isValidEmail(value)) return "Enter a valid email address.";
  return null;
}

export function requiredError(value: string, label: string): string | null {
  if (!value.trim()) return `${label} is required.`;
  return null;
}
