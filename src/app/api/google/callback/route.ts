import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";

function getRequiredEnvironmentVariable(
  name: "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "GOOGLE_REDIRECT_URI",
) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing ${name}.`);
  }

  return value;
}

function createOAuthClient() {
  return new google.auth.OAuth2(
    getRequiredEnvironmentVariable("GOOGLE_CLIENT_ID"),
    getRequiredEnvironmentVariable("GOOGLE_CLIENT_SECRET"),
    getRequiredEnvironmentVariable("GOOGLE_REDIRECT_URI"),
  );
}

function textResponse(message: string, status: number) {
  return new NextResponse(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return textResponse("Google OAuth token exchange is available in development only.", 403);
  }

  const oauthError = request.nextUrl.searchParams.get("error");
  if (oauthError) {
    return textResponse(`Google authorization failed: ${oauthError}`, 400);
  }

  const code = request.nextUrl.searchParams.get("code")?.trim();
  if (!code) {
    return textResponse("Missing Google OAuth authorization code.", 400);
  }

  try {
    const oauth2Client = createOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    const refreshToken = tokens.refresh_token;

    if (!refreshToken) {
      return textResponse(
        "Google did not return a refresh token. Revoke the app's access in your Google Account, then restart authorization through /api/google/auth.",
        422,
      );
    }

    return textResponse(
      `Google authorization succeeded.\n\nReplace GOOGLE_REFRESH_TOKEN in .env.local with:\n\n${refreshToken}\n\nKeep this token private and restart the development server after updating the environment variable.`,
      200,
    );
  } catch (error) {
    console.error("GOOGLE OAUTH CALLBACK ERROR", {
      message: error instanceof Error ? error.message : "Unknown OAuth error",
    });

    return textResponse(
      "Unable to complete Google authorization. Confirm the redirect URI and OAuth environment variables, then try again.",
      500,
    );
  }
}
