"use strict";

const {
    gmd,
    MAX_MEDIA_SIZE,
    getFileSize,
} = require("../luka");

const axios = require("axios");

let yts = null;

try {
    yts = require("yt-search");
} catch (error) {
    console.log(
        "[LUKA-XMD] yt-search is not installed. Run: npm install yt-search"
    );
}

const API_TIMEOUT = 120000;
const MAX_DOWNLOAD_SIZE = 100 * 1024 * 1024;

// Use the current Gifted API domain if the old domain is configured.
function getApiBase(GuruTechApi) {
    let base = String(GuruTechApi || "").trim();

    if (
        !base ||
        base.includes("api.giftedtech.co.ke")
    ) {
        base = "https://api.gifted.co.ke";
    }

    return base.replace(/\/+$/, "");
}

function getApiKey(GuruApiKey) {
    return String(GuruApiKey || "").trim() || "gifted";
}

function findDownloadUrl(data) {
    if (!data) return null;

    if (typeof data === "string") {
        if (/^https?:\/\//i.test(data)) {
            return data;
        }

        return null;
    }

    if (Array.isArray(data)) {
        for (const item of data) {
            const result = findDownloadUrl(item);
            if (result) return result;
        }

        return null;
    }

    if (typeof data === "object") {
        const keys = [
            "download_url",
            "downloadUrl",
            "url",
            "link",
            "audio",
            "video",
            "media",
            "file",
        ];

        for (const key of keys) {
            const value = data[key];

            if (
                typeof value === "string" &&
                /^https?:\/\//i.test(value)
            ) {
                return value;
            }
        }

        for (const key of ["result", "data", "response"]) {
            if (data[key]) {
                const result = findDownloadUrl(data[key]);

                if (result) return result;
            }
        }
    }

    return null;
}

function findErrorMessage(data) {
    if (!data || typeof data !== "object") {
        return "The API returned an unknown error.";
    }

    return (
        data.error ||
        data.message ||
        data.msg ||
        data.result?.error ||
        data.result?.message ||
        "The API could not process the request."
    );
}

async function getGiftedMedia({
    GuruTechApi,
    GuruApiKey,
    url,
    type,
}) {
    const base = getApiBase(GuruTechApi);
    const apikey = getApiKey(GuruApiKey);

    const endpoint =
        type === "audio"
            ? "/api/download/ytmp3"
            : "/api/download/ytvideo";

    const response = await axios.get(
        `${base}${endpoint}`,
        {
            params: {
                apikey,
                url,
                stream: "true",
                ...(type === "audio"
                    ? { quality: "128" }
                    : { quality: "720" }),
            },
            responseType: "arraybuffer",
            timeout: API_TIMEOUT,
            maxContentLength: MAX_DOWNLOAD_SIZE,
            maxBodyLength: MAX_DOWNLOAD_SIZE,
            validateStatus: () => true,
            headers: {
                "User-Agent": "Mozilla/5.0 LUKA-XMD",
                Accept: "*/*",
            },
        }
    );

    const contentType = String(
        response.headers["content-type"] || ""
    ).toLowerCase();

    const buffer = Buffer.from(response.data);

    if (
        response.status < 200 ||
        response.status >= 300
    ) {
        let message = buffer.toString("utf8").slice(0, 500);

        try {
            message = findErrorMessage(
                JSON.parse(message)
            );
        } catch (_) {}

        throw new Error(
            `Gifted API returned HTTP ${response.status}: ${message}`
        );
    }

    // Some API responses return JSON containing a media URL.
    if (
        contentType.includes("application/json") ||
        contentType.includes("text/html")
    ) {
        let data;

        try {
            data = JSON.parse(buffer.toString("utf8"));
        } catch (_) {
            throw new Error(
                "The API returned text instead of a media file. Check the API response."
            );
        }

        if (
            data.success === false ||
            data.status === false ||
            data.error
        ) {
            throw new Error(findErrorMessage(data));
        }

        const mediaUrl = findDownloadUrl(data);

        if (!mediaUrl) {
            throw new Error(
                "The API response did not contain a download URL."
            );
        }

        const mediaResponse = await axios.get(mediaUrl, {
            responseType: "arraybuffer",
            timeout: API_TIMEOUT,
            maxContentLength: MAX_DOWNLOAD_SIZE,
            maxBodyLength: MAX_DOWNLOAD_SIZE,
            headers: {
                "User-Agent": "Mozilla/5.0 LUKA-XMD",
            },
        });

        return {
            buffer: Buffer.from(mediaResponse.data),
            contentType: String(
                mediaResponse.headers["content-type"] || ""
            ).toLowerCase(),
        };
    }

    if (!buffer.length) {
        throw new Error("The downloaded file is empty.");
    }

    // Avoid sending an HTML error page as audio or video.
    if (contentType.includes("text/html")) {
        throw new Error(
            "The API returned an HTML page instead of media."
        );
    }

    return {
        buffer,
        contentType,
    };
}

async function searchYouTube(query) {
    if (!yts) {
        throw new Error(
            "The yt-search package is missing. Run: npm install yt-search"
        );
    }

    const result = await yts(query);
    const video = result?.videos?.[0];

    if (!video || !video.url) {
        throw new Error(
            "No YouTube results were found for that search."
        );
    }

    return video;
}

function safeFileName(name) {
    return String(name || "LUKA-XMD")
        .replace(/[^\w\s.-]/g, "")
        .trim()
        .slice(0, 100) || "LUKA-XMD";
}

function registerYouTubeCommand({
    pattern,
    aliases,
    type,
    description,
}) {
    gmd(
        {
            pattern,
            category: "downloader",
            react: type === "audio" ? "🎵" : "🎬",
            aliases,
            description,
        },
        async (from, Guru, conText) => {
            const {
                q,
                mek,
                reply,
                react,
                botFooter,
                GuruTechApi,
                GuruApiKey,
            } = conText;

            if (!q) {
                await react("❌");

                return reply(
                    `Please provide a song name or YouTube URL.\n\n` +
                    `Example: .${pattern} Faded Alan Walker`
                );
            }

            try {
                await react("⏳");

                await reply(
                    type === "audio"
                        ? "🔎 Searching for the song..."
                        : "🔎 Searching for the video..."
                );

                let video;

                if (/^https?:\/\//i.test(q.trim())) {
                    if (
                        !/youtube\.com|youtu\.be/i.test(q)
                    ) {
                        throw new Error(
                            "Please provide a valid YouTube URL."
                        );
                    }

                    video = {
                        title: "YouTube Media",
                        url: q.trim(),
                        timestamp: "Unknown",
                        author: { name: "YouTube" },
                        thumbnail: null,
                    };
                } else {
                    video = await searchYouTube(q.trim());
                }

                await reply(
                    `⬇️ Downloading: ${video.title}`
                );

                const media = await getGiftedMedia({
                    GuruTechApi,
                    GuruApiKey,
                    url: video.url,
                    type,
                });

                if (!media.buffer?.length) {
                    throw new Error(
                        "The downloaded media is empty."
                    );
                }

                const filename = safeFileName(video.title);

                const caption =
                    `╭━━〔 LUKA-XMD 〕━━╮\n` +
                    `┃ ${type === "audio" ? "🎵 SONG" : "🎬 VIDEO"}\n` +
                    `┃\n` +
                    `┃ Title: ${video.title}\n` +
                    `┃ Channel: ${video.author?.name || "YouTube"}\n` +
                    `┃ Duration: ${video.timestamp || "Unknown"}\n` +
                    `╰━━━━━━━━━━━━━━━━╯\n` +
                    `${botFooter ? `\n${botFooter}` : ""}`;

                if (type === "audio") {
                    await Guru.sendMessage(
                        from,
                        {
                            audio: media.buffer,
                            mimetype: "audio/mpeg",
                            fileName: `${filename}.mp3`,
                        },
                        { quoted: mek }
                    );
                } else {
                    const fileSize = media.buffer.length;

                    if (
                        MAX_MEDIA_SIZE &&
                        fileSize > MAX_MEDIA_SIZE
                    ) {
                        await Guru.sendMessage(
                            from,
                            {
                                document: media.buffer,
                                mimetype: "video/mp4",
                                fileName: `${filename}.mp4`,
                                caption,
                            },
                            { quoted: mek }
                        );
                    } else {
                        await Guru.sendMessage(
                            from,
                            {
                                video: media.buffer,
                                mimetype: "video/mp4",
                                fileName: `${filename}.mp4`,
                                caption,
                            },
                            { quoted: mek }
                        );
                    }
                }

                await react("✅");
            } catch (error) {
                console.error(
                    `[LUKA-XMD ${pattern.toUpperCase()} ERROR]`,
                    error.response?.data || error.message
                );

                await react("❌");

                return reply(
                    `Download failed.\n\n` +
                    `Reason: ${error.message}\n\n` +
                    `Please check the API configuration and try again.`
                );
            }
        }
    );
}

// Search and download a song as MP3.
registerYouTubeCommand({
    pattern: "play",
    aliases: ["song", "music"],
    type: "audio",
    description: "Search YouTube and download a song as MP3",
});

// Download a YouTube video as MP4.
registerYouTubeCommand({
    pattern: "video",
    aliases: ["ytvideo", "ytv"],
    type: "video",
    description: "Download a YouTube video as MP4",
});

console.log("LUKA-XMD downloader1.js loaded successfully.");
