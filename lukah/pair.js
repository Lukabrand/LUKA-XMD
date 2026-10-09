"use strict";

const { gmd } = require("../luka");
const pairing = require("../luka/pairing");

gmd(
{
pattern: "pair",
aliases: ["paircode", "getpair"],
react: "🔗",
category: "general",
description: "Generate a WhatsApp pairing code",
},

async (from, Guru, conText) => {
    const { body, react, reply } = conText;

    try {
        const args = (body || "").trim().split(/\s+/);
        const phone = (args[1] || "").replace(/\D/g, "");

        if (!phone) {
            return await reply(
                "LUKA-XMD PAIRING\n\n" +
                "Usage: .pair 255712345678\n\n" +
                "Enter your phone number with country code, without +."
            );
        }

        if (phone.length < 10 || phone.length > 15) {
            return await reply("Invalid phone number. Include your country code.");
        }

        if (typeof pairing.startPairing !== "function") {
            return await reply("Pairing service is unavailable. Check luka/pairing.js.");
        }

        await reply(
            "LUKA-XMD PAIRING\n\n" +
            "Requesting your pairing code. Please wait..."
        );

        await pairing.startPairing(phone);

        // Check whether the pairing request produced a result.
        let result = pairing.getStatus();

        for (let i = 0; i < 15 && result.status === "requesting"; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            result = pairing.getStatus();
        }

        if (result.code) {
            await reply(
                "LUKA-XMD PAIRING CODE\n\n" +
                "Code: " + result.code + "\n\n" +
                "Open WhatsApp on your phone:\n" +
                "Settings > Linked devices > Link a device > Link with phone number\n\n" +
                "Enter the code above."
            );

            await react("✅");
            return;
        }

        if (result.status === "error") {
            console.error("[LUKA PAIR ERROR]", result.error);

            await reply(
                "PAIRING FAILED\n\n" +
                (result.error || "WhatsApp did not return a pairing code.") +
                "\n\nCheck the Codespaces terminal for more details."
            );

            await react("❌");
            return;
        }

        await reply(
            "Pairing is taking longer than expected.\n\n" +
            "Status: " + result.status + "\n" +
            "Try again after checking the bot logs."
        );

    } catch (error) {
        console.error("[LUKA-XMD PAIR]", error);

        await reply(
            "PAIRING FAILED\n\n" +
            (error.message || "Unknown error occurred.")
        );

        await react("❌");
    }
}

);

module.exports = {};
