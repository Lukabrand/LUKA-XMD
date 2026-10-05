"use strict";

const { gmd, getMediaBuffer } = require("../luka");

gmd(
    {
        pattern: "save",
        aliases: ["savemedia", "inbox", "grab", "keep"],
        react: "📥",
        category: "tools",
        description: "Save quoted media to owner inbox",
        usage: "Reply to image, video, audio, document or sticker with .save",
    },

    async (from, Guru, conText) => {
        const {
            mek,
            reply,
            react,
            ownerNumber,
        } = conText;

        // Check owner number
        if (!ownerNumber) {
            await react("❌");
            return reply("❌ Owner number is not configured.");
        }

        // Create owner JID
        const ownerJid =
            ownerNumber.replace(/\D/g, "") + "@s.whatsapp.net";

        // Get quoted message
        const contextInfo =
            mek?.message?.extendedTextMessage?.contextInfo ||
            mek?.message?.imageMessage?.contextInfo ||
            mek?.message?.videoMessage?.contextInfo ||
            mek?.message?.audioMessage?.contextInfo ||
            mek?.message?.documentMessage?.contextInfo ||
            mek?.message?.stickerMessage?.contextInfo ||
            null;

        if (!contextInfo?.quotedMessage) {
            await react("❌");

            return reply(
                "╭══〘〘 *SAVE MEDIA* 〙〙═⊷\n" +
                "┃\n" +
                "┃ ❌ *No media found*\n" +
                "┃\n" +
                "┃ Reply to an image, video,\n" +
                "┃ audio, document or sticker\n" +
                "┃ with *.save*\n" +
                "┃\n" +
                "╰═════════════════⊷"
            );
        }

        // Get quoted message
        let msg = contextInfo.quotedMessage;

        // Handle View Once / Ephemeral
        if (msg.viewOnceMessageV2?.message) {
            msg = msg.viewOnceMessageV2.message;
        } else if (msg.viewOnceMessage?.message) {
            msg = msg.viewOnceMessage.message;
        } else if (msg.ephemeralMessage?.message) {
            msg = msg.ephemeralMessage.message;
        } else if (msg.viewOnceMessageV2Extension?.message) {
            msg = msg.viewOnceMessageV2Extension.message;
        }

        // Detect media type
        let mediaType = null;

        if (msg.imageMessage) {
            mediaType = "image";
        } else if (msg.videoMessage) {
            mediaType = "video";
        } else if (msg.audioMessage) {
            mediaType = "audio";
        } else if (msg.documentMessage) {
            mediaType = "document";
        } else if (msg.stickerMessage) {
            mediaType = "sticker";
        }

        if (!mediaType) {
            await react("❌");

            return reply(
                "╭══〘〘 *SAVE MEDIA* 〙〙═⊷\n" +
                "┃\n" +
                "┃ ❌ *Unsupported message*\n" +
                "┃\n" +
                "┃ Only image, video, audio,\n" +
                "┃ document and sticker are supported.\n" +
                "┃\n" +
                "╰═════════════════⊷"
            );
        }

        await react("⏳");

        try {
            // Download media
            const buffer = await getMediaBuffer(
                msg[`${mediaType}Message`],
                mediaType
            );

            if (!buffer) {
                throw new Error("Media buffer is empty");
            }

            const media = msg[`${mediaType}Message`];

            // Send image
            if (mediaType === "image") {
                await Guru.sendMessage(ownerJid, {
                    image: buffer,
                    caption:
                        media.caption ||
                        "📥 *Saved Media*\n\nPowered by LUKABRAND",
                });
            }

            // Send video
            else if (mediaType === "video") {
                await Guru.sendMessage(ownerJid, {
                    video: buffer,
                    caption:
                        media.caption ||
                        "📥 *Saved Media*\n\nPowered by LUKABRAND",
                });
            }

            // Send audio
            else if (mediaType === "audio") {
                await Guru.sendMessage(ownerJid, {
                    audio: buffer,
                    mimetype: media.mimetype || "audio/mpeg",
                    ptt: media.ptt || false,
                });
            }

            // Send document
            else if (mediaType === "document") {
                await Guru.sendMessage(ownerJid, {
                    document: buffer,
                    fileName: media.fileName || "saved-file",
                    mimetype:
                        media.mimetype ||
                        "application/octet-stream",
                    caption:
                        media.caption ||
                        "📥 *Saved Media*\n\nPowered by LUKABRAND",
                });
            }

            // Send sticker
            else if (mediaType === "sticker") {
                await Guru.sendMessage(ownerJid, {
                    sticker: buffer,
                });
            }

            await react("✅");

            return reply(
                "╭══〘〘 *SAVE MEDIA* 〙〙═⊷\n" +
                "┃\n" +
                "┃ ✅ *MEDIA SAVED*\n" +
                "┃\n" +
                "┃ 📥 Sent to owner inbox\n" +
                `┃ 📦 Type : *${mediaType.toUpperCase()}*\n` +
                "┃\n" +
                "╰═════════════════⊷"
            );

        } catch (error) {
            console.error(
                "[SaveMedia Error]:",
                error
            );

            await react("❌");

            return reply(
                "╭══〘〘 *SAVE MEDIA* 〙〙═⊷\n" +
                "┃\n" +
                "┃ ❌ *FAILED TO SAVE*\n" +
                "┃\n" +
                "┃ Something went wrong while\n" +
                "┃ downloading or forwarding\n" +
                "┃ the media.\n" +
                "┃\n" +
                "╰═════════════════⊷"
            );
        }
    }
);
