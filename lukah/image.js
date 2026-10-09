"use strict";

const { gmd } = require("../luka");
const axios = require("axios");

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
            .join(" ");

        if (!prompt) {
            return await reply(
                "🎨 LUKA-XMD AI IMAGE GENERATOR\n\n" +
                "Usage: .imagine a lion wearing a crown\n\n" +
                "Please describe the image you want to generate."
            );
        }

        await reply(
            "🎨 LUKA-XMD AI IMAGE GENERATOR\n\n" +
            "Creating your image. Please wait..."
        );

        const API_URL = process.env.IMAGE_API_URL;

        if (!API_URL) {
            return await reply(
                "⚠️ Image generation API is not configured.\n\n" +
                "Please set IMAGE_API_URL in your environment variables."
            );
        }

        const response = await axios.get(API_URL, {
            params: { prompt },
            timeout: 120000,
            responseType: "arraybuffer",
        });

        const imageBuffer = Buffer.from(response.data);

        if (!imageBuffer.length) {
            return await reply(
                "❌ The image API returned an empty response."
            );
        }

        await Guru.sendMessage(
            from,
            {
                image: imageBuffer,
                caption:
                    "🎨 LUKA-XMD AI IMAGE\n\n" +
                    "📝 Prompt: " + prompt,
            },
            { quoted: mek }
        );

    } catch (error) {
        console.error("[LUKA IMAGE ERROR]", error.message);

        await reply(
            "❌ Failed to generate the image.\n\n" +
            "Please check the API configuration and try again."
        );
    }
}

);

module.exports = {};
