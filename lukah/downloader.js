"use strict";

const axios = require("axios");
const yts = require("yt-search");
const {
    gmd,
    MAX_MEDIA_SIZE,
    getFileSize,
} = require("../luka");

// ======================================================
// LUKA-XMD MUSIC DOWNLOADER
// Commands: .play, .song, .ytaudio, .ytmp3
// ======================================================

function getApiConfig(conText) {
    let base =
        (conText.GuruTechApi || "https://api.gifted.co.ke").trim();

    base = base.replace(/\/+$/, "");

    // Correct the old API hostname if it is still configured.
    base = base.replace(
        /^https:\/\/api\.giftedtech\.co\.ke$/i,
        "https://api.gifted.co.ke"
    );

    return {
        base,
        key: (conText.GuruApiKey || "gifted").trim(),
    };
}

function cleanFileName(name) {
    return (name || "LUKA-XMD-Audio")
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 100);
}

function getAudioUrl(data) {
    if (!data) return null;

    if (typeof data === "string") {
        if (/^https?:\/\//i.test(data)) return data;

        try {
            return getAudioUrl(JSON.parse(data));
        } catch {
            return null;
        }
    }

    if (Array.isArray(data)) {
        for (const item of data) {
            const found = getAudioUrl(item);
            if (found) return found;
        }
        return null;
    }

    const candidates = [
        data.download_url,
        data.downloadUrl,
        data.audio_url,
        data.audioUrl,
        data.audio,
        data.url,
        data.link,
        data.mp3,
        data.result,
        data.data,
    ];

    for (const item of candidates) {
        if (typeof item === "string" && /^https?:\/\//i.test(item)) {
            return item;
        }

        if (item && typeof item === "object") {
            const found = getAudioUrl(item);
            if (found) return found;
        }
    }

    return null;
}

function isYouTubeUrl(text) {
    try {
        const url = new URL(text);
        return (
            /(^|\.)youtube\.com$/i.test(url.hostname) ||
            /(^|\.)youtu\.be$/i.test(url.hostname)
        );
    } catch {
        return false;
    }
}

async function searchSong(query) {
    const result = await yts(query);

    const videos = result.videos || [];

    if (!videos.length) {
        throw new Error(
            "No song found. Try another song title or artist name."
        );
    }

    // Pick the first suitable YouTube video.
    const song = videos.find(
        (video) =>
            video &&
            video.url &&
            isYouTubeUrl(video.url) &&
            !video.live
    ) || videos.find(
        (video) => video && video.url && isYouTubeUrl(video.url)
    );

    if (!song) {
        throw new Error("No suitable YouTube video was found.");
    }

    return song;
}

async function getAudioFromApi(videoUrl, conText) {
    const { base, key } = getApiConfig(conText);

    // Officially documented endpoints first.
    const endpoints = [
        "ytaudio",
        "ytmp3",
        "dlmp3v2",
    ];

    let lastError = "Audio download failed.";

    for (const endpoint of endpoints) {
        try {
            const response = await axios.get(
                `${base}/api/download/${endpoint}`,
                {
                    params: {
                        apikey: key,
                        url: videoUrl,
                        stream: "true",
                        quality: "128",
                    },
                    responseType: "arraybuffer",
                    timeout: 120000,
                    maxContentLength: 60 * 1024 * 1024,
                    maxBodyLength: 60 * 1024 * 1024,
                    validateStatus: (status) =>
                        status >= 200 && status < 500,
                }
            );

            const contentType = String(
                response.headers["content-type"] || ""
            ).toLowerCase();

            const bytes = Buffer.from(response.data || []);

            if (response.status >= 400) {
                let detail = `HTTP ${response.status}`;

                try {
                    const parsed = JSON.parse(bytes.toString("utf8"));
                    detail =
                        parsed.error ||
                        parsed.message ||
                        detail;
                } catch {}

                lastError = `${endpoint}: ${detail}`;
                continue;
            }

            // API returned audio bytes directly.
            if (
                bytes.length > 0 &&
                (
                    contentType.includes("audio/") ||
                    contentType.includes("application/octet-stream") ||
                    contentType.includes("video/mp4")
                ) &&
                !contentType.includes("application/json")
            ) {
                // Avoid sending a JSON error body as an audio file.
                const beginning = bytes
                    .subarray(0, 100)
                    .toString("utf8")
                    .trim()
                    .toLowerCase();

                if (
                    beginning.startsWith("{") ||
                    beginning.startsWith("<!doctype html") ||
                    beginning.startsWith("<html")
                ) {
                    lastError = `${endpoint}: API returned an error page.`;
                    continue;
                }

                return {
                    buffer: bytes,
                    url: null,
                };
            }

            // Some API responses return JSON containing the download URL.
            let parsed;

            try {
                parsed = JSON.parse(bytes.toString("utf8"));
            } catch {
                lastError =
                    `${endpoint}: Unexpected response from download API.`;
                continue;
            }

            if (
                parsed.success === false ||
                parsed.status === 401 ||
                parsed.status === 429 ||
                parsed.error
            ) {
                lastError =
                    parsed.error ||
                    parsed.message ||
                    `${endpoint}: API request failed.`;
                continue;
            }

            const audioUrl = getAudioUrl(parsed.result || parsed.data || parsed);

            if (audioUrl) {
                return {
                    buffer: null,
                    url: audioUrl,
                };
            }

            lastError =
                parsed.message ||
                `${endpoint}: No audio URL was returned.`;
        } catch (error) {
            lastError =
                error.response?.data?.message ||
                error.message ||
                lastError;
        }
    }

    throw new Error(lastError);
}

// ======================================================
// MAIN PLAY COMMAND
// ======================================================

gmd(
    {
        pattern: "play",
        category: "downloader",
        react: "🎵",
        aliases: ["song", "music", "ytaudio", "ytmp3"],
        description:
            "Search and download a song from YouTube. Usage: .play song name",
    },
    async (from, Guru, conText) => {
        const {
            q,
            mek,
            reply,
            react,
            botName,
            botFooter,
        } = conText;

        if (!q || !q.trim()) {
            await react("❌");

            return reply(
                "🎵 *LUKA-XMD MUSIC DOWNLOADER*\n\n" +
                "Please enter a song name or YouTube link.\n\n" +
                "*Examples:*\n" +
                ".play Diamond Platnumz Jeje\n" +
                ".play Harmonize Single Again\n" +
                ".play https://youtu.be/VIDEO_ID"
            );
        }

        const query = q.trim();

        await react("⏳");

        await reply(
            `╭─❏ 「 🎵 MUSIC DOWNLOADER 」\n` +
            `│ 🔎 Searching: ${query}\n` +
            `│ ⏳ Please wait...\n` +
            `╰────────────────────\n` +
            `> ${botFooter || botName || "LUKA-XMD"}`
        );

        try {
            let song;

            // Accept either a YouTube URL or a song name.
            if (isYouTubeUrl(query)) {
                song = {
                    url: query,
                    title: query,
                    timestamp: "",
                    author: { name: "YouTube" },
                    thumbnail: "",
                    duration: { timestamp: "" },
                };

                // Try to retrieve the actual title and artist.
                try {
                    const found = await yts({
                        videoId: new URL(query).searchParams.get("v") ||
                            query.split("/").pop().split("?")[0],
                    });

                    if (found && found.title) {
                        song = { ...song, ...found };
                    }
                } catch {}
            } else {
                song = await searchSong(query);
            }

            if (!song?.url || !isYouTubeUrl(song.url)) {
                throw new Error("Could not find a valid YouTube video.");
            }

            const title = song.title || query;
            const artist =
                song.author?.name ||
                song.author ||
                "Unknown Artist";

            const duration =
                song.timestamp ||
                song.duration?.timestamp ||
                "Unknown";

            await reply(
                `╭─❏ 「 🎶 SONG FOUND 」\n` +
                `│ 🎵 Title: ${title}\n` +
                `│ 👤 Artist: ${artist}\n` +
                `│ ⏱️ Duration: ${duration}\n` +
                `│ ⬇️ Downloading audio...\n` +
                `╰────────────────────\n` +
                `> ${botFooter || botName || "LUKA-XMD"}`
            );

            const audio = await getAudioFromApi(song.url, conText);

            const fileName = `${cleanFileName(title)}.mp3`;

            const message = {
                audio: audio.buffer
                    ? audio.buffer
                    : { url: audio.url },
                mimetype: "audio/mpeg",
                fileName,
                ptt: false,
                contextInfo: {
                    externalAdReply: {
                        title: title.slice(0, 100),
                        body: `Artist: ${artist}`,
                        ...(song.thumbnail
                            ? { thumbnailUrl: song.thumbnail }
                            : {}),
                        mediaType: 1,
                        renderLargerThumbnail: false,
                    },
                },
            };

            await Guru.sendMessage(from, message, {
                quoted: mek,
            });

            await react("✅");
        } catch (error) {
            console.error(
                "[LUKA-XMD PLAY ERROR]",
                error.response?.data || error.stack || error.message
            );

            await react("❌");

            return reply(
                `❌ *MUSIC DOWNLOAD FAILED*\n\n` +
                `Reason: ${error.message || "Unknown error"}\n\n` +
                `Please try another song or try again later.`
            );
        }
    }
);
