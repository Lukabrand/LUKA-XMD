"use strict";

const { gmd } = require("../luka");

const {
    startPairing,
    getStatus,
} = require("../pairing");

// ══════════════════════════════════════════════════════════════════════════════
//                              LUKA-XMD PAIR
// ══════════════════════════════════════════════════════════════════════════════

gmd(
    {
        pattern: "pair",
        aliases: ["paircode", "link"],
        react: "🔐",
        category: "general",
        description: "Generate WhatsApp pairing code",
    },

    async (from, Guru, conText) => {
        const {
            mek,
            react,
            botName,
            reply,
            body,
        } = conText;

        try {

            const args = body
                .trim()
                .split(/\s+/)
                .slice(1);

            const phoneNumber = args[0]
                ? args[0].replace(/\D/g, "")
                : "";

            // ─── Number missing ──────────────────────────────────────────
            if (!phoneNumber) {
                return await reply(
`╭══〘〘 *${botName || "LUKA-XMD"} PAIR* 〙〙═⊷
┃
┃ 📱 *NUMBER REQUIRED*
┃
┃ ➜ *.pair 255768619068*
┃
╰═════════════════⊷`
                );
            }

            // ─── Basic validation ───────────────────────────────────────
            if (phoneNumber.length < 7) {
                return await reply(
`╭══〘〘 *${botName || "LUKA-XMD"} PAIR* 〙〙═⊷
┃
┃ ❌ *INVALID NUMBER*
┃
┃ 📱 Example:
┃    *.pair 255768619068*
┃
╰═════════════════⊷`
                );
            }

            // ─── Check current pairing status ────────────────────────────
            const current = getStatus();

            if (
                current.status === "requesting" ||
                current.status === "ready"
            ) {
                return await reply(
`╭══〘〘 *${botName || "LUKA-XMD"} PAIR* 〙〙═⊷
┃
┃ ⏳ *PAIRING IN PROGRESS*
┃
┃ Please wait for the current
┃ pairing request to finish.
┃
╰═════════════════⊷`
                );
            }

            await react("⏳");

            // ─── Start real Baileys pairing ──────────────────────────────
            await startPairing(phoneNumber);

            const status = getStatus();

            // ─── Pairing failed ──────────────────────────────────────────
            if (
                status.status !== "ready" ||
                !status.code
            ) {
                await react("❌");

                return await reply(
`╭══〘〘 *${botName || "LUKA-XMD"} PAIR* 〙〙═⊷
┃
┃ ❌ *PAIRING FAILED*
┃
┃ ${status.error || "Unable to generate pairing code."}
┃
╰═════════════════⊷`
                );
            }

            // ─── Send pairing code ──────────────────────────────────────
            await Guru.sendMessage(
                from,
                {
                    text:
`╭══〘〘 *${botName || "LUKA-XMD"} PAIR* 〙〙═⊷
┃
┃ 📱 *NUMBER :* ${phoneNumber}
┃
┃ 🔐 *PAIRING CODE*
┃
┃ ➜ *${status.code}*
┃
┃ 📲 Open WhatsApp
┃ ➜ Linked Devices
┃ ➜ Link a Device
┃ ➜ Link with phone number
┃
╰═════════════════⊷`,
                },
                {
                    quoted: mek,
                }
            );

            await react("✅");

        } catch (error) {

            console.error(
                "Pair Command Error:",
                error
            );

            await react("❌");

            return await reply(
`╭══〘〘 *${botName || "LUKA-XMD"} PAIR* 〙〙═⊷
┃
┃ ❌ *PAIRING ERROR*
┃
┃ ${error.message || "Something went wrong."}
┃
╰═════════════════⊷`
            );
        }
    }
);

module.exports = {};
