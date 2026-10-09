"use strict";

const { gmd } = require("../luka");
const axios = require("axios");

const PROFILE_IMAGE = "https://i.imgur.com/FmAY2zv.png";

gmd(
    {
        pattern: "profile",
        aliases: ["me", "myprofile"],
        category: "user",
        react: "👤",
        description: "Display your LUKA-XMD profile card",
    },

    async (from, Guru, conText) => {
        const { mek, reply } = conText;

        try {
            const sender =
                mek?.key?.participant ||
                mek?.key?.remoteJid ||
                from;

            const number = String(sender)
                .split("@")[0]
                .split(":")[0];

            const name =
                mek?.pushName ||
                "WhatsApp User";

            const chatType = String(from).endsWith("@g.us")
                ? "Group Chat"
                : "Private Chat";

            const date = new Date();

            const dateText = date.toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
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
                "┃ 💬 *Chat:* " + chatType + "\n" +
                "┃ 📅 *Date:* " + dateText + "\n" +
                "┃ ⏰ *Time:* " + timeText + "\n" +
                "┃\n" +
                "╰━━━━━━━━━━━━━━━━━━━━╯\n\n" +
                "> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ*";

            const response = await axios.get(PROFILE_IMAGE, {
                responseType: "arraybuffer",
                timeout: 20000,
                headers: {
                    Accept: "image/*",
                },
            });

            const imageBuffer = Buffer.from(response.data);
            const contentType = String(
                response.headers["content-type"] || ""
            ).toLowerCase();

            if (
                !imageBuffer.length ||
                !contentType.startsWith("image/")
            ) {
                throw new Error("The profile image URL did not return a valid image.");
            }

            return await Guru.sendMessage(
                from,
                {
                    image: imageBuffer,
                    caption: caption,
                },
                { quoted: mek }
            );

        } catch (error) {
            console.error(
                "[LUKA-XMD PROFILE ERROR]",
                error.stack || error.message
            );

            return reply(
                "❌ Unable to create the profile card.\n" +
                "Please check the image URL or your internet connection.\n\n" +
                "> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ*"
            );
        }
    }
);

module.exports = {};
