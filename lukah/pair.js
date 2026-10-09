"use strict";

const { gmd } = require("../luka");

// ═══════════════════════════════════════════════════════════════
//                       LUKA-XMD PAIR
// ═══════════════════════════════════════════════════════════════

gmd(
    {
        pattern: "pair",
        aliases: ["paircode", "getpair"],
        react: "🔗",
        category: "general",
        description: "Get WhatsApp pairing code",
    },

    async (from, Guru, conText) => {
        const { mek, body, reply, react } = conText;

        try {
            await react("🔗");

            const args = (body || "").trim().split(/\s+/);
            const phoneNumber = args[1]
                ? args[1].replace(/\D/g, "")
                : "";

            if (!phoneNumber) {
                return await reply(
                    "LUKA-XMD PAIRING\n\n" +
                    "Get your WhatsApp pairing code.\n\n" +
                    "Usage: .pair 255712345678\n\n" +
                    "Enter your phone number with country code, without the + sign."
                );
            }

            if (
                phoneNumber.length < 10 ||
                phoneNumber.length > 15
            ) {
                return await reply(
                    "Invalid phone number.\n\n" +
                    "Please enter a valid phone number with its country code."
                );
            }

            if (
                typeof Guru.requestPairingCode !== "function"
            ) {
                return await reply(
                    "Pairing is currently unavailable.\n\n" +
                    "The WhatsApp connection does not support pairing requests. " +
                    "Please configure pairing in the main bot file."
                );
            }

            await reply(
                "LUKA-XMD PAIRING\n\n" +
                "Generating your WhatsApp pairing code...\n" +
                "Please wait."
            );

            const code = await Guru.requestPairingCode(
                phoneNumber
            );

            await Guru.sendMessage(
                from,
                {
                    text:
                        "LUKA-XMD PAIRING\n\n" +
                        "Your WhatsApp pairing code is:\n\n" +
                        `${code}\n\n` +
                        "How to connect:\n" +
                        "1. Open WhatsApp on your phone.\n" +
                        "2. Go to Settings.\n" +
                        "3. Select Linked Devices.\n" +
                        "4. Tap Link a Device.\n" +
                        "5. Select Link with phone number.\n" +
                        "6. Enter the pairing code above.\n\n" +
                        "Important: Never share your pairing code with anyone."
                },
                {
                    quoted: mek,
                }
            );

            await react("✅");

        } catch (error) {
            console.error("LUKA-XMD Pair Error:", error);

            await reply(
                "PAIRING FAILED\n\n" +
                "Unable to generate your WhatsApp pairing code.\n\n" +
                "Please check your phone number, internet connection, " +
                "and WhatsApp connection status, then try again."
            );

            await react("❌");
        }
    }
);

module.exports = {};
