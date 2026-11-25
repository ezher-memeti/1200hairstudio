// Retired legacy helper: its callback path/port disagreed and it printed tokens.
// Use the existing state-protected, development-only application flow instead.
console.error("Use npm run dev and /api/google/auth with GOOGLE_REDIRECT_URI configured for that server's /api/google/callback. Tokens are exported privately, never printed.");
process.exitCode = 1;
