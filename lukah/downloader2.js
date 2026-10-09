"use strict";

const {
    gmd,
    MAX_MEDIA_SIZE,
    getMimeCategory,
    getMimeFromUrl,
} = require("../guru");

const axios = require("axios");

const API_TIMEOUT = 60000;
const MAX_FILE_SIZE = 100 * 1024 * 1024;

// ======================================================
// LUKA-XMD DOWNLOADER 2
// Commands: spotify, gdrive, mediafire, apk,
//           pastebin, ytmp3, ytmp4
// ======================================================

function getApiConfig(conText) {
    let base = String(conText.GuruTechApi || "").trim();
    const apikey = String(conText.GuruApiKey || "").trim();

    // Correct the old GiftedTech hostname.
    if (
        !base ||
        base.includes("api.giftedtech.co.ke")
    ) {
        base = "https://api.gifted.co.ke";
    }

    return {
        base: base.replace(/\/+$/, ""),
        apikey: apikey || "gifted",
    };
}

function cleanName(name) {
    return String(name || "LUKA-XMD-Download")
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
        .trim()
        .slice(0, 100) || "LUKA-XMD-Download";
}

function getErrorMessage(data, fallback) {
    if (typeof data === "string" && data.trim()) {
        return data.slice(0, 250);
    }

    return (
        data?.error ||
        data?.message ||
        data?.msg ||
        data?.result?.error ||
        data?.result?.message ||
        fallback ||
        "Unknown API error"
    );
}

function extractResult(data) {
    if (!data || typeof data !== "object") return null;

    if (data.success === false || data.status === false) {
        throw new Error(getErrorMessage(data, "API request failed"));
    }

    return data.result ?? data.data ?? data;
}

async function apiGet(conText, endpoint, params = {}) {
    const { base, apikey } = getApiConfig(conText);

    if (!base) {
        throw new Error("API base URL is missing.");
    }

    const response = await axios.get(
        `${base}${endpoint}`,
        {
            params: { apikey, ...params },
            timeout: API_TIMEOUT,
            maxContentLength: MAX_FILE_SIZE,
            maxBodyLength: MAX_FILE_SIZE,
            validateStatus: () => true,
            headers: {
                "User-Agent": "Mozilla/5.0 LUKA-XMD",
                Accept: "application/json, */*",
            },
        }
    );

    if (response.status < 200 || response.status >= 300) {
        throw new Error(
            `API HTTP ${response.status}: ${
                getErrorMessage(response.data, "Request failed")
            }`
        );
    }

    return response.data;
}

async function downloadBuffer(url) {
    if (!/^https?:\/\//i.test(String(url || ""))) {
        throw new Error("Invalid download URL.");
    }

    const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: API_TIMEOUT,
        maxContentLength: MAX_FILE_SIZE,
        maxBodyLength: MAX_FILE_SIZE,
        headers: {
            "User-Agent": "Mozilla/5.0 LUKA-XMD",
        },
    });

    const buffer = Buffer.from(response.data);
    const contentType = String(
        response.headers["content-type"] || ""
    ).toLowerCase();

    if (!buffer.length) {
        throw new Error("The downloaded file is empty.");
    }

    if (
        contentType.includes("text/html") ||
        contentType.includes("application/json")
    ) {
        const text = buffer.toString("utf8").slice(0, 250);

        throw new Error(
            `The server returned a webpage or JSON instead of a file: ${text}`
        );
    }

    return { buffer, contentType };
}

function getUrl(data, keys = []) {
    if (!data || typeof data !== "object") return null;

    for (const key of keys) {
        if (
            typeof data[key] === "string" &&
            /^https?:\/\//i.test(data[key])
        ) {
            return data[key];
        }
    }

    for (const key of ["result", "data", "file", "media"]) {
        if (data[key] && typeof data[key] === "object") {
            const found = getUrl(data[key], keys);
            if (found) return found;
        }
    }

    return null;
}

async function sendDocument(
    Guru,
    from,
    mek,
    buffer,
    filename,
    mimetype,
    caption = ""
) {
    return Guru.sendMessage(
        from,
        {
            document: buffer,
            fileName: filename,
            mimetype: mimetype || "application/octet-stream",
            caption,
        },
        { quoted: mek }
    );
}

function registerDownloader({
    pattern,
    aliases = [],
    description,
    validate,
    execute,
}) {
    gmd(
        {
            pattern,
            category: "downloader",
            react: "⬇️",
            aliases,
            description,
        },
        async (from, Guru, conText) => {
            const { q, mek, reply, react } = conText;

            if (!q) {
                await react("❌");
                return reply(
                    `Please provide a URL or search query.\n\nExample: .${pattern} <query or URL>`
                );
            }

            try {
                if (validate) {
                    const validation = validate(q.trim());

                    if (validation !== true) {
                        await react("❌");
                        return reply(validation);
                    }
                }

                await react("⏳");

                const result = await execute({
                    from,
                    Guru,
                    conText,
                    q: q.trim(),
                    mek,
                });

                if (result) {
                    await reply(result);
                }

                await react("✅");
            } catch (error) {
                console.error(
                    `[LUKA-XMD ${pattern.toUpperCase()} ERROR]`,
                    error.response?.data || error.message
                );

                await react("❌");

                return reply(
                    `Download failed.\n\nReason: ${error.message}`
                );
            }
        }
    );
}

// ======================================================
// APK DOWNLOADER
// Usage: .apk WhatsApp
// ======================================================

registerDownloader({
    pattern: "apk",
    aliases: ["apkdl", "app", "appdownload"],
    description: "Search for and download APK files",

    execute: async ({ from, Guru, conText, q, mek }) => {
        const { botName } = conText;

        const response = await apiGet(
            conText,
            "/api/download/apkdl",
            { appName: q }
        );

        const data = extractResult(response);

        const downloadUrl = getUrl(data, [
            "download_url",
            "downloadUrl",
            "url",
            "link",
        ]);

        if (!downloadUrl) {
            throw new Error(
                "The APK endpoint did not return a download URL. Check the endpoint response."
            );
        }

        const appName = data.appname || data.appName || q;
        const appIcon = data.appicon || data.icon || data.image;
        const developer = data.developer || "Unknown developer";

        if (
            appIcon &&
            /^https?:\/\//i.test(appIcon)
        ) {
            try {
                await Guru.sendMessage(
                    from,
                    {
                        image: { url: appIcon },
                        caption:
                            `📱 *${botName || "LUKA-XMD"} APK DOWNLOADER*\n\n` +
                            `*App:* ${appName}\n` +
                            `*Developer:* ${developer}\n\n` +
                            `Preparing APK file...`,
                    },
                    { quoted: mek }
                );
            } catch (error) {
                console.error("APK icon could not be sent:", error.message);
            }
        }

        const { buffer } = await downloadBuffer(downloadUrl);

        // APK files are ZIP-based and usually start with PK.
        if (
            buffer.length < 4 ||
            buffer[0] !== 0x50 ||
            buffer[1] !== 0x4b
        ) {
            throw new Error(
                "The download does not appear to be a valid APK file."
            );
        }

        await sendDocument(
            Guru,
            from,
            mek,
            buffer,
            `${cleanName(appName)}.apk`,
            "application/vnd.android.package-archive",
            `📱 ${appName}\nDownloaded by LUKA-XMD`
        );

        return null;
    },
});

// ======================================================
// GOOGLE DRIVE
// Usage: .gdrive https://drive.google.com/...
// ======================================================

registerDownloader({
    pattern: "gdrive",
    aliases: ["drive", "gdrivedl", "googledrive"],
    description: "Download publicly accessible Google Drive files",

    validate: q =>
        /drive\.google\.com/i.test(q) ||
        "Please provide a valid Google Drive URL.",

    execute: async ({ from, Guru, conText, q, mek }) => {
        const response = await apiGet(
            conText,
            "/api/download/gdrivedl",
            { url: q }
        );

        const data = extractResult(response);

        const downloadUrl = getUrl(data, [
            "download_url",
            "downloadUrl",
            "url",
            "link",
        ]);

        if (!downloadUrl) {
            throw new Error(
                "Google Drive API did not return a download URL."
            );
        }

        const filename = cleanName(
            data.name || data.fileName || "gdrive_file"
        );

        const { buffer, contentType } = await downloadBuffer(downloadUrl);

        let mimetype =
            contentType ||
            getMimeFromUrl(filename) ||
            "application/octet-stream";

        if (mimetype.includes(";")) {
            mimetype = mimetype.split(";")[0].trim();
        }

        const category = getMimeCategory(mimetype);
        const tooLarge =
            MAX_MEDIA_SIZE && buffer.length > MAX_MEDIA_SIZE;

        if (category === "image" && !tooLarge) {
            await Guru.sendMessage(
                from,
                {
                    image: buffer,
                    caption: filename,
                },
                { quoted: mek }
            );
        } else if (category === "video" && !tooLarge) {
            await Guru.sendMessage(
                from,
                {
                    video: buffer,
                    mimetype,
                    caption: filename,
                },
                { quoted: mek }
            );
        } else if (category === "audio" && !tooLarge) {
            await Guru.sendMessage(
                from,
                {
                    audio: buffer,
                    mimetype,
                    fileName: filename,
                },
                { quoted: mek }
            );
        } else {
            await sendDocument(
                Guru,
                from,
                mek,
                buffer,
                filename,
                mimetype
            );
        }

        return null;
    },
});

// ======================================================
// MEDIAFIRE
// Usage: .mediafire https://www.mediafire.com/...
// ======================================================

registerDownloader({
    pattern: "mediafire",
    aliases: ["mf", "mfire", "mediafiredl"],
    description: "Download files from MediaFire",

    validate: q =>
        /mediafire\.com/i.test(q) ||
        "Please provide a valid MediaFire URL.",

    execute: async ({ from, Guru, conText, q, mek }) => {
        const response = await apiGet(
            conText,
            "/api/download/mediafire",
            { url: q }
        );

        const data = extractResult(response);

        const downloadUrl = getUrl(data, [
            "downloadUrl",
            "download_url",
            "url",
            "link",
        ]);

        if (!downloadUrl) {
            throw new Error(
                "MediaFire API did not return a download URL."
            );
        }

        const filename = cleanName(
            data.fileName || data.filename || "mediafire_file"
        );

        const { buffer, contentType } = await downloadBuffer(downloadUrl);

        const mimetype =
            data.mimeType ||
            data.mimetype ||
            contentType ||
            getMimeFromUrl(filename) ||
            "application/octet-stream";

        const category = getMimeCategory(mimetype);
        const tooLarge =
            MAX_MEDIA_SIZE && buffer.length > MAX_MEDIA_SIZE;

        if (category === "image" && !tooLarge) {
            await Guru.sendMessage(
                from,
                {
                    image: buffer,
                    caption: filename,
                },
                { quoted: mek }
            );
        } else if (category === "video" && !tooLarge) {
            await Guru.sendMessage(
                from,
                {
                    video: buffer,
                    mimetype,
                    caption: filename,
                },
                { quoted: mek }
            );
        } else if (category === "audio" && !tooLarge) {
            await Guru.sendMessage(
                from,
                {
                    audio: buffer,
                    mimetype,
                    fileName: filename,
                },
                { quoted: mek }
            );
        } else {
            await sendDocument(
                Guru,
                from,
                mek,
                buffer,
                filename,
                mimetype
            );
        }

        return null;
    },
});

// ======================================================
// SPOTIFY
// Usage: .spotify <Spotify track URL>
// ======================================================

registerDownloader({
    pattern: "spotify",
    aliases: ["spot", "spotifydl"],
    description: "Download a Spotify track using its URL",

    validate: q =>
        /open\.spotify\.com\/track\//i.test(q) ||
        "Please provide a Spotify track URL, for example https://open.spotify.com/track/....",

    execute: async ({ from, Guru, conText, q, mek }) => {
        const { base, apikey } = getApiConfig(conText);

        let data = null;
        let lastError = null;

        // Try the downloader endpoints used in the supplied plugin.
        for (const endpoint of ["spotifydl", "spotifydlv2"]) {
            try {
                const response = await axios.get(
                    `${base}/api/download/${endpoint}`,
                    {
                        params: { apikey, url: q },
                        timeout: 30000,
                    }
                );

                const result = extractResult(response.data);

                const downloadUrl = getUrl(result, [
                    "download_url",
                    "downloadUrl",
                    "url",
                    "link",
                ]);

                if (downloadUrl) {
                    data = {
                        ...result,
                        download_url: downloadUrl,
                    };
                    break;
                }
            } catch (error) {
                lastError = error;
            }
        }

        if (!data?.download_url) {
            throw new Error(
                lastError
                    ? `Spotify download failed: ${lastError.message}`
                    : "No Spotify download URL was returned. Check whether your API supports spotifydl."
            );
        }

        const { buffer } = await downloadBuffer(data.download_url);

        const title = cleanName(
            data.title || data.name || "spotify_track"
        );

        await sendDocument(
            Guru,
            from,
            mek,
            buffer,
            `${title}.mp3`,
            "audio/mpeg",
            `🎵 ${title}\nDownloaded by LUKA-XMD`
        );

        return null;
    },
});

// ======================================================
// PASTEBIN
// Usage: .pastebin https://pastebin.com/xxxx
// ======================================================

registerDownloader({
    pattern: "pastebin",
    aliases: ["paste", "getpaste", "pastedl"],
    description: "Fetch public Pastebin content",

    validate: q =>
        /pastebin\.com/i.test(q) ||
        "Please provide a valid Pastebin URL.",

    execute: async ({ from, Guru, conText, q, mek }) => {
        const response = await apiGet(
            conText,
            "/api/download/pastebin",
            { url: q }
        );

        const data = extractResult(response);

        let content =
            typeof data === "string"
                ? data
                : data?.content || data?.text || data?.paste;

        if (!content) {
            throw new Error(
                "Pastebin API did not return any paste content."
            );
        }

        content = String(content)
            .replace(/\\r\\n/g, "\n")
            .replace(/\\n/g, "\n")
            .replace(/\\t/g, "\t");

        const pasteId = q
            .split("/")
            .pop()
            .split("?")[0];

        const message =
            `*LUKA-XMD PASTEBIN VIEWER*\n` +
            `*Paste ID:* ${pasteId}\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            content;

        if (message.length > 60000) {
            await sendDocument(
                Guru,
                from,
                mek,
                Buffer.from(content, "utf8"),
                `pastebin_${cleanName(pasteId)}.txt`,
                "text/plain",
                "Paste content is too long to display as a message."
            );
        } else {
            await Guru.sendMessage(
                from,
                { text: message },
                { quoted: mek }
            );
        }

        return null;
    },
});

// ======================================================
// YOUTUBE MP3
// Usage: .ytmp3 https://youtube.com/watch?v=...
// ======================================================

registerDownloader({
    pattern: "ytmp3",
    aliases: ["ytaudio", "ytmusic"],
    description: "Download YouTube audio as MP3",

    validate: q =>
        /youtube\.com|youtu\.be/i.test(q) ||
        "Please provide a valid YouTube URL.",

    execute: async ({ from, Guru, conText, q, mek }) => {
        const { base, apikey } = getApiConfig(conText);

        const response = await axios.get(
            `${base}/api/download/ytaudio`,
            {
                params: {
                    apikey,
                    url: q,
                },
                timeout: API_TIMEOUT,
                responseType: "arraybuffer",
                maxContentLength: MAX_FILE_SIZE,
                validateStatus: () => true,
            }
        );

        const buffer = Buffer.from(response.data);
        const contentType = String(
            response.headers["content-type"] || ""
        ).toLowerCase();

        if (response.status < 200 || response.status >= 300) {
            throw new Error(
                `YouTube audio API returned HTTP ${response.status}.`
            );
        }

        if (
            contentType.includes("application/json") ||
            contentType.includes("text/")
        ) {
            let data;

            try {
                data = JSON.parse(buffer.toString("utf8"));
            } catch (_) {
                throw new Error(
                    "The YouTube audio API returned text instead of audio."
                );
            }

            const result = extractResult(data);
            const url = getUrl(result, [
                "download_url",
                "downloadUrl",
                "url",
                "link",
            ]);

            if (!url) {
                throw new Error(
                    "The YouTube audio API did not return a download URL."
                );
            }

            const file = await downloadBuffer(url);

            await sendDocument(
                Guru,
                from,
                mek,
                file.buffer,
                "luka-youtube-audio.mp3",
                "audio/mpeg"
            );
        } else {
            if (!buffer.length) {
                throw new Error("The audio file is empty.");
            }

            await sendDocument(
                Guru,
                from,
                mek,
                buffer,
                "luka-youtube-audio.mp3",
                "audio/mpeg"
            );
        }

        return null;
    },
});

// ======================================================
// YOUTUBE MP4
// Usage: .ytmp4 https://youtube.com/watch?v=...
// ======================================================

registerDownloader({
    pattern: "ytmp4",
    aliases: ["ytvideo", "ytv"],
    description: "Download YouTube video as MP4",

    validate: q =>
        /youtube\.com|youtu\.be/i.test(q) ||
        "Please provide a valid YouTube URL.",

    execute: async ({ from, Guru, conText, q, mek }) => {
        const { base, apikey } = getApiConfig(conText);

        const response = await axios.get(
            `${base}/api/download/ytvideo`,
            {
                params: {
                    apikey,
                    url: q,
                },
                timeout: API_TIMEOUT,
                responseType: "arraybuffer",
                maxContentLength: MAX_FILE_SIZE,
                validateStatus: () => true,
            }
        );

        const buffer = Buffer.from(response.data);
        const contentType = String(
            response.headers["content-type"] || ""
        ).toLowerCase();

        if (response.status < 200 || response.status >= 300) {
            throw new Error(
                `YouTube video API returned HTTP ${response.status}.`
            );
        }

        if (
            contentType.includes("application/json") ||
            contentType.includes("text/")
        ) {
            let data;

            try {
                data = JSON.parse(buffer.toString("utf8"));
            } catch (_) {
                throw new Error(
                    "The YouTube video API returned text instead of video."
                );
            }

            const result = extractResult(data);
            const url = getUrl(result, [
                "download_url",
                "downloadUrl",
                "url",
                "link",
            ]);

            if (!url) {
                throw new Error(
                    "The YouTube video API did not return a download URL."
                );
            }

            const file = await downloadBuffer(url);

            await sendDocument(
                Guru,
                from,
                mek,
                file.buffer,
                "luka-youtube-video.mp4",
                "video/mp4"
            );
        } else {
            if (!buffer.length) {
                throw new Error("The video file is empty.");
            }

            await sendDocument(
                Guru,
                from,
                mek,
                buffer,
                "luka-youtube-video.mp4",
                "video/mp4"
            );
        }

        return null;
    },
});

console.log("LUKA-XMD downloader2.js loaded.");
