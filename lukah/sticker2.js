// Alternate sticker command that does NOT use sharp or wa-sticker-formatter.
// The regular .sticker command crashes the whole process on some hosts
// because wa-sticker-formatter uses sharp internally, and a corrupted/
// mismatched sharp native binary can crash the entire Node process with a
// "double free or corruption" SIGABRT — not something try/catch can stop.
//
// This command builds the webp purely with ffmpeg (a subprocess), so even
// if ffmpeg itself fails, it just returns an error code — it can never take
// down the bot process.

const { gmd, gmdRandom, getVideoDuration } = require("../guru");
const fs = require("fs").promises;
const fss = require("fs");
const { exec, execSync } = require("child_process");

// Resolve ffmpeg binary: prefer ffmpeg-static, fall back to system ffmpeg
let _ffmpegBin;
try {
    const sp = require("ffmpeg-static");
    _ffmpegBin = (sp && fss.existsSync(sp)) ? sp : execSync("which ffmpeg").toString().trim();
} catch (_) {
    try { _ffmpegBin = execSync("which ffmpeg").toString().trim(); } catch (__) { _ffmpegBin = "ffmpeg"; }
}

function runCmd(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, { maxBuffer: 1024 * 1024 * 20 }, (err, _stdout, stderr) => {
            if (err) reject(new Error(stderr || err.message));
            else resolve();
        });
    });
}

// Square, padded, transparent-background webp — works for static images.
async function imageToWebp(input, output) {
    const cmd = `"${_ffmpegBin}" -i "${input}" -vf "scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000" -vcodec libwebp -lossless 0 -qscale 75 -preset default -loop 0 -an -vsync 0 "${output}" -y`;
    await runCmd(cmd);
}

// Animated webp for video/gif — capped duration & fps to keep it under
// WhatsApp's sticker size limit.
async function videoToWebp(input, output, duration) {
    const cmd = `"${_ffmpegBin}" -i "${input}" -vf "scale=512:512:force_original_aspect_ratio=decrease,fps=12,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000" -t ${duration} -vcodec libwebp -loop 0 -preset default -an -vsync 0 "${output}" -y`;
    await runCmd(cmd);
}

// Re-encode an existing sticker/webp (covers oversized or malformed stickers).
async function webpToWebp(input, output) {
    const cmd = `"${_ffmpegBin}" -i "${input}" -vf "scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000" -vcodec libwebp -loop 0 -preset default -an -vsync 0 "${output}" -y`;
    await runCmd(cmd);
}

gmd({
    pattern: "sticker2",
    aliases: ["s2", "stick2"],
    category: "converter",
    react: "🔄️",
    description: "Convert image/video/sticker to sticker (ffmpeg-only, crash-safe fallback).",
}, async (from, Guru, conText) => {
    const { mek, reply, react, quoted } = conText;

    const directImg = mek.message?.imageMessage;
    const directVideo = mek.message?.videoMessage;
    const directSticker = mek.message?.stickerMessage;

    const targetImg = quoted?.imageMessage || quoted?.message?.imageMessage || directImg;
    const targetSticker = quoted?.stickerMessage || quoted?.message?.stickerMessage || directSticker;
    const targetVideo = quoted?.videoMessage || quoted?.message?.videoMessage || directVideo;

    if (!targetImg && !targetSticker && !targetVideo) {
        await react("❌");
        return reply(
            "Please reply to (or send directly with the caption) an image, video, GIF or sticker to convert it."
        );
    }

    let downloadedPath, inputFile, outputFile;
    try {
        const media = targetImg || targetVideo || targetSticker;
        downloadedPath = await Guru.downloadAndSaveMediaMessage(media, "temp_s2_media");

        const data = await fs.readFile(downloadedPath);
        const ext = targetImg ? ".jpg" : targetVideo ? ".mp4" : ".webp";
        inputFile = gmdRandom(ext);
        await fs.writeFile(inputFile, data);
        outputFile = gmdRandom(".webp");

        if (targetImg) {
            await imageToWebp(inputFile, outputFile);
        } else if (targetVideo) {
            let duration = 8;
            try {
                duration = await getVideoDuration(inputFile);
                if (duration > 8) duration = 8;
            } catch (_) {}
            await videoToWebp(inputFile, outputFile, duration);
        } else {
            await webpToWebp(inputFile, outputFile);
        }

        const stickerBuffer = await fs.readFile(outputFile);
        await react("✅");
        return Guru.sendMessage(from, { sticker: stickerBuffer }, { quoted: mek });
    } catch (error) {
        console.error("sticker2 error:", error);
        await react("❌");
        return reply("Failed to convert to sticker: " + (error.message || "unknown error"));
    } finally {
        for (const f of [downloadedPath, inputFile, outputFile]) {
            if (f) await fs.unlink(f).catch(() => {});
        }
    }
});
