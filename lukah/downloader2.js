"use strict";

const { gmd } = require("../luka");
const axios = require("axios");

const PLUGIN_NAME = "LUKA-XMD Downloader 2";

const DEFAULT_TIMEOUT = 120000;

function getApiConfig(conText) {
    const apiUrl = (
        conText.GuruTechApi ||
        conText.guruTechApi ||
        ""
    ).replace(/\/+$/, "");

    const apiKey =
        conText.GuruApiKey ||
        conText.GuruTechApiKey ||
        conText.apikey ||
        "";

    return { apiUrl, apiKey };
}

function buildUrl(base, endpoint, params = {}) {
    const url = new URL(`${base}${endpoint}`);

    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== "") {
            url.searchParams.set(key, String(value));
        }
    }

    return url.toString();
}

async function apiGet(conText, endpoint, params = {}) {
    const { apiUrl, apiKey } = getApiConfig(conText);

    if (!apiUrl) {
        throw new Error("API URL is missing from the bot configuration.");
    }

    const url = buildUrl(apiUrl, endpoint, {
        ...params,
        apikey: apiKey
    });

    const response = await axios.get(url, {
        timeout: DEFAULT_TIMEOUT,
        validateStatus: () => true,
        headers: {
            Accept: "application/json, audio/*, video/*, */*",
            "User-Agent": "LUKA-XMD-Downloader/2.0"
        },
        responseType: "arraybuffer",
        maxContentLength: 100 * 1024 * 1024,
        maxBodyLength: 100 * 1024 * 1024
    });

    const contentType = String(
        response.headers["content-type"] || ""
    ).toLowerCase();

    const raw = Buffer.from(response.data);

    if (response.status < 200 || response.status >= 300) {
        let detail = raw.toString("utf8").slice(0, 400);

        try {
            const parsed = JSON.parse(detail);
            detail =
                parsed.message ||
                parsed.error ||
                parsed.msg ||
                detail;
        } catch (_) {}

        throw new Error(
            `API returned HTTP ${response.status}: ${detail}`
        );
    }

    if (
        contentType.includes("application/json") ||
        contentType.includes("text/")
    ) {
        const text = raw.toString("utf8");

        let data;
        try {
            data = JSON.parse(text);
        } catch (_) {
            throw new Error(
                `The API returned text instead of a media file: ${text.slice(0, 250)}`
            );
        }

        if (
            data.status === false ||
            data.success === false ||
            data.error
        ) {
            throw new Error(
                data.message ||
                data.error ||
                data.msg ||
                "The API could not process this request."
            );
        }

        return data;
    }

    return {
        buffer: raw,
        contentType
    };
}

function findValue(data, keys) {
    if (!data || typeof data !== "object") return null;

    for (const key of keys) {
        if (data[key] !== undefined && data[key] !== null) {
            return data[key];
        }
    }

    if (data.result && typeof data.result === "object") {
        const found = findValue(data.result, keys);
        if (found) return found;
    }

    if (data.data && typeof data.data === "object") {
        const found = findValue(data.data, keys);
        if (found) return found;
    }

    return null;
}

async function downloadFile(url) {
    const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: DEFAULT_TIMEOUT,
        maxContentLength: 100 * 1024 * 1024,
        headers: {
            "User-Agent": "Mozilla/5.0 (compatible; LUKA-XMD)"
        }
    });

    return {
        buffer: Buffer.from(response.data),
        contentType: String(
            response.headers["content-type"] || ""
        ).toLowerCase()
    };
}

async function getMediaResult(conText, endpoint, params = {}) {
    const result = await apiGet(conText, endpoint, params);

    if (result.buffer) {
        return result;
    }

    const mediaUrl = findValue(result, [
        "downloadUrl",
        "download_url",
        "url",
        "link",
        "media",
        "audio",
        "video",
        "file"
    ]);

    if (typeof mediaUrl !== "string") {
        throw new Error(
            "The API responded, but no downloadable media URL was found."
        );
    }

    if (!/^https?:\/\//i.test(mediaUrl)) {
        throw new Error("The API returned an invalid download URL.");
    }

    return downloadFile(mediaUrl);
}

function registerCommand(config) {
    const {
        pattern,
        endpoint,
        inputName = "url",
        title,
        mediaType,
        fileName,
        mimeType,
        description
    } = config;

    gmd(
        {
            pattern,
            alias: config.alias || [],
            desc: description || `Download using ${PLUGIN_NAME}`,
            category: "downloader",
            filename: __filename
        },
        async (from, Guru, conText) => {
            const { q, mek, reply, react } = conText;

            if (!q) {
                return reply(
                    `Please provide a search query or URL.\n\nExample: .${pattern} <query or URL>`
                );
            }

            try {
                if (react) await react("⏳");

                await reply(`Downloading ${title}... Please wait.`);

                const result = await getMediaResult(
                    conText,
                    endpoint,
                    { [inputName]: q.trim() }
                );

                if (!result.buffer || !result.buffer.length) {
                    throw new Error("The downloaded file is empty.");
                }

                const caption =
                    `╭━━〔 LUKA-XMD 〕━━╮\n` +
                    `┃ ${title} Downloaded\n` +
                    `╰━━━━━━━━━━━━━━╯`;

                const options = {
                    caption,
                    mimetype: mimeType
                };

                if (mediaType === "audio") {
                    await Guru.sendMessage(
                        from,
                        {
                            audio: result.buffer,
                            mimetype: mimeType || "audio/mpeg",
                            fileName: fileName || "luka-audio.mp3"
                        },
                        { quoted: mek }
                    );
                } else if (mediaType === "video") {
                    await Guru.sendMessage(
                        from,
                        {
                            video: result.buffer,
                            caption,
                            mimetype: mimeType || "video/mp4"
                        },
                        { quoted: mek }
                    );
                } else if (mediaType === "document") {
                    await Guru.sendMessage(
                        from,
                        {
                            document: result.buffer,
                            mimetype:
                                mimeType ||
                                result.contentType ||
                                "application/octet-stream",
                            fileName: fileName || "luka-download.bin",
                            caption
                        },
                        { quoted: mek }
                    );
                } else {
                    throw new Error("Unsupported media type in command configuration.");
                }

                if (react) await react("✅");
            } catch (error) {
                console.error(
                    `[LUKA-XMD DOWNLOADER2] ${pattern}:`,
                    error.message
                );

                if (react) await react("❌");

                return reply(
                    `Download failed.\n\nReason: ${error.message}\n\nPlease check your API configuration and try again.`
                );
            }
        }
    );
}

// Spotify music
registerCommand({
    pattern: "spotify",
    alias: ["spot"],
    endpoint: "/api/download/spotify",
    inputName: "url",
    title: "Spotify",
    mediaType: "audio",
    fileName: "luka-spotify.mp3",
    mimeType: "audio/mpeg",
    description: "Download Spotify music"
});

// Google Drive
registerCommand({
    pattern: "gdrive",
    alias: ["gdl"],
    endpoint: "/api/download/gdrive",
    inputName: "url",
    title: "Google Drive",
    mediaType: "document",
    fileName: "luka-gdrive-download",
    description: "Download a Google Drive file"
});

// MediaFire
registerCommand({
    pattern: "mediafire",
    alias: ["mf"],
    endpoint: "/api/download/mediafire",
    inputName: "url",
    title: "MediaFire",
    mediaType: "document",
    fileName: "luka-mediafire-download",
    description: "Download a MediaFire file"
});

// TikTok
registerCommand({
    pattern: "tiktok",
    alias: ["tt"],
    endpoint: "/api/download/tiktok",
    inputName: "url",
    title: "TikTok",
    mediaType: "video",
    mimeType: "video/mp4",
    description: "Download TikTok videos"
});

// Facebook
registerCommand({
    pattern: "facebook",
    alias: ["fb"],
    endpoint: "/api/download/facebook",
    inputName: "url",
    title: "Facebook",
    mediaType: "video",
    mimeType: "video/mp4",
    description: "Download Facebook videos"
});

// Instagram
registerCommand({
    pattern: "instagram",
    alias: ["ig"],
    endpoint: "/api/download/instagram",
    inputName: "url",
    title: "Instagram",
    mediaType: "video",
    mimeType: "video/mp4",
    description: "Download Instagram media"
});

// APK
registerCommand({
    pattern: "apk",
    alias: ["apkdl"],
    endpoint: "/api/download/apkdl",
    inputName: "appName",
    title: "APK",
    mediaType: "document",
    fileName: "luka-app.apk",
    mimeType: "application/vnd.android.package-archive",
    description: "Search for and download APK files"
});

// Direct URL downloader
gmd(
    {
        pattern: "directdl",
        alias: ["fetch"],
        desc: "Download a direct media URL",
        category: "downloader",
        filename: __filename
    },
    async (from, Guru, conText) => {
        const { q, mek, reply, react } = conText;

        if (!q) {
            return reply(
                "Please provide a direct file URL.\nExample: .directdl https://example.com/file.mp4"
            );
        }

        try {
            if (react) await react("⏳");

            const url = q.trim();

            if (!/^https?:\/\//i.test(url)) {
                throw new Error("Please provide a valid HTTP or HTTPS URL.");
            }

            const result = await downloadFile(url);

            if (!result.buffer.length) {
                throw new Error("The downloaded file is empty.");
            }

            const type = result.contentType;
            const caption = "Downloaded by LUKA-XMD";

            if (type.includes("audio")) {
                await Guru.sendMessage(
                    from,
                    {
                        audio: result.buffer,
                        mimetype: type || "audio/mpeg",
                        fileName: "luka-audio"
                    },
                    { quoted: mek }
                );
            } else if (type.includes("video")) {
                await Guru.sendMessage(
                    from,
                    {
                        video: result.buffer,
                        caption,
                        mimetype: type || "video/mp4"
                    },
                    { quoted: mek }
                );
            } else {
                await Guru.sendMessage(
                    from,
                    {
                        document: result.buffer,
                        fileName: "luka-download",
                        mimetype: type || "application/octet-stream",
                        caption
                    },
                    { quoted: mek }
                );
            }

            if (react) await react("✅");
        } catch (error) {
            console.error(
                "[LUKA-XMD DIRECT DOWNLOAD ERROR]",
                error.message
            );

            if (react) await react("❌");

            return reply(
                `Direct download failed.\nReason: ${error.message}`
            );
        }
    }
);

console.log("LUKA-XMD Downloader 2 plugin loaded.");
