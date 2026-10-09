"use strict";

const { gmd } = require("../luka");
const {
downloadContentFromMessage,
} = require("@whiskeysockets/baileys");
const { imageToWebp } = require("../gift");

async function downloadMedia(message, type) {
const stream = await downloadContentFromMessage(message, type);
const chunks = [];

for await (const chunk of stream) {
    chunks.push(chunk);
}

return Buffer.concat(chunks);

}

gmd(
{
pattern: "sticker",
aliases: ["s", "stiker"],
react: "🖼️",
category: "sticker",
description: "Convert an image or video to a WhatsApp sticker",
},

async (from, Guru, conText) => {
    const { mek, reply } = conText;

    try {
        const message = mek?.message;

        const quoted =
            message?.extendedTextMessage?.contextInfo?.quotedMessage;

        const source = quoted || message;

        const imageMessage = source?.imageMessage;
        const videoMessage = source?.videoMessage;

        if (!imageMessage && !videoMessage) {
            return await reply(
                "🖼️ LUKA-XMD STICKER MAKER\n\n" +
                "Please send or reply to an image with .sticker.\n\n" +
                "Example: Reply to an image and type .sticker"
            );
        }

        if (videoMessage) {
            return await reply(
                "⚠️ Video sticker conversion is not enabled in this version.\n\n" +
                "Please use an image instead."
            );
        }

        await reply("🖼️ Creating your sticker. Please wait...");

        const buffer = await downloadMedia(imageMessage, "image");

        if (!buffer || buffer.length === 0) {
            return await reply("❌ Failed to download the image.");
        }

        if (typeof imageToWebp !== "function") {
            return await reply(
                "❌ Sticker converter is unavailable.\n\n" +
                "Please check the imageToWebp export in your bot's main module."
            );
        }

        const stickerBuffer = await imageToWebp(buffer);

        if (!stickerBuffer || stickerBuffer.length === 0) {
            return await reply("❌ Failed to convert the image to a sticker.");
        }

        await Guru.sendMessage(
            from,
            {
                sticker: stickerBuffer,
            },
            {
                quoted: mek,
            }
        );

    } catch (error) {
        console.error("[LUKA-XMD STICKER ERROR]", error);

        await reply(
            "❌ Failed to create the sticker.\n\n" +
            "Please try another image or check the bot logs."
        );
    }
}

);

module.exports = {};
