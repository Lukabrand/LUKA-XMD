// One-shot SESSION_ID setter.
//
// Run this from the Katabump console BEFORE starting the bot (or any time
// you need to replace the saved session), instead of relying on the
// interactive "> SESSION_ID:" prompt that index.js falls back to. This
// writes the .env file directly and exits immediately, so there's no
// waiting/timeout risk.
//
// Usage:
//   node guru/set-session.js "GURU~xxxxxxxxxxxxxxxxxxxx"
//
// After it finishes, restart the bot from the Katabump panel — it will
// find SESSION_ID already in .env and skip the paste prompt entirely.

const fs = require("fs");
const path = require("path");

const sessionId = process.argv[2];

if (!sessionId || !sessionId.trim()) {
    console.error("❌ No SESSION_ID provided.");
    console.error('   Usage: node guru/set-session.js "GURU~xxxxxxxxxxxx"');
    process.exit(1);
}

if (!sessionId.startsWith("GURU~")) {
    console.error("❌ Invalid format — SESSION_ID must start with 'GURU~'.");
    process.exit(1);
}

// This file lives in /guru, one level below the project root — same depth
// as guru/config.js, so this matches the path config.js reads from.
const envPath = path.join(__dirname, "..", ".env");

let envContent = "";
if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf8");
    envContent = envContent
        .split("\n")
        .filter((line) => !line.startsWith("SESSION_ID="))
        .join("\n");
    if (envContent && !envContent.endsWith("\n")) envContent += "\n";
}

fs.writeFileSync(envPath, `${envContent}SESSION_ID=${sessionId.trim()}\n`, "utf8");

console.log(`✅ SESSION_ID saved to ${envPath}`);
console.log("   Restart the bot now — it will start without prompting.");
