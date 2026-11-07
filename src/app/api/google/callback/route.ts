import { timingSafeEqual } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";

const OAUTH_STATE_COOKIE = "google_oauth_state";

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
  const response = new NextResponse(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
  response.cookies.set(OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 0,
    path: "/api/google/callback",
  });
  return response;
}

function validState(expected: string | undefined, received: string | null) {
  if (!expected || !received) return false;
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}

function refreshTokenOutputPath() {
  const configured = process.env.GOOGLE_REFRESH_TOKEN_OUTPUT_PATH?.trim();
  if (!configured || !isAbsolute(configured)) {
    throw new Error("GOOGLE_REFRESH_TOKEN_OUTPUT_PATH must be an absolute path outside the repository.");
  }
  const outputPath = resolve(configured);
  const repository = resolve(process.cwd());
  const repositoryRelativePath = relative(repository, outputPath);
  if (!repositoryRelativePath.startsWith("..") || repositoryRelativePath === "") {
    throw new Error("GOOGLE_REFRESH_TOKEN_OUTPUT_PATH must be outside the repository.");
  }
  return outputPath;
}

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return textResponse("Google OAuth token exchange is available in development only.", 403);
  }

  const oauthError = request.nextUrl.searchParams.get("error");
  if (oauthError) {
    return textResponse(`Google authorization failed: ${oauthError}`, 400);
  }

  if (!validState(request.cookies.get(OAUTH_STATE_COOKIE)?.value, request.nextUrl.searchParams.get("state"))) {
    return textResponse("Google OAuth state validation failed. Restart authorization through /api/google/auth.", 400);
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

    const outputPath = refreshTokenOutputPath();
    await writeFile(outputPath, `${refreshToken}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    return textResponse(
      "Google authorization succeeded. The refresh token was written to the configured private output file. The file was not overwritten and the token was not returned in the HTTP response.",
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
