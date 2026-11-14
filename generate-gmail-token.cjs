
const http = require("node:http");
const { google } = require("googleapis");

const redirectUri = "http://localhost:3000/api/google/callback";

const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
);

const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/gmail.send"],
});

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, redirectUri);

    if (url.pathname !== "/oauth2callback") {
        res.writeHead(404).end("Not found");
        return;
    }

    const code = url.searchParams.get("code");

    if (!code) {
        res.writeHead(400).end("Authorization code missing");
        return;
    }

    try {
        const { tokens } = await client.getToken(code);

        if (!tokens.refresh_token) {
            throw new Error("No refresh token returned");
        }

        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Authorization successful. Return to Terminal.");

        console.log("\nNEW GOOGLE REFRESH TOKEN:\n");
        console.log(tokens.refresh_token);
        console.log("\nKeep this token private.\n");

        server.close();
    } catch (error) {
        console.error("Token exchange failed:", error.message);
        res.writeHead(500).end("Token exchange failed");
        server.close();
    }
});

server.listen(3001, "127.0.0.1", () => {
    console.log("\nOpen this URL in your browser:\n");
    console.log(authUrl);
});
