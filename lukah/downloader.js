"use strict";

const {
    gmd,
    gitRepoRegex,
    MAX_MEDIA_SIZE,
    getFileSize,
    getMimeCategory,
    getMimeFromUrl,
} = require("../luka");

const GIFTED_DLS = require("gifted-dls");
const lukaDls = new GIFTED_DLS();
const axios = require("axios");
const { sendButtons } = require("gifted-btns");

// ─── LUKA-XMD Helpers ──────────────────────────────────────────────

function extractButtonId(msg) {
    if (!msg) return null;

    if (msg.templateButtonReplyMessage?.selectedId)
        return msg.templateButtonReplyMessage.selectedId;

    if (msg.buttonsResponseMessage?.selectedButtonId)
        return msg.buttonsResponseMessage.selectedButtonId;

    if (msg.listResponseMessage?.singleSelectReply?.selectedRowId)
        return msg.listResponseMessage.singleSelectReply.selectedRowId;

    if (msg.interactiveResponseMessage) {
        const nf = msg.interactiveResponseMessage.nativeFlowResponseMessage;

        if (nf?.paramsJson) {
            try {
                const p = JSON.parse(nf.paramsJson);
                if (p.id) return p.id;
            } catch {}
        }

        return msg.interactiveResponseMessage.buttonId || null;
    }

    return null;
}

function toxicBox(title, lines, footer = "LUKA-XMD") {
    const content = lines
        .filter(Boolean)
        .map((line) => `│ ${line}`)
        .join("\n");

    return `╭─❏ 「 ${title} 」\n${content}\n╰───────────────────────────\n> _${footer}_`;
}

function cleanFileName(name = "LUKA-XMD") {
    return name.replace(/[^\w\s.-]/g, "").trim() || "LUKA-XMD";
}

// ─── GitHub Repository Downloader ──────────────────────────────────

gmd(
    {
        pattern: "gitclone",
        category: "downloader",
        react: "📦",
        aliases: ["gitdl", "github", "git", "repodl", "clone"],
        description: "Download GitHub repository as a ZIP file",
    },
    async (from, Luka, conText) => {
        const { q, mek, reply, react, botName, newsletterJid } = conText;

        if (!q) {
            await react("❌");
            return reply(
                `Please provide a GitHub repository link.\n\n*Usage:* .gitclone https://github.com/user/repo`
            );
        }

        if (!gitRepoRegex.test(q)) {
            await react("❌");
            return reply(
                "Invalid GitHub link format. Please provide a valid GitHub repository URL."
            );
        }

        try {
            const match = q.match(gitRepoRegex);

            if (!match || !match[1] || !match[2]) {
                await react("❌");
                return reply("Unable to identify the GitHub username and repository.");
            }

            const user = match[1];
            const repo = match[2].replace(/\.git$/, "").split("/")[0];

            const apiUrl = `https://api.github.com/repos/${user}/${repo}`;
            const zipUrl = `https://api.github.com/repos/${user}/${repo}/zipball`;

            await reply(`LUKA-XMD is fetching repository *${user}/${repo}*...`);

            const repoResponse = await axios.get(apiUrl, {
                timeout: 20000,
                headers: {
                    "User-Agent": "LUKA-XMD",
                    Accept: "application/vnd.github+json",
                },
            });

            if (!repoResponse.data) {
                await react("❌");
                return reply("Repository not found or access denied. Make sure it is public.");
            }

            const repoData = repoResponse.data;
            const defaultBranch = repoData.default_branch || "main";
            const filename = `${user}-${repo}-${defaultBranch}.zip`;

            await Luka.sendMessage(
                from,
                {
                    document: { url: zipUrl },
                    fileName: filename,
                    mimetype: "application/zip",
                    contextInfo: {
                        forwardingScore: 1,
                        isForwarded: true,
                        ...(newsletterJid
                            ? {
                                  forwardedNewsletterMessageInfo: {
                                      newsletterJid,
                                      newsletterName: botName || "LUKA-XMD",
                                      serverMessageId: 143,
                                  },
                              }
                            : {}),
                    },
                },
                { quoted: mek }
            );

            await react("✅");
        } catch (error) {
            console.error("LUKA-XMD GitClone error:", error);
            await react("❌");

            if (error.response?.status === 404) {
                return reply("Repository not found. Check the GitHub URL.");
            }

            if (error.response?.status === 403) {
                return reply("GitHub API rate limit exceeded. Please try again later.");
            }

            return reply(`Failed to download repository: ${error.message}`);
        }
    }
);

// ─── Facebook Downloader ───────────────────────────────────────────

gmd(
    {
        pattern: "fb",
        category: "downloader",
        react: "📘",
        aliases: ["fbdl", "facebookdl", "facebook"],
        description: "Download Facebook videos. Usage: .fb <Facebook URL>",
    },
    async (from, Luka, conText) => {
        const {
            q,
            mek,
            reply,
            react,
            botFooter,
            GuruTechApi,
            GuruApiKey,
        } = conText;

        const footer = botFooter || "LUKA-XMD";

        if (!q) {
            await react("❌");
            return reply(
                toxicBox(
                    "LUKA-XMD FACEBOOK DOWNLOADER",
                    [
                        "⚠️ Send a Facebook video URL.",
                        "Example: .fb https://fb.watch/xxx",
                    ],
                    footer
                )
            );
        }

        if (!q.includes("facebook.com") && !q.includes("fb.watch")) {
            await react("❌");
            return reply(
                toxicBox("FACEBOOK DOWNLOADER", ["❌ Invalid Facebook URL."], footer)
            );
        }

        await react("⌛");
        await reply(
            toxicBox("FACEBOOK DOWNLOADER", ["⬇️ Fetching video..."], footer)
        );

        try {
            let videoUrl = null;
            let title = "Facebook Video";

            // Primary API
            try {
                const response = await axios.get(
                    `https://api.nexray.web.id/downloader/facebook?url=${encodeURIComponent(q)}`,
                    {
                        headers: { "User-Agent": "Mozilla/5.0" },
                        timeout: 20000,
                    }
                );

                const data = response.data?.result;

                if (data?.url) {
                    videoUrl = data.url;
                    title = data.title || title;
                }
            } catch {}

            // Fallback API
            if (!videoUrl && GuruTechApi && GuruApiKey) {
                try {
                    const response = await axios.get(
                        `${GuruTechApi}/api/download/facebook?apikey=${GuruApiKey}&url=${encodeURIComponent(q)}`,
                        { timeout: 15000 }
                    );

                    const data = response.data?.result;

                    if (data?.hd_video || data?.sd_video) {
                        videoUrl = data.hd_video || data.sd_video;
                        title = data.title || title;
                    }
                } catch {}
            }

            if (!videoUrl) {
                await react("❌");
                return reply(
                    toxicBox(
                        "FACEBOOK DOWNLOADER",
                        [
                            "❌ Failed to download.",
                            "Make sure the video is public and try again.",
                        ],
                        footer
                    )
                );
            }

            const fileSize = await getFileSize(videoUrl).catch(() => 0);
            const caption = toxicBox(
                "LUKA-XMD FACEBOOK DOWNLOADER",
                [`🎬 ${title}`],
                footer
            );

            if (fileSize > MAX_MEDIA_SIZE) {
                await Luka.sendMessage(
                    from,
                    {
                        document: { url: videoUrl },
                        fileName: `${cleanFileName(title)}.mp4`,
                        mimetype: "video/mp4",
                        caption,
                    },
                    { quoted: mek }
                );
            } else {
                await Luka.sendMessage(
                    from,
                    {
                        video: { url: videoUrl },
                        mimetype: "video/mp4",
                        caption,
                    },
                    { quoted: mek }
                );
            }

            await react("✅");
        } catch (error) {
            console.error("LUKA-XMD Facebook error:", error);
            await react("❌");

            return reply(
                toxicBox(
                    "FACEBOOK DOWNLOADER",
                    [`❌ Error: ${error.message}`],
                    footer
                )
            );
        }
    }
);

// ─── TikTok Downloader ─────────────────────────────────────────────

gmd(
    {
        pattern: "tiktok",
        category: "downloader",
        react: "🎵",
        aliases: ["tiktokdl", "ttdl", "tt"],
        description: "Download TikTok videos and audio. Usage: .tiktok <TikTok URL>",
    },
    async (from, Luka, conText) => {
        const {
            q,
            mek,
            reply,
            react,
            botFooter,
            GuruTechApi,
            GuruApiKey,
        } = conText;

        const footer = botFooter || "LUKA-XMD";

        if (!q) {
            await react("❌");
            return reply(
                toxicBox(
                    "TIKTOK DOWNLOADER",
                    [
                        "⚠️ Send a TikTok URL.",
                        "Example: .tiktok https://vm.tiktok.com/xxx",
                    ],
                    footer
                )
            );
        }

        if (!q.includes("tiktok.com")) {
            await react("❌");
            return reply(
                toxicBox("TIKTOK DOWNLOADER", ["❌ Invalid TikTok URL."], footer)
            );
        }

        await react("⌛");
        await reply(
            toxicBox("TIKTOK DOWNLOADER", ["⬇️ Fetching TikTok..."], footer)
        );

        try {
            let result = null;

            // Primary API
            try {
                const response = await axios.get(
                    `https://api.nexray.web.id/downloader/tiktok?url=${encodeURIComponent(q)}`,
                    {
                        headers: { "User-Agent": "Mozilla/5.0" },
                        timeout: 20000,
                    }
                );

                const data = response.data?.result;

                if (data?.video) {
                    result = {
                        video: data.video,
                        music: data.music,
                        title: data.title || "TikTok Video",
                        author: data.author?.nickname || "Unknown",
                    };
                }
            } catch {}

            // TikWM fallback
            if (!result) {
                try {
                    const response = await axios.get(
                        `https://www.tikwm.com/api/?url=${encodeURIComponent(q)}`,
                        { timeout: 15000 }
                    );

                    if (response.data?.code === 0 && response.data?.data) {
                        const data = response.data.data;

                        result = {
                            video: data.play || data.wmplay,
                            music: data.music,
                            title: data.title || "TikTok Video",
                            author: data.author?.nickname || "Unknown",
                        };
                    }
                } catch {}
            }

            // LUKA-XMD configured API fallback
            if (!result && GuruTechApi && GuruApiKey) {
                for (const endpoint of ["tiktok", "tiktokdlv2", "tiktokdlv3"]) {
                    try {
                        const response = await axios.get(
                            `${GuruTechApi}/api/download/${endpoint}?apikey=${GuruApiKey}&url=${encodeURIComponent(q)}`,
                            { timeout: 15000 }
                        );

                        if (response.data?.success && response.data?.result) {
                            result = response.data.result;
                            break;
                        }
                    } catch {}
                }
            }

            if (!result?.video) {
                await react("❌");
                return reply(
                    toxicBox(
                        "TIKTOK DOWNLOADER",
                        ["❌ Failed to download. Please try again."],
                        footer
                    )
                );
            }

            const title = result.title || "TikTok Video";
            const author = result.author || "Unknown";
            const video = result.video;
            const music = result.music;

            const fileSize = await getFileSize(video).catch(() => 0);

            if (fileSize > MAX_MEDIA_SIZE) {
                await Luka.sendMessage(
                    from,
                    {
                        document: { url: video },
                        fileName: `${cleanFileName(title)}.mp4`,
                        mimetype: "video/mp4",
                        caption: toxicBox(
                            "LUKA-XMD TIKTOK DOWNLOADER",
                            [`🎵 ${title}`, `👤 ${author}`],
                            footer
                        ),
                    },
                    { quoted: mek }
                );
            } else {
                await Luka.sendMessage(
                    from,
                    {
                        video: { url: video },
                        mimetype: "video/mp4",
                        caption: toxicBox(
                            "LUKA-XMD TIKTOK DOWNLOADER",
                            [`🎵 ${title}`, `👤 ${author}`],
                            footer
                        ),
                    },
                    { quoted: mek }
                );
            }

            // Send audio if available
            if (music) {
                try {
                    await Luka.sendMessage(
                        from,
                        {
                            audio: { url: music },
                            mimetype: "audio/mpeg",
                            ptt: false,
                            fileName: `${cleanFileName(title)}_music.mp3`,
                        },
                        { quoted: mek }
                    );
                } catch (error) {
                    console.error("TikTok audio error:", error.message);
                }
            }

            await react("✅");
        } catch (error) {
            console.error("LUKA-XMD TikTok error:", error);
            await react("❌");

            return reply(
                toxicBox(
                    "TIKTOK DOWNLOADER",
                    [`❌ Error: ${error.message}`],
                    footer
                )
            );
        }
    }
);

// ─── Twitter / X Downloader ────────────────────────────────────────

gmd(
    {
        pattern: "twitter",
        category: "downloader",
        react: "🐦",
        aliases: ["twitterdl", "xdl", "xdownloader", "twitterdownloader", "x"],
        description: "Download Twitter/X videos. Usage: .twitter <tweet URL>",
    },
    async (from, Luka, conText) => {
        const {
            q,
            mek,
            reply,
            react,
            botFooter,
            GuruTechApi,
            GuruApiKey,
        } = conText;

        const footer = botFooter || "LUKA-XMD";

        if (!q) {
            await react("❌");
            return reply(
                toxicBox(
                    "TWITTER/X DOWNLOADER",
                    [
                        "⚠️ Send a Twitter/X URL.",
                        "Example: .twitter https://x.com/user/status/xxx",
                    ],
                    footer
                )
            );
        }

        if (!q.includes("twitter.com") && !q.includes("x.com")) {
            await react("❌");
            return reply(
                toxicBox("TWITTER/X DOWNLOADER", ["❌ Invalid Twitter/X URL."], footer)
            );
        }

        await react("⌛");
        await reply(
            toxicBox("TWITTER/X DOWNLOADER", ["⬇️ Fetching tweet video..."], footer)
        );

        try {
            let videoUrl = null;

            // Primary API
            try {
                const response = await axios.get(
                    `https://api.nexray.web.id/downloader/twitter?url=${encodeURIComponent(q)}`,
                    {
                        headers: { "User-Agent": "Mozilla/5.0" },
                        timeout: 20000,
                    }
                );

                const data = response.data?.result;
                const urls =
                    data?.videoUrls ||
                    data?.urls ||
                    (data?.url ? [{ url: data.url }] : null);

                if (urls?.length) {
                    videoUrl = typeof urls[0] === "string" ? urls[0] : urls[0].url;
                }
            } catch {}

            // Fallback API
            if (!videoUrl && GuruTechApi && GuruApiKey) {
                try {
                    const response = await axios.get(
                        `${GuruTechApi}/api/download/twitter?apikey=${GuruApiKey}&url=${encodeURIComponent(q)}`,
                        { timeout: 15000 }
                    );

                    const data = response.data?.result;

                    if (data?.videoUrls?.length) {
                        const first = data.videoUrls[0];
                        videoUrl = typeof first === "string" ? first : first.url;
                    }
                } catch {}
            }

            if (!videoUrl) {
                await react("❌");
                return reply(
                    toxicBox(
                        "TWITTER/X DOWNLOADER",
                        [
                            "❌ No video found.",
                            "Make sure the tweet contains a public video.",
                        ],
                        footer
                    )
                );
            }

            const fileSize = await getFileSize(videoUrl).catch(() => 0);

            const caption = toxicBox(
                "LUKA-XMD TWITTER/X DOWNLOADER",
                ["🐦 Here's your video!"],
                footer
            );

            if (fileSize > MAX_MEDIA_SIZE) {
                await Luka.sendMessage(
                    from,
                    {
                        document: { url: videoUrl },
                        fileName: "LUKA-XMD_twitter_video.mp4",
                        mimetype: "video/mp4",
                        caption,
                    },
                    { quoted: mek }
                );
            } else {
                await Luka.sendMessage(
                    from,
                    {
                        video: { url: videoUrl },
                        mimetype: "video/mp4",
                        caption,
                    },
                    { quoted: mek }
                );
            }

            await react("✅");
        } catch (error) {
            console.error("LUKA-XMD Twitter error:", error);
            await react("❌");

            return reply(
                toxicBox(
                    "TWITTER/X DOWNLOADER",
                    [`❌ Error: ${error.message}`],
                    footer
                )
            );
        }
    }
);

// ─── Instagram Downloader ──────────────────────────────────────────

gmd(
    {
        pattern: "ig",
        category: "downloader",
        react: "📸",
        aliases: ["insta", "instadl", "igdl", "instagram"],
        description: "Download Instagram reels, videos and images. Usage: .ig <Instagram URL>",
    },
    async (from, Luka, conText) => {
        const {
            q,
            mek,
            reply,
            react,
            botFooter,
            GuruTechApi,
            GuruApiKey,
        } = conText;

        const footer = botFooter || "LUKA-XMD";

        if (!q) {
            await react("❌");
            return reply(
                toxicBox(
                    "INSTAGRAM DOWNLOADER",
                    [
                        "⚠️ Send an Instagram URL.",
                        "Example: .ig https://www.instagram.com/reel/xxx",
                    ],
                    footer
                )
            );
        }

        if (!q.includes("instagram.com")) {
            await react("❌");
            return reply(
                toxicBox("INSTAGRAM DOWNLOADER", ["❌ Invalid Instagram URL."], footer)
            );
        }

        await react("⌛");
        await reply(
            toxicBox("INSTAGRAM DOWNLOADER", ["⬇️ Fetching Instagram..."], footer)
        );

        try {
            let mediaUrl = null;
            let isVideo = true;
            let captionText = "";

            // Primary API
            try {
                const response = await axios.get(
                    `https://api.nexray.web.id/downloader/v2/instagram?url=${encodeURIComponent(q)}`,
                    {
                        headers: { "User-Agent": "Mozilla/5.0" },
                        timeout: 20000,
                    }
                );

                const data = response.data?.result;

                if (Array.isArray(data) && data.length) {
                    const item = data[0];

                    mediaUrl = item?.url || item?.video || item?.image;
                    isVideo = !!(item?.video || item?.type === "video");
                } else if (data?.url) {
                    mediaUrl = data.url;
                    isVideo = data.type === "video";
                    captionText = data.caption || "";
                }
            } catch {}

            // API fallback
            if (!mediaUrl) {
                try {
                    const response = await axios.get(
                        `https://api.nexray.web.id/downloader/instagram?url=${encodeURIComponent(q)}`,
                        {
                            headers: { "User-Agent": "Mozilla/5.0" },
                            timeout: 20000,
                        }
                    );

                    const data = response.data?.result;

                    if (data?.url) {
                        mediaUrl = data.url;
                        isVideo = data.type !== "image";
                        captionText = data.caption || "";
                    }
                } catch {}
            }

            // Configured API fallback
            if (!mediaUrl && GuruTechApi && GuruApiKey) {
                try {
                    const response = await axios.get(
                        `${GuruTechApi}/api/download/instadl?apikey=${GuruApiKey}&url=${encodeURIComponent(q)}`,
                        { timeout: 15000 }
                    );

                    const data = response.data?.result;

                    if (data?.download_url) {
                        mediaUrl = data.download_url;
                        isVideo = true;
                    }
                } catch {}
            }

            if (!mediaUrl) {
                await react("❌");
                return reply(
                    toxicBox(
                        "INSTAGRAM DOWNLOADER",
                        [
                            "❌ Failed to download.",
                            "Make sure the post is public and try again.",
                        ],
                        footer
                    )
                );
            }

            const caption = toxicBox(
                "LUKA-XMD INSTAGRAM DOWNLOADER",
                [
                    captionText
                        ? `📝 ${captionText.substring(0, 80)}${captionText.length > 80 ? "..." : ""}`
                        : "📸 Instagram Media",
                ],
                footer
            );

            const fileSize = await getFileSize(mediaUrl).catch(() => 0);

            if (isVideo) {
                if (fileSize > MAX_MEDIA_SIZE) {
                    await Luka.sendMessage(
                        from,
                        {
                            document: { url: mediaUrl },
                            fileName: "LUKA-XMD_instagram_video.mp4",
                            mimetype: "video/mp4",
                            caption,
                        },
                        { quoted: mek }
                    );
                } else {
                    await Luka.sendMessage(
                        from,
                        {
                            video: { url: mediaUrl },
                            mimetype: "video/mp4",
                            caption,
                        },
                        { quoted: mek }
                    );
                }
            } else {
                await Luka.sendMessage(
                    from,
                    {
                        image: { url: mediaUrl },
                        caption,
                    },
                    { quoted: mek }
                );
            }

            await react("✅");
        } catch (error) {
            console.error("LUKA-XMD Instagram error:", error);
            await react("❌");

            return reply(
                toxicBox(
                    "INSTAGRAM DOWNLOADER",
                    [`❌ Error: ${error.message}`],
                    footer
                )
            );
        }
    }
);

// ─── Snack Video Downloader ────────────────────────────────────────

gmd(
    {
        pattern: "snack",
        category: "downloader",
        react: "🍿",
        aliases: ["snackdl", "snackvideo"],
        description: "Download Snack Video. Usage: .snack <Snack Video URL>",
    },
    async (from, Luka, conText) => {
        const {
            q,
            mek,
            reply,
            react,
            botFooter,
            GuruTechApi,
            GuruApiKey,
        } = conText;

        const footer = botFooter || "LUKA-XMD";

        if (!q) {
            await react("❌");
            return reply(
                toxicBox(
                    "SNACK VIDEO",
                    [
                        "⚠️ Send a Snack Video URL.",
                        "Example: .snack https://snackvideo.com/video/xxx",
                    ],
                    footer
                )
            );
        }

        if (!q.includes("snackvideo.com")) {
            await react("❌");
            return reply(
                toxicBox("SNACK VIDEO", ["❌ Invalid Snack Video URL."], footer)
            );
        }

        if (!GuruTechApi || !GuruApiKey) {
            await react("❌");
            return reply(
                toxicBox(
                    "SNACK VIDEO",
                    ["❌ Snack Video API is not configured in LUKA-XMD."],
                    footer
                )
            );
        }

        await react("⌛");
        await reply(
            toxicBox("SNACK VIDEO", ["⬇️ Downloading Snack Video..."], footer)
        );

        try {
            const response = await axios.get(
                `${GuruTechApi}/api/download/snackdl?apikey=${GuruApiKey}&url=${encodeURIComponent(q)}`,
                { timeout: 60000 }
            );

            if (!response.data?.success || !response.data?.result?.media) {
                await react("❌");
                return reply(
                    toxicBox(
                        "SNACK VIDEO",
                        ["❌ Failed to fetch. Check the URL and try again."],
                        footer
                    )
                );
            }

            const { title, media, author, like } = response.data.result;
            const fileSize = await getFileSize(media).catch(() => 0);

            const caption = toxicBox(
                "LUKA-XMD SNACK VIDEO",
                [
                    `🎬 ${title || "Snack Video"}`,
                    `👤 ${author || "Unknown"}`,
                    like ? `❤️ ${like} likes` : null,
                ],
                footer
            );

            if (fileSize > MAX_MEDIA_SIZE) {
                await Luka.sendMessage(
                    from,
                    {
                        document: { url: media },
                        fileName: `${cleanFileName(title || "snack_video")}.mp4`,
                        mimetype: "video/mp4",
                        caption,
                    },
                    { quoted: mek }
                );
            } else {
                await Luka.sendMessage(
                    from,
                    {
                        video: { url: media },
                        mimetype: "video/mp4",
                        caption,
                    },
                    { quoted: mek }
                );
            }

            await react("✅");
        } catch (error) {
            console.error("LUKA-XMD Snack Video error:", error);
            await react("❌");

            return reply(
                toxicBox(
                    "SNACK VIDEO",
                    [`❌ Error: ${error.message}`],
                    footer
                )
            );
        }
    }
);
