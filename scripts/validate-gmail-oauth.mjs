import { google } from "googleapis";

const required = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

try {
  const oauth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID.trim(),
    process.env.GOOGLE_CLIENT_SECRET.trim(),
  );
  oauth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN.trim() });
  const { token } = await oauth.getAccessToken();
  if (!token) throw new Error("Google did not return an access token.");
  const { scopes } = await oauth.getTokenInfo(token);
  if (!scopes.includes("https://www.googleapis.com/auth/gmail.send")) {
    console.error("Gmail OAuth validation failed: required gmail.send permission is missing.");
    process.exit(1);
  }
  console.log("Gmail OAuth validation passed: access-token refresh and gmail.send permission verified. Sender identity and inbox delivery are not verified. No email was sent and no credential was printed.");
} catch (error) {
  // Never interpolate arbitrary SDK codes/messages; they can contain request data.
  const providerCode = error?.response?.data?.error ?? error?.code;
  const code = ["invalid_grant", "invalid_client", "access_denied"].includes(providerCode) ? providerCode : "oauth_validation_failed";
  console.error(`Gmail OAuth validation failed (code: ${code}). Credentials were not printed.`);
  process.exit(1);
}
