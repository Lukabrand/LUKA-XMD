"use strict";

const { gmd } = require("../luka");
const axios = require("axios");

const IMAGE_API = "https://image.pollinations.ai/prompt/";

const delay = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));

async function generateImage(prompt) {
    const url = IMAGE_API + encodeURIComponent(prompt);

    let lastError;

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const response = await axios.get(url, {
                params: {
                    model: "flux",
                    width: 1024,
                    height: 1024,
                    nologo: true,
                    enhance: true,
                },
                responseType: "arraybuffer",
                timeout: 180000,
                maxRedirects: 5,
                headers: {
                    Accept: "image/*",
                    "User-Agent": "LUKA-XMD/1.0",
                },
                validateStatus: (status) =>
                    status >= 200 && status < 300,
            });

            const contentType = String(
                response.headers["content-type"] || ""
            ).toLowerCase();

            const imageBuffer = Buffer.from(response.data);

            if (
                !contentType.startsWith("image/") ||
                imageBuffer.length < 1000
            ) {
                throw new Error(
                    "The API did not return a valid image. Content-Type: " +
                    contentType
                );
            }

            return imageBuffer;
        } catch (error) {
            lastError = error;

            console.error(
                `[LUKABRAND IMAGE] Attempt ${attempt}/3:`,
                error.message
            );

            if (attempt < 3) {
                await delay(attempt * 2000);
            }
        }
    }

    throw lastError || new Error("Image generation failed.");
}

gmd(
    {
        pattern: "imagine",
        aliases: ["aiimage", "text2img"],
        react: "🎨",
        category: "ai",
        description: "Generate images using AI",
    },

    async (from, Guru, conText) => {
        const { body, mek, reply } = conText;

        try {
            const prompt = (body || "")
                .trim()
                .split(/\s+/)
                .slice(1)
                .join(" ")
                .trim();

            if (!prompt) {
                return await reply(
                    "🎨 LUKA-XMD AI IMAGE GENERATOR\n\n" +
                    "Usage:\n" +
                    ".imagine a lion wearing a crown\n\n" +
                    "Please describe the image you want to generate."
                );
            }

            await reply(
                "🎨 LUKA-XMD AI IMAGE GENERATOR\n\n" +
                "⏳ Generating your image...\n" +
                "Please wait."
            );

            const imageBuffer = await generateImage(prompt);

            await Guru.sendMessage(
                from,
                {
                    image: imageBuffer,
                    caption:
                        "🎨 *LUKA-XMD AI IMAGE*\n\n" +
                        "📝 *Prompt:* " + prompt + "\n\n" +
                        "> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ",
                },
                { quoted: mek }
            );

        } catch (error) {
            console.error(
                "[LUKABRAND IMAGE ERROR]",
                error.stack || error.message
            );

            await reply(
                "❌ *IMAGE GENERATION FAILED*\n\n" +
                "Unable to retrieve an image from the AI service.\n\n" +
                "Possible reasons:\n" +
                "• The AI server is temporarily unavailable.\n" +
                "• There is a network connection problem.\n" +
                "• The API rejected the request.\n\n" +
                "Please try again later.\n\n" +
                "> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ"
            );
        }
    }
);

module.exports = {};
