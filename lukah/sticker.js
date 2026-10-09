"use strict";

const { gmd } = require("../luka");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const os = require("os");

gmd(
    {
        pattern: "sticker",
        aliases: ["s", "stiker"],
        react: "🎨",
        category: "converter",
        description: "Convert an image or video into a WhatsApp sticker",
    },

    async (from, Guru, conText) => {
        const { mek, reply } = conText;

        try {
            const quoted =
                mek?.message?.extendedTextMessage?.contextInfo?.quotedMessage;

            const message =
                mek?.message?.imageMessage ||
                mek?.message?.videoMessage ||
                quoted?.imageMessage ||
                quoted?.videoMessage;

            if (!message) {
                return await reply(
                    "🎨 *LUKA-XMD STICKER MAKER*\n\n" +
                    "Reply to an image or a short video with:\n" +
                    ".sticker\n\n" +
                    "You can also send an image with the caption .s\n\n" +
                    "> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ"
                );
            }

            const mime = message.mimetype || "";

            if (
                !mime.startsWith("image/") &&
                !mime.startsWith("video/")
            ) {
                return await reply(
                    "❌ Please reply to an image or video."
                );
            }

            if (
                mime.startsWith("video/") &&
                (message.seconds || 0) > 10
            ) {
                return await reply(
                    "⚠️ Please use a video that is 10 seconds or shorter."
                );
            }

            await reply("🎨 Creating your sticker. Please wait...");

            /*
             * Use the media download helper exported by your bot.
             * If your main module exports a different helper,
             * replace this section with your project's downloader.
             */
            const botModule = require("../luka");
            const downloadMedia =
                botModule.downloadMediaMessage ||
                botModule.downloadMedia;

            if (typeof downloadMedia !== "function") {
                return await reply(
                    "❌ The media download function is not exported by ../luka.\n\n" +
                    "Please check your bot's media download helper."
                );
            }

            const mediaMessage = mek?.message?.imageMessage ||
                mek?.message?.videoMessage
                ? mek
                : {
                    key: mek.key,
                    message: quoted,
                };

            const mediaBuffer = await downloadMedia(mediaMessage);

            if (!mediaBuffer || !Buffer.from(mediaBuffer).length) {
                return await reply("❌ Failed to download the media.");
            }

            const stickerBuffer = Buffer.from(mediaBuffer);

            await Guru.sendMessage(
                from,
                {
                    sticker: stickerBuffer,
                },
                { quoted: mek }
            );

        } catch (error) {
            console.error(
                "[LUKA-XMD STICKER ERROR]",
                error.stack || error.message
            );

            await reply(
                "❌ *STICKER CREATION FAILED*\n\n" +
                "Unable to create the sticker.\n" +
                "Please try another image or video.\n\n" +
                "> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ"
            );
        }
    }
);

module.exports = {};
