"use strict";

const { gmd } = require("../luka");
const pairing = require("../luka/pairing");

// ══════════════════════════════════════════════════════════════
// LUKA-XMD PAIRING COMMAND
// ══════════════════════════════════════════════════════════════

gmd(
    {
        pattern: "pair",
        aliases: ["paircode", "getpair"],
        react: "🔗",
        category: "general",
        description: "Generate a WhatsApp pairing code",
    },

    async (from, Guru, conText) => {
        const { body, mek, react, reply } = conText;

        try {
            const args = (body || "").trim().split(/\s+/);
            const phone = (args[1] || "").replace(/\D/g, "");

            if (!phone) {
                return await reply(
                    "LUKA-XMD PAIRING\n\n" +
                    "Usage: .pair 255712345678\n\n" +
                    "Enter your phone number with country code, " +
                    "without the plus sign."
                );
            }

            if (phone.length < 10 || phone.length > 15) {
                return await reply(
                    "Invalid phone number.\n\n" +
                    "Please enter a valid phone number with country code."
                );
            }

            if (typeof pairing.startPairing !== "function") {
                return await reply(
                    "Pairing service is unavailable.\n\n" +
                    "Please check the luka/pairing module."
                );
            }

            await reply(
                "LUKA-XMD PAIRING\n\n" +
                "Your pairing request is being processed.\n" +
                "Please wait..."
            );

            await pairing.startPairing(phone);

            await react("✅");

        } catch (error) {
            console.error("[LUKA-XMD PAIR]", error);

            await reply(
                "PAIRING FAILED\n\n" +
                "Unable to start the pairing request.\n" +
                "Please check the bot logs and try again."
            );

            await react("❌");
        }
    }
);

module.exports = {};
