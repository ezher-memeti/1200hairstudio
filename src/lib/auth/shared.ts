export const AUTH_GENERIC_INVALID_CREDENTIALS =
  "Invalid email or password.";

export const AUTH_GENERIC_FORGOT_PASSWORD_RESPONSE =
  "If an account exists for this email, a password reset link has been sent.";

export const AUTH_GENERIC_SIGNUP_EXISTS_RESPONSE =
  "An account may already exist with this email. Try logging in or reset your password.";

export const AUTH_RATE_LIMIT_RESPONSE =
  "Too many attempts. Please wait a moment and try again.";

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function validatePassword(value: string) {
  if (value.length < 8) {
    return "Password must be at least 8 characters.";
  }

  return null;
}

export function isRateLimitError(error: {
  status?: number;
  code?: string;
  message?: string;
} | null | undefined) {
  if (!error) {
    return false;
  }

  return (
    error.status === 429 ||
    error.code === "over_email_send_rate_limit" ||
    error.message?.toLowerCase().includes("rate limit") === true ||
    error.message?.toLowerCase().includes("too many requests") === true
  );
}
