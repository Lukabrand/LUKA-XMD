"use strict";

const axios = require("axios");
const yts = require("yt-search");

const {
    gmd,
    gitRepoRegex,
    MAX_MEDIA_SIZE,
    getFileSize,
} = require("../luka");

// ======================================================
// LUKA-XMD DOWNLOADER 1
// PLAY, FACEBOOK, TIKTOK, INSTAGRAM, TWITTER, SNACK,
// GITHUB CLONE
// ======================================================

function toxicBox(title, lines = [], footer = "LUKA-XMD") {
    return (
        `╭─❏ 「 ${title} 」\n` +
        lines.filter(Boolean).map((line) => `│ ${line}`).join("\n") +
        `\n╰───────────────────────────\n` +
        `> _${footer || "LUKA-XMD"}_`
    );
}

function cleanName(name) {
    return (name || "LUKA-XMD")
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 90);
}

function getApi(conText) {
    let base = (
        conText.GuruTechApi ||
        "https://api.gifted.co.ke"
    ).trim().replace(/\/+$/, "");

    if (/^https:\/\/api\.giftedtech\.co\.ke$/i.test(base)) {
        base = "https://api.gifted.co.ke";
    }

    return {
        base,
        key: conText.GuruApiKey || "gifted",
    };
}

function validUrl(value) {
    if (typeof value !== "string") return false;
    try {
        const u = new URL(value);
        return u.protocol === "https:" || u.protocol === "http:";
    } catch {
        return false;
    }
}

function extractUrl(data) {
    if (!data) return null;

    if (typeof data === "string") {
        return validUrl(data) ? data : null;
    }

    if (Array.isArray(data)) {
        for (const item of data) {
            const found = extractUrl(item);
            if (found) return found;
        }
        return null;
    }

    if (typeof data === "object") {
        const keys = [
            "download_url",
            "downloadUrl",
            "video_url",
            "videoUrl",
            "audio_url",
            "audioUrl",
            "hd_video",
            "sd_video",
            "video",
            "media",
            "url",
            "link",
        ];

        for (const key of keys) {
            const value = data[key];

            if (typeof value === "string" && validUrl(value)) {
                return value;
            }
        }

        for (const key of ["result", "data", "media", "downloads"]) {
            if (data[key] && typeof data[key] === "object") {
                const found = extractUrl(data[key]);
                if (found) return found;
            }
        }
    }

    return null;
}

async function getJson(url, params = {}, timeout = 30000) {
    const response = await axios.get(url, {
        params,
        timeout,
        headers: {
            "User-Agent": "Mozilla/5.0 LUKA-XMD",
        },
    });

    return response.data;
}

async function sendVideo(Guru, from, mek, url, title, footer) {
    if (!validUrl(url)) {
        throw new Error("The API did not return a valid media URL.");
    }

    const size = await getFileSize(url).catch(() => 0);
    const filename = `${cleanName(title)}.mp4`;

    const media = size > MAX_MEDIA_SIZE
        ? {
            document: { url },
            fileName: filename,
            mimetype: "video/mp4",
        }
        : {
            video: { url },
            mimetype: "video/mp4",
        };

    await Guru.sendMessage(
        from,
        {
            ...media,
            caption: toxicBox("VIDEO DOWNLOADER", [title], footer),
        },
        { quoted: mek }
    );
}

// ======================================================
// PLAY / SONG
// ======================================================

async function downloadAudio(videoUrl, conText) {
    const { base, key } = getApi(conText);

    // ytaudio is the documented Gifted API route.
    const response = await axios.get(
        `${base}/api/download/ytaudio`,
        {
            params: {
                apikey: key,
                url: videoUrl,
                stream: "true",
            },
            responseType: "arraybuffer",
            timeout: 120000,
            maxContentLength: 60 * 1024 * 1024,
            validateStatus: (status) => status >= 200 && status < 500,
        }
    );

    const buffer = Buffer.from(response.data || []);
    const contentType = String(
        response.headers["content-type"] || ""
    ).toLowerCase();

    if (response.status >= 400) {
        let message = `Audio API returned HTTP ${response.status}`;

        try {
            const json = JSON.parse(buffer.toString("utf8"));
            message = json.message || json.error || message;
        } catch {}

        throw new Error(message);
    }

    if (
        contentType.includes("application/json") ||
        contentType.includes("text/")
    ) {
        let json;

        try {
            json = JSON.parse(buffer.toString("utf8"));
        } catch {
            throw new Error("Audio API returned an invalid response.");
        }

        if (json.success === false || json.error) {
            throw new Error(
                json.message || json.error || "Audio download failed."
            );
        }

        const audioUrl = extractUrl(json);

        if (!audioUrl) {
            throw new Error(
                "Audio API returned no download URL. Check its documentation."
            );
        }

        return { buffer: null, url: audioUrl };
    }

    if (!buffer.length) {
        throw new Error("The audio API returned an empty file.");
    }

    // Detect an error page accidentally returned as media.
    const start = buffer.subarray(0, 30).toString("utf8").toLowerCase();

    if (start.includes("<html") || start.includes("<!doctype")) {
        throw new Error("The audio API returned an HTML error page.");
    }

    return { buffer, url: null };
}

gmd(
    {
        pattern: "play",
        category: "downloader",
        react: "🎵",
        aliases: ["song", "music", "ytaudio", "ytmp3"],
        description: "Search and download songs from YouTube.",
    },
    async (from, Guru, conText) => {
        const { q, mek, reply, react, botFooter } = conText;

        if (!q || !q.trim()) {
            await react("❌");
            return reply(
                "🎵 *LUKA-XMD PLAY*\n\n" +
                "Usage:\n" +
                ".play song name\n\n" +
                "Example:\n" +
                ".play Diamond Platnumz Jeje"
            );
        }

        try {
            await react("⏳");

            const query = q.trim();
            let video;

            if (/youtu\.be\/|youtube\.com\//i.test(query)) {
                video = { url: query, title: query };
            } else {
                const search = await yts(query);
                video = search.videos?.find(
                    (item) => item.url && !item.live
                );

                if (!video) {
                    throw new Error("No song found. Try another title.");
                }
            }

            await reply(
                toxicBox(
                    "PLAY MUSIC",
                    [
                        `🎵 ${video.title || query}`,
                        "⬇️ Downloading audio...",
                    ],
                    botFooter
                )
            );

            const audio = await downloadAudio(video.url, conText);

            const audioMessage = {
                audio: audio.buffer || { url: audio.url },
                mimetype: "audio/mpeg",
                fileName: `${cleanName(video.title || query)}.mp3`,
                ptt: false,
            };

            await Guru.sendMessage(from, audioMessage, {
                quoted: mek,
            });

            await react("✅");
        } catch (error) {
            console.error("[LUKA-XMD PLAY]", error.response?.data || error.message);
            await react("❌");

            return reply(
                toxicBox(
                    "PLAY ERROR",
                    [
                        error.message || "Unable to download this song.",
                        "Try again or use another song title.",
                    ],
                    botFooter
                )
            );
        }
    }
);

// ======================================================
// GITHUB CLONE
// ======================================================

gmd(
    {
        pattern: "gitclone",
        category: "downloader",
        react: "📦",
        aliases: ["gitdl", "github", "git", "repodl", "clone"],
        description: "Download a public GitHub repository.",
    },
    async (from, Guru, conText) => {
        const { q, mek, reply, react } = conText;

        if (!q || !gitRepoRegex.test(q)) {
            await react("❌");
            return reply(
                "Provide a valid public GitHub repository URL.\n" +
                "Example: .gitclone https://github.com/user/repo"
            );
        }

        try {
            const match = q.match(gitRepoRegex);
            const user = match?.[1];
            const repo = match?.[2]?.replace(/\.git$/, "").split("/")[0];

            if (!user || !repo) {
                throw new Error("Invalid repository URL.");
            }

            const info = await getJson(
                `https://api.github.com/repos/${user}/${repo}`,
                {},
                20000
            );

            const branch = info.default_branch || "main";

            await Guru.sendMessage(
                from,
                {
                    document: {
                        url: `https://api.github.com/repos/${user}/${repo}/zipball`,
                    },
                    fileName: `${user}-${repo}-${branch}.zip`,
                    mimetype: "application/zip",
                },
                { quoted: mek }
            );

            await react("✅");
        } catch (error) {
            console.error("[GITCLONE]", error.message);
            await react("❌");
            return reply(`GitHub download failed: ${error.message}`);
        }
    }
);

// ======================================================
// FACEBOOK
// ======================================================

gmd(
    {
        pattern: "fb",
        category: "downloader",
        react: "📘",
        aliases: ["fbdl", "facebookdl", "facebook"],
        description: "Download public Facebook videos.",
    },
    async (from, Guru, conText) => {
        const { q, mek, reply, react, botFooter } = conText;
        const { base, key } = getApi(conText);

        if (!q || !/facebook\.com|fb\.watch/i.test(q)) {
            await react("❌");
            return reply("Usage: .fb https://fb.watch/...");
        }

        try {
            await react("⏳");

            let data;

            try {
                data = await getJson(
                    "https://api.nexray.web.id/downloader/facebook",
                    { url: q },
                    25000
                );
            } catch {}

            let url = extractUrl(data?.result);

            if (!url) {
                data = await getJson(
                    `${base}/api/download/facebook`,
                    { apikey: key, url: q },
                    30000
                );
                url = extractUrl(data?.result);
            }

            if (!url) throw new Error("No Facebook video URL was returned.");

            await sendVideo(
                Guru,
                from,
                mek,
                url,
                data?.result?.title || "Facebook Video",
                botFooter
            );

            await react("✅");
        } catch (error) {
            console.error("[FACEBOOK]", error.message);
            await react("❌");
            return reply(`Facebook download failed: ${error.message}`);
        }
    }
);

// ======================================================
// TIKTOK
// ======================================================

gmd(
    {
        pattern: "tiktok",
        category: "downloader",
        react: "🎵",
        aliases: ["tt", "ttdl", "tiktokdl"],
        description: "Download TikTok videos.",
    },
    async (from, Guru, conText) => {
        const { q, mek, reply, react, botFooter } = conText;
        const { base, key } = getApi(conText);

        if (!q || !/tiktok\.com/i.test(q)) {
            await react("❌");
            return reply("Usage: .tiktok https://www.tiktok.com/...");
        }

        try {
            await react("⏳");

            let data;
            let url;

            try {
                data = await getJson(
                    "https://www.tikwm.com/api/",
                    { url: q },
                    25000
                );

                if (data?.code === 0 && data.data) {
                    url = data.data.play || data.data.wmplay;
                }
            } catch {}

            if (!url) {
                for (const endpoint of ["tiktok", "tiktokdlv2", "tiktokdlv3"]) {
                    try {
                        data = await getJson(
                            `${base}/api/download/${endpoint}`,
                            { apikey: key, url: q },
                            25000
                        );

                        url = extractUrl(data?.result);

                        if (url) break;
                    } catch {}
                }
            }

            if (!url) throw new Error("No TikTok video URL was returned.");

            await sendVideo(
                Guru,
                from,
                mek,
                url,
                data?.data?.title || data?.result?.title || "TikTok Video",
                botFooter
            );

            await react("✅");
        } catch (error) {
            console.error("[TIKTOK]", error.message);
            await react("❌");
            return reply(`TikTok download failed: ${error.message}`);
        }
    }
);

// ======================================================
// INSTAGRAM
// ======================================================

gmd(
    {
        pattern: "ig",
        category: "downloader",
        react: "📸",
        aliases: ["insta", "igdl", "instagram"],
        description: "Download public Instagram media.",
    },
    async (from, Guru, conText) => {
        const { q, mek, reply, react, botFooter } = conText;
        const { base, key } = getApi(conText);

        if (!q || !/instagram\.com/i.test(q)) {
            await react("❌");
            return reply("Usage: .ig https://www.instagram.com/reel/...");
        }

        try {
            await react("⏳");

            const data = await getJson(
                `${base}/api/download/instadl`,
                { apikey: key, url: q },
                30000
            );

            const url = extractUrl(data?.result);

            if (!url) throw new Error("No Instagram media URL was returned.");

            await sendVideo(
                Guru,
                from,
                mek,
                url,
                "Instagram Media",
                botFooter
            );

            await react("✅");
        } catch (error) {
            console.error("[INSTAGRAM]", error.message);
            await react("❌");
            return reply(`Instagram download failed: ${error.message}`);
        }
    }
);

// ======================================================
// TWITTER / X
// ======================================================

gmd(
    {
        pattern: "twitter",
        category: "downloader",
        react: "🐦",
        aliases: ["x", "xdl", "twitterdl"],
        description: "Download public Twitter/X videos.",
    },
    async (from, Guru, conText) => {
        const { q, mek, reply, react, botFooter } = conText;
        const { base, key } = getApi(conText);

        if (!q || !/(twitter\.com|x\.com)/i.test(q)) {
            await react("❌");
            return reply("Usage: .twitter https://x.com/user/status/...");
        }

        try {
            await react("⏳");

            const data = await getJson(
                `${base}/api/download/twitter`,
                { apikey: key, url: q },
                30000
            );

            const url = extractUrl(data?.result);

            if (!url) throw new Error("No Twitter video URL was returned.");

            await sendVideo(
                Guru,
                from,
                mek,
                url,
                "Twitter Video",
                botFooter
            );

            await react("✅");
        } catch (error) {
            console.error("[TWITTER]", error.message);
            await react("❌");
            return reply(`Twitter download failed: ${error.message}`);
        }
    }
);

// ======================================================
// SNACK VIDEO
// ======================================================

gmd(
    {
        pattern: "snack",
        category: "downloader",
        react: "🍿",
        aliases: ["snackdl", "snackvideo"],
        description: "Download SnackVideo media.",
    },
    async (from, Guru, conText) => {
        const { q, mek, reply, react, botFooter } = conText;
        const { base, key } = getApi(conText);

        if (!q || !/snackvideo\.com/i.test(q)) {
            await react("❌");
            return reply("Usage: .snack https://www.snackvideo.com/...");
        }

        try {
            await react("⏳");

            const data = await getJson(
                `${base}/api/download/snackdl`,
                { apikey: key, url: q },
                60000
            );

            const result = data?.result;
            const url = extractUrl(result);

            if (!url) throw new Error("No SnackVideo media URL was returned.");

            await sendVideo(
                Guru,
                from,
                mek,
                url,
                result?.title || "Snack Video",
                botFooter
            );

            await react("✅");
        } catch (error) {
            console.error("[SNACK]", error.message);
            await react("❌");
            return reply(`SnackVideo download failed: ${error.message}`);
        }
    }
);
