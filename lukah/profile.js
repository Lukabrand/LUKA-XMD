"use strict";

const { gmd } = require("../luka");

gmd(
    {
        pattern: "profile",
        aliases: ["me", "myprofile"],
        category: "user",
        react: "👤",
        description: "Display your WhatsApp profile information",
    },

    async (from, Guru, conText) => {
        const { mek, reply } = conText;

        try {
            const sender =
                mek?.key?.participant ||
                mek?.key?.remoteJid ||
                from;

            const jid = sender || from;

            const number = jid
                .split("@")[0]
                .split(":")[0];

            let name =
                mek?.pushName ||
                "WhatsApp User";

            let profilePicture = null;

            // Try to retrieve the user's WhatsApp profile picture
            try {
                profilePicture = await Guru.profilePictureUrl(
                    jid,
                    "image"
                );
            } catch (_) {
                profilePicture = null;
            }

            // Determine account type
            const accountType = jid.endsWith("@g.us")
                ? "Group"
                : jid.endsWith("@lid")
                ? "WhatsApp User"
                : "Personal Account";

            // Determine chat type
            const chatType = String(from).endsWith("@g.us")
                ? "Group Chat"
                : "Private Chat";

            const date = new Date();

            const dateText = date.toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "long",
                year: "numeric",
            });

            const timeText = date.toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
            });

            const caption =
                "╭━━━〔 👤 *LUKA-XMD PROFILE* 〕━━━╮\n" +
                "┃\n" +
                "┃ 👤 *Name:* " + name + "\n" +
                "┃ 📱 *Number:* " + number + "\n" +
                "┃ 🏷️ *Account:* " + accountType + "\n" +
                "┃ 💬 *Chat Type:* " + chatType + "\n" +
                "┃ 📅 *Date:* " + dateText + "\n" +
                "┃ ⏰ *Time:* " + timeText + "\n" +
                "┃\n" +
                "╰━━━━━━━━━━━━━━━━━━━━╯\n\n" +
                "> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ*";

            if (profilePicture) {
                try {
                    const axios = require("axios");

                    const response = await axios.get(
                        profilePicture,
                        {
                            responseType: "arraybuffer",
                            timeout: 15000,
                        }
                    );

                    return await Guru.sendMessage(
                        from,
                        {
                            image: Buffer.from(response.data),
                            caption: caption,
                        },
                        { quoted: mek }
                    );
                } catch (_) {
                    // Send text if the profile picture cannot be downloaded
                }
            }

            return await reply(caption);

        } catch (error) {
            console.error(
                "[LUKA-XMD PROFILE ERROR]",
                error.stack || error.message
            );

            return reply(
                "❌ Unable to retrieve your profile information.\n\n" +
                "> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ*"
            );
        }
    }
);

module.exports = {};
