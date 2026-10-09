"use strict";

const axios = require("axios");
const { gmd } = require("../luka");

// ═══════════════════════════════════════════════════════════
//                    LUKA-XMD DOWNLOADER 1
// ═══════════════════════════════════════════════════════════

const MAX_FILE_SIZE = 100 * 1024 * 1024;

function cleanName(name) {
    return String(name || "LUKA-XMD")
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
        .replace(/\s+/g, "_")
        .slice(0, 100);
}

function apiBase(url) {
    return String(url || "").replace(/\/+$/, "");
}

function findUrl(data) {
    const result = data?.result || data?.data || data;

    if (typeof result === "string") {
        return result.startsWith("http") ? result : "";
    }

    return (
        result?.download_url ||
        result?.downloadUrl ||
        result?.url ||
        result?.link ||
        result?.dl_url ||
        ""
    );
}

async function getApiResult(url, params) {
    const response = await axios.get(url, {
        params,
        timeout: 60000,
        headers: {
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0 LUKA-XMD",
        },
    });

    return response.data;
}

async function downloadBuffer(url) {
    let parsed;

    try {
        parsed = new URL(url);
    } catch {
        throw new Error("The download URL is invalid.");
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("The download URL uses an unsupported protocol.");
    }

    const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 120000,
        maxContentLength: MAX_FILE_SIZE,
        maxBodyLength: MAX_FILE_SIZE,
        headers: {
            "User-Agent": "Mozilla/5.0",
            Accept: "*/*",
        },
    });

    const buffer = Buffer.from(response.data);

    if (!buffer.length) {
        throw new Error("The downloaded file is empty.");
    }

    if (buffer.length > MAX_FILE_SIZE) {
        throw new Error("The file exceeds the maximum allowed size.");
    }

    const contentType = String(
        response.headers["content-type"] || ""
    ).toLowerCase();

    if (
        contentType.includes("text/html") ||
        contentType.includes("application/json")
    ) {
        throw new Error(
            "The server returned a webpage instead of a media file."
        );
    }

    return {
        buffer,
        contentType,
    };
}

async function sendMedia({
    from,
    Guru,
    mek,
    react,
    reply,
    url,
    title,
    type,
    mimetype,
}) {
    if (!url) {
        await react("❌");
        return reply(
            "The download link could not be found. Please try again later."
        );
    }

    const {
        buffer,
        contentType,
    } = await downloadBuffer(url);

    const fileName =
        `${cleanName(title)}.${type === "audio" ? "mp3" : "mp4"}`;

    const finalMime =
        mimetype ||
        contentType ||
        (type === "audio" ? "audio/mpeg" : "video/mp4");

    if (type === "audio") {
        await Guru.sendMessage(
            from,
            {
                audio: buffer,
                mimetype: finalMime,
                fileName,
                ptt: false,
            },
            { quoted: mek }
        );
    } else {
        await Guru.sendMessage(
            from,
            {
                video: buffer,
                mimetype: finalMime,
                caption:
                    `*LUKA-XMD DOWNLOADER*\n\n` +
                    `*Title:* ${title || "Video"}`,
            },
            { quoted: mek }
        );
    }

    await react("✅");
}

async function downloader({
    from,
    Guru,
    conText,
    endpoint,
    queryName,
    mediaType,
    commandName,
}) {
    const {
        q,
        mek,
        reply,
        react,
        GuruTechApi,
        GuruApiKey,
    } = conText;

    if (!q || !q.trim()) {
        await react("❌");

        return reply(
            `Usage: .${commandName} <name or URL>\n\n` +
            `Example: .${commandName} https://example.com/media`
        );
    }

    if (!GuruTechApi || !GuruApiKey) {
        await react("❌");

        return reply(
            "The downloader API is not configured. " +
            "Check GuruTechApi and GuruApiKey in your settings."
        );
    }

    try {
        await react("🔎");

        const url =
            `${apiBase(GuruTechApi)}${endpoint}`;

        const data = await getApiResult(url, {
            apikey: GuruApiKey,
            [queryName]: q.trim(),
        });

        console.log(
            `[LUKA-XMD ${commandName.toUpperCase()} API]`,
            JSON.stringify(data).slice(0, 2000)
        );

        if (
            data?.success === false ||
            data?.status === false
        ) {
            throw new Error(
                data.message ||
                data.error ||
                "The API could not retrieve the requested media."
            );
        }

        const result =
            data?.result ||
            data?.data ||
            data;

        const mediaUrl = findUrl(data);

        if (!mediaUrl) {
            throw new Error(
                "The API response does not contain a download URL."
            );
        }

        const title =
            result?.title ||
            result?.name ||
            result?.filename ||
            q.trim();

        await sendMedia({
            from,
            Guru,
            mek,
            react,
            reply,
            url: mediaUrl,
            title,
            type: mediaType,
            mimetype: result?.mimetype || result?.mimeType,
        });
    } catch (error) {
        console.error(
            `[LUKA-XMD ${commandName.toUpperCase()} ERROR]`,
            error.response?.data || error.message
        );

        await react("❌");

        return reply(
            `${commandName.toUpperCase()} DOWNLOAD FAILED.\n\n` +
            `${error.code === "ECONNABORTED"
                ? "The request timed out. Please try again."
                : error.response?.status === 401 ||
                  error.response?.status === 403
                ? "The API key was rejected. Check your API settings."
                : error.response?.status === 404
                ? "The API endpoint was not found."
                : "Check the terminal logs for the exact error."}`
        );
    }
}

// ─── PLAY: SEARCH FOR A SONG ─────────────────────────────────

gmd(
    {
        pattern: "play",
        aliases: ["music", "songsearch"],
        category: "downloader",
        react: "🎵",
        description: "Search for a song",
    },
    async (from, Guru, conText) => {
        const {
            q,
            reply,
            react,
            GuruTechApi,
            GuruApiKey,
        } = conText;

        if (!q || !q.trim()) {
            await react("❌");
            return reply("Example: .play Diamond Platnumz");
        }

        if (!GuruTechApi || !GuruApiKey) {
            await react("❌");
            return reply("Please configure the downloader API settings.");
        }

        try {
            await react("🔎");

            const data = await getApiResult(
                `${apiBase(GuruTechApi)}/api/search/song`,
                {
                    apikey: GuruApiKey,
                    query: q.trim(),
                }
            );

            console.log(
                "[LUKA-XMD PLAY API]",
                JSON.stringify(data).slice(0, 1500)
            );

            const result = data?.result || data?.data;

            if (!result) {
                await react("❌");
                return reply("No songs were found.");
            }

            const items = Array.isArray(result)
                ? result
                : [result];

            const message = items.slice(0, 5).map((item, i) => {
                return (
                    `${i + 1}. ${item.title || item.name || "Unknown"}\n` +
                    `Artist: ${item.artist || item.author || "Unknown"}\n` +
                    `URL: ${item.url || item.link || "N/A"}`
                );
            }).join("\n\n");

            await reply(
                `*LUKA-XMD SONG SEARCH*\n\n${message}\n\n` +
                "Use .song followed by a supported media URL to download audio."
            );

            await react("✅");
        } catch (error) {
            console.error(
                "[LUKA-XMD PLAY ERROR]",
                error.response?.data || error.message
            );

            await react("❌");
            return reply(
                "Song search failed. Check whether the /api/search/song endpoint exists."
            );
        }
    }
);

// ─── SONG DOWNLOADER ─────────────────────────────────────────

gmd(
    {
        pattern: "song",
        aliases: ["audio", "mp3"],
        category: "downloader",
        react: "🎧",
        description: "Download audio from a supported URL",
    },
    async (from, Guru, conText) => {
        return downloader({
            from,
            Guru,
            conText,
            endpoint: "/api/download/song",
            queryName: "url",
            mediaType: "audio",
            commandName: "song",
        });
    }
);

// ─── VIDEO DOWNLOADER ────────────────────────────────────────

gmd(
    {
        pattern: "video",
        aliases: ["mp4", "videodl"],
        category: "downloader",
        react: "🎬",
        description: "Download videos from supported URLs",
    },
    async (from, Guru, conText) => {
        return downloader({
            from,
            Guru,
            conText,
            endpoint: "/api/download/video",
            queryName: "url",
            mediaType: "video",
            commandName: "video",
        });
    }
);

// ─── TIKTOK DOWNLOADER ───────────────────────────────────────

gmd(
    {
        pattern: "tiktok",
        aliases: ["tt", "ttdl"],
        category: "downloader",
        react: "📱",
        description: "Download TikTok videos",
    },
    async (from, Guru, conText) => {
        return downloader({
            from,
            Guru,
            conText,
            endpoint: "/api/download/tiktok",
            queryName: "url",
            mediaType: "video",
            commandName: "tiktok",
        });
    }
);

// ─── FACEBOOK DOWNLOADER ─────────────────────────────────────

gmd(
    {
        pattern: "facebook",
        aliases: ["fb", "fbdl"],
        category: "downloader",
        react: "📘",
        description: "Download Facebook videos",
    },
    async (from, Guru, conText) => {
        return downloader({
            from,
            Guru,
            conText,
            endpoint: "/api/download/facebook",
            queryName: "url",
            mediaType: "video",
            commandName: "facebook",
        });
    }
);

// ─── INSTAGRAM DOWNLOADER ────────────────────────────────────

gmd(
    {
        pattern: "instagram",
        aliases: ["ig", "igdl"],
        category: "downloader",
        react: "📸",
        description: "Download Instagram media",
    },
    async (from, Guru, conText) => {
        return downloader({
            from,
            Guru,
            conText,
            endpoint: "/api/download/instagram",
            queryName: "url",
            mediaType: "video",
            commandName: "instagram",
        });
    }
);

module.exports = {};
