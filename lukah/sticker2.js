"use strict";

const { gmd, gmdRandom, getVideoDuration } = require("../luka");
const fs = require("fs").promises;
const fss = require("fs");
const { execFile, execSync } = require("child_process");

// Resolve FFmpeg binary
let ffmpegBin = "ffmpeg";

try {
    const ffmpegStatic = require("ffmpeg-static");

    if (ffmpegStatic && fss.existsSync(ffmpegStatic)) {
        ffmpegBin = ffmpegStatic;
    } else {
        ffmpegBin = execSync("which ffmpeg", {
            encoding: "utf8"
        }).trim();
    }
} catch (_) {
    try {
        ffmpegBin = execSync("which ffmpeg", {
            encoding: "utf8"
        }).trim();
    } catch (__) {
        ffmpegBin = "ffmpeg";
    }
}

// Run FFmpeg safely without shell command interpolation
function runFFmpeg(args) {
    return new Promise((resolve, reject) => {
        execFile(
            ffmpegBin,
            args,
            { maxBuffer: 20 * 1024 * 1024 },
            (error, stdout, stderr) => {
                if (error) {
                    return reject(
                        new Error(stderr || error.message)
                    );
                }

                resolve(stdout);
            }
        );
    });
}

// Convert image to WebP sticker
async function imageToWebp(input, output) {
    await runFFmpeg([
        "-y",
        "-i", input,
        "-frames:v", "1",
        "-vf",
        "scale=512:512:force_original_aspect_ratio=decrease," +
        "format=rgba," +
        "pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000",
        "-c:v", "libwebp",
        "-lossless", "0",
        "-q:v", "75",
        "-preset", "default",
        "-an",
        output
    ]);
}

// Convert video/GIF to animated WebP sticker
async function videoToWebp(input, output, duration) {
    await runFFmpeg([
        "-y",
        "-i", input,
        "-t", String(duration),
        "-vf",
        "fps=12," +
        "scale=512:512:force_original_aspect_ratio=decrease," +
        "format=rgba," +
        "pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000",
        "-c:v", "libwebp",
        "-loop", "0",
        "-preset", "default",
        "-an",
        output
    ]);
}

// Re-encode an existing WebP sticker
async function webpToWebp(input, output) {
    await runFFmpeg([
        "-y",
        "-i", input,
        "-vf",
        "scale=512:512:force_original_aspect_ratio=decrease," +
        "format=rgba," +
        "pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000",
        "-c:v", "libwebp",
        "-loop", "0",
        "-preset", "default",
        "-an",
        output
    ]);
}

gmd(
    {
        pattern: "sticker2",
        aliases: ["s2", "stick2"],
        category: "converter",
        react: "🔄️",
        description: "Convert images, videos, GIFs and stickers using FFmpeg",
    },

    async (from, Guru, conText) => {
        const { mek, reply, react, quoted } = conText;

        const message = mek?.message || {};

        const quotedMessage =
            quoted?.message ||
            quoted?.msg ||
            quoted ||
            {};

        const directImage = message.imageMessage;
        const directVideo = message.videoMessage;
        const directSticker = message.stickerMessage;

        const quotedImage =
            quotedMessage.imageMessage;

        const quotedVideo =
            quotedMessage.videoMessage;

        const quotedSticker =
            quotedMessage.stickerMessage;

        const targetImage = quotedImage || directImage;
        const targetVideo = quotedVideo || directVideo;
        const targetSticker = quotedSticker || directSticker;

        if (!targetImage && !targetVideo && !targetSticker) {
            await react("❌");

            return reply(
                "🎨 *LUKA-XMD STICKER MAKER*\n\n" +
                "Reply to an image, video, GIF, or sticker with:\n" +
                ".sticker2\n\n" +
                "Aliases: .s2 or .stick2\n\n" +
                "> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ"
            );
        }

        let downloadedPath;
        let inputFile;
        let outputFile;

        try {
            const media =
                targetImage || targetVideo || targetSticker;

            if (
                targetVideo &&
                !targetImage &&
                !targetSticker &&
                (targetVideo.seconds || 0) > 8
            ) {
                await react("⚠️");

                return reply(
                    "⚠️ Please use a video that is 8 seconds or shorter."
                );
            }

            await react("⏳");

            // Download media using the bot's existing helper
            downloadedPath =
                await Guru.downloadAndSaveMediaMessage(
                    media,
                    "temp_sticker2"
                );

            if (
                !downloadedPath ||
                typeof downloadedPath !== "string"
            ) {
                throw new Error(
                    "The media downloader did not return a file path."
                );
            }

            const mediaBuffer = await fs.readFile(downloadedPath);

            if (!mediaBuffer.length) {
                throw new Error("Downloaded media is empty.");
            }

            let extension = ".jpg";

            if (targetVideo) extension = ".mp4";
            if (targetSticker) extension = ".webp";

            inputFile = gmdRandom(extension);
            outputFile = gmdRandom(".webp");

            await fs.writeFile(inputFile, mediaBuffer);

            if (targetImage) {
                await imageToWebp(inputFile, outputFile);
            } else if (targetVideo) {
                let duration = 8;

                try {
                    const videoDuration =
                        await getVideoDuration(inputFile);

                    if (
                        Number.isFinite(videoDuration) &&
                        videoDuration > 0
                    ) {
                        duration = Math.min(videoDuration, 8);
                    }
                } catch (error) {
                    console.log(
                        "[LUKA STICKER] Using default video duration."
                    );
                }

                await videoToWebp(
                    inputFile,
                    outputFile,
                    duration
                );
            } else {
                await webpToWebp(inputFile, outputFile);
            }

            const stickerBuffer = await fs.readFile(outputFile);

            if (!stickerBuffer.length) {
                throw new Error(
                    "FFmpeg produced an empty sticker file."
                );
            }

            await react("✅");

            return await Guru.sendMessage(
                from,
                {
                    sticker: stickerBuffer
                },
                { quoted: mek }
            );

        } catch (error) {
            console.error(
                "[LUKA-XMD STICKER2 ERROR]",
                error.stack || error.message
            );

            await react("❌");

            return reply(
                "❌ *STICKER CREATION FAILED*\n\n" +
                "Unable to convert this media.\n" +
                "Please try another image, video, or sticker.\n\n" +
                "Check that FFmpeg and its WebP encoder are installed.\n\n" +
                "> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ"
            );

        } finally {
            for (const file of [
                downloadedPath,
                inputFile,
                outputFile
            ]) {
                if (file) {
                    await fs.unlink(file).catch(() => {});
                }
            }
        }
    }
);

module.exports = {};
