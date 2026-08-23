type SupabaseAuthLikeError = {
  name?: string;
  code?: string;
  status?: number;
  message?: string;
};

const STALE_REFRESH_ERROR_CODES = new Set([
  "refresh_token_not_found",
  "refresh_token_already_used",
  "invalid_refresh_token",
  "session_not_found",
]);

export function isStaleRefreshTokenError(
  error: SupabaseAuthLikeError | null | undefined,
) {
  if (!error) {
    return false;
  }

  const normalizedMessage = error.message?.toLowerCase() ?? "";
  const normalizedCode = error.code?.toLowerCase() ?? "";

  return (
    STALE_REFRESH_ERROR_CODES.has(normalizedCode) ||
    normalizedMessage.includes("refresh_token_not_found") ||
    normalizedMessage.includes("invalid refresh token") ||
    normalizedMessage.includes("refresh token not found") ||
    normalizedMessage.includes("refresh token has been revoked") ||
    normalizedMessage.includes("refresh token is invalid") ||
    normalizedMessage.includes("refresh token already used") ||
    normalizedMessage.includes("jwt expired") ||
    normalizedMessage.includes("session_not_found") ||
    normalizedMessage.includes("invalid_grant")
  );
}
