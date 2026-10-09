"use strict";

// ═══════════════════════════════════════════════════════════════
//                 LUKA-XMD DOWNLOADER 2
//       Spotify • Google Drive • MediaFire • APK • Pastebin
// ═══════════════════════════════════════════════════════════════

const {
    gmd,
    MAX_MEDIA_SIZE,
    getFileSize,
    getMimeCategory,
    getMimeFromUrl,
} = require("../luka");

const axios = require("axios");
const { sendButtons } = require("gifted-btns");

// ─── Helpers ────────────────────────────────────────────────────

function extractButtonId(msg) {
    if (!msg) return null;

    if (msg.templateButtonReplyMessage?.selectedId) {
        return msg.templateButtonReplyMessage.selectedId;
    }

    if (msg.buttonsResponseMessage?.selectedButtonId) {
        return msg.buttonsResponseMessage.selectedButtonId;
    }

    if (msg.listResponseMessage?.singleSelectReply?.selectedRowId) {
        return msg.listResponseMessage.singleSelectReply.selectedRowId;
    }

    if (msg.interactiveResponseMessage) {
        const nf = msg.interactiveResponseMessage.nativeFlowResponseMessage;

        if (nf?.paramsJson) {
            try {
                const params = JSON.parse(nf.paramsJson);
                if (params.id) return params.id;
            } catch {}
        }

        return msg.interactiveResponseMessage.buttonId || null;
    }

    return null;
}

function cleanFileName(name = "LUKA-XMD") {
    return String(name).replace(/[^\w\s.-]/g, "").trim() || "LUKA-XMD";
}

function lukaBox(title, lines, footer = "LUKA-XMD") {
    const body = lines
        .filter(Boolean)
        .map((line) => `│ ${line}`)
        .join("\n");

    return `╭─❏ 「 ${title} 」\n${body}\n╰───────────────────────────\n> _${footer}_`;
}

function getApiSettings(conText) {
    return {
        api: String(conText.GuruTechApi || "").replace(/\/+$/, ""),
        key: conText.GuruApiKey || "",
    };
}

function getQuotedOptions(mek) {
    return mek ? { quoted: mek } : {};
}

async function getApiJson(url, timeout = 30000) {
    const response = await axios.get(url, {
        timeout,
        headers: {
            "User-Agent": "Mozilla/5.0 (compatible; LUKA-XMD/1.0)",
        },
    });

    return response.data;
}

async function sendDownloadedFile({
    Luka,
    from,
    mek,
    buffer,
    fileName,
    mimetype,
    caption,
    category,
    formatAudio,
    formatVideo,
}) {
    if (!Buffer.isBuffer(buffer)) {
        buffer = Buffer.from(buffer);
    }

    const size = buffer.length;
    const sendAsDocument =
        size > MAX_MEDIA_SIZE || category === "document";

    if (category === "audio" && !sendAsDocument) {
        const audio = typeof formatAudio === "function"
            ? await formatAudio(buffer)
            : buffer;

        return Luka.sendMessage(
            from,
            {
                audio,
                mimetype: mimetype || "audio/mpeg",
                fileName: fileName || "LUKA-XMD.mp3",
                ptt: false,
                ...(caption ? { caption } : {}),
            },
            getQuotedOptions(mek)
        );
    }

    if (category === "video" && !sendAsDocument) {
        const video = typeof formatVideo === "function"
            ? await formatVideo(buffer)
            : buffer;

        return Luka.sendMessage(
            from,
            {
                video,
                mimetype: mimetype || "video/mp4",
                fileName: fileName || "LUKA-XMD.mp4",
                ...(caption ? { caption } : {}),
            },
            getQuotedOptions(mek)
        );
    }

    if (category === "image" && !sendAsDocument) {
        return Luka.sendMessage(
            from,
            {
                image: buffer,
                mimetype: mimetype || "image/jpeg",
                ...(caption ? { caption } : {}),
            },
            getQuotedOptions(mek)
        );
    }

    return Luka.sendMessage(
        from,
        {
            document: buffer,
            fileName: fileName || "LUKA-XMD_file",
            mimetype: mimetype || "application/octet-stream",
            ...(caption ? { caption } : {}),
        },
        getQuotedOptions(mek)
    );
}

// ═══════════════════════════════════════════════════════════════
// SPOTIFY DOWNLOADER
// ═══════════════════════════════════════════════════════════════

gmd(
    {
        pattern: "spotify",
        category: "downloader",
        react: "🎧",
        aliases: ["spotifydl", "spotidl", "spoti"],
        description: "Download Spotify tracks by URL or song name",
    },
    async (from, Luka, conText) => {
        const {
            q,
            mek,
            reply,
            react,
            botName,
            botFooter,
            gmdBuffer,
            formatAudio,
        } = conText;

        const { api, key } = getApiSettings(conText);
        const footer = botFooter || "LUKA-XMD";

        if (!q) {
            await react("❌");
            return reply(
                "🎧 *LUKA-XMD SPOTIFY DOWNLOADER*\n\n" +
                "Tuma link ya Spotify au jina la wimbo.\n\n" +
                "*Matumizi:*\n" +
                ".spotify https://open.spotify.com/track/...\n" +
                ".spotify The Spectre Alan Walker"
            );
        }

        if (!api || !key) {
            await react("❌");
            return reply("Spotify API haijawekwa vizuri kwenye settings za bot.");
        }

        if (typeof gmdBuffer !== "function" || typeof formatAudio !== "function") {
            await react("❌");
            return reply("Audio helper haipatikani kwenye LUKA-XMD. Kagua exports za ../luka.");
        }

        async function downloadTrack(trackUrl, quotedMessage) {
            let result = null;

            const endpoints = ["spotifydl", "spotifydlv2"];

            // Jaribu endpoints zote bila kusimamisha bot endpoint moja ikishindwa.
            const attempts = await Promise.allSettled(
                endpoints.map(async (endpoint) => {
                    const url =
                        `${api}/api/download/${endpoint}` +
                        `?apikey=${encodeURIComponent(key)}` +
                        `&url=${encodeURIComponent(trackUrl)}`;

                    const data = await getApiJson(url, 20000);

                    if (data?.success && data?.result?.download_url) {
                        return data.result;
                    }

                    throw new Error(`${endpoint} download URL haijapatikana.`);
                })
            );

            const successful = attempts.find((attempt) => attempt.status === "fulfilled");

            if (successful) {
                result = successful.value;
            }

            // SpotifyDown fallback
            if (!result) {
                try {
                    const trackId = trackUrl.match(/track\/([a-zA-Z0-9]+)/)?.[1];

                    if (trackId) {
                        const response = await axios.get(
                            `https://api.spotifydown.com/download/${trackId}`,
                            {
                                headers: {
                                    origin: "https://spotifydown.com",
                                    referer: "https://spotifydown.com/",
                                    "User-Agent": "Mozilla/5.0",
                                },
                                timeout: 20000,
                            }
                        );

                        if (response.data?.success && response.data?.link) {
                            result = {
                                download_url: response.data.link,
                                title: response.data.metadata?.title || "Spotify Track",
                                thumbnail: response.data.metadata?.cover || null,
                            };
                        }
                    }
                } catch (error) {
                    console.error("LUKA-XMD Spotify fallback:", error.message);
                }
            }

            if (!result?.download_url) {
                await react("❌");
                return reply("Imeshindikana kupata wimbo huu. Jaribu link nyingine.", quotedMessage);
            }

            try {
                const audioBuffer = await gmdBuffer(result.download_url);

                if (!audioBuffer || audioBuffer instanceof Error) {
                    throw new Error("Audio haikupakuliwa.");
                }

                const formattedAudio = await formatAudio(audioBuffer);
                const title = cleanFileName(result.title || "spotify_track");

                await Luka.sendMessage(
                    from,
                    {
                        audio: formattedAudio,
                        mimetype: "audio/mpeg",
                        fileName: `${title}.mp3`,
                        ptt: false,
                    },
                    getQuotedOptions(quotedMessage)
                );

                await react("✅");
            } catch (error) {
                console.error("LUKA-XMD Spotify audio error:", error);
                await react("❌");
                return reply("Imeshindikana kutuma audio. Jaribu tena.", quotedMessage);
            }
        }

        try {
            if (/spotify\.com/i.test(q)) {
                await downloadTrack(q, mek);
                return;
            }

            const searchUrl =
                `${api}/api/search/spotifysearch` +
                `?apikey=${encodeURIComponent(key)}` +
                `&query=${encodeURIComponent(q)}`;

            const data = await getApiJson(searchUrl, 30000);

            if (!data?.success || !data?.results) {
                await react("❌");
                return reply("Spotify search imeshindwa. Jaribu jina jingine au tumia link ya Spotify.");
            }

            const results = data.results;
            let tracks = [];

            if (Array.isArray(results)) {
                tracks = results.slice(0, 3);
            } else if (Array.isArray(results.tracks)) {
                tracks = results.tracks.slice(0, 3);
            } else if (results.url || results.link) {
                tracks = [results];
            }

            if (!tracks.length) {
                await react("❌");
                return reply("Hakuna nyimbo zilizopatikana kwa utafutaji huo.");
            }

            const trackList = tracks.map((track, index) => {
                const title = track.title || track.name || "Unknown Track";
                const artists = Array.isArray(track.artists)
                    ? track.artists.join(", ")
                    : track.artist || "Unknown Artist";

                return `${index + 1}. ${title} — ${artists}`;
            }).join("\n");

            const buttons = tracks.map((track, index) => ({
                id: `lukasp_${index}`,
                text: `${index + 1}. ${(track.title || track.name || "Track").slice(0, 20)}`,
            }));

            const imageUrl =
                tracks[0]?.thumbnail ||
                tracks[0]?.image ||
                tracks[0]?.album?.images?.[0]?.url;

            // Buttons ni optional; bot itume orodha ya nyimbo kama fallback.
            try {
                await sendButtons(Luka, from, {
                    title: `${botName || "LUKA-XMD"} SPOTIFY`,
                    text: `*Matokeo ya utafutaji:*\n\n${trackList}\n\nChagua wimbo unaotaka.`,
                    footer,
                    ...(imageUrl ? { image: { url: imageUrl } } : {}),
                    buttons,
                });
            } catch (buttonError) {
                console.error("Spotify buttons fallback:", buttonError.message);

                await Luka.sendMessage(
                    from,
                    {
                        text:
                            `🎧 *LUKA-XMD SPOTIFY*\n\n${trackList}\n\n` +
                            "Tumia link ya Spotify ya wimbo unaotaka kisha tuma:\n" +
                            ".spotify <Spotify URL>",
                    },
                    getQuotedOptions(mek)
                );
            }

            // Hakuna listener ya kudumu inayowekwa hapa ili kuzuia listeners
            // nyingi kukusanyika. Tumia Spotify URL kwa download ya moja kwa moja.
        } catch (error) {
            console.error("LUKA-XMD Spotify search error:", error);
            await react("❌");
            return reply("Hitilafu imetokea kwenye Spotify. Jaribu tena baadaye.");
        }
    }
);

// ═══════════════════════════════════════════════════════════════
// GOOGLE DRIVE DOWNLOADER
// ═══════════════════════════════════════════════════════════════

gmd(
    {
        pattern: "gdrive",
        category: "downloader",
        react: "📁",
        aliases: ["googledrive", "drive", "gdrivedl"],
        description: "Download files from Google Drive",
    },
    async (from, Luka, conText) => {
        const {
            q,
            mek,
            reply,
            react,
            gmdBuffer,
            formatAudio,
            formatVideo,
        } = conText;

        const { api, key } = getApiSettings(conText);

        if (!q) {
            await react("❌");
            return reply("Tuma link ya Google Drive.\n\nMfano: .gdrive https://drive.google.com/file/d/...");
        }

        if (!/drive\.google\.com/i.test(q)) {
            await react("❌");
            return reply("Link si ya Google Drive.");
        }

        if (!api || !key) {
            await react("❌");
            return reply("Google Drive API haijawekwa vizuri kwenye settings.");
        }

        try {
            const url =
                `${api}/api/download/gdrivedl` +
                `?apikey=${encodeURIComponent(key)}` +
                `&url=${encodeURIComponent(q)}`;

            const data = await getApiJson(url, 60000);

            if (!data?.success || !data?.result?.download_url) {
                await react("❌");
                return reply("Imeshindikana kupata file. Hakikisha link inaruhusu public access.");
            }

            const { name, download_url } = data.result;
            let mimetype = getMimeFromUrl(name || download_url) || "application/octet-stream";

            try {
                const head = await axios.head(download_url, { timeout: 15000 });
                const contentType = head.headers["content-type"];

                if (contentType && !contentType.includes("text/html")) {
                    mimetype = contentType.split(";")[0].trim();
                }
            } catch {}

            const mimeCategory = getMimeCategory(mimetype);
            const fileBuffer = await gmdBuffer(download_url);

            if (!fileBuffer || fileBuffer instanceof Error) {
                throw new Error("Imeshindikana kupakua file.");
            }

            await sendDownloadedFile({
                Luka,
                from,
                mek,
                buffer: fileBuffer,
                fileName: name || "LUKA-XMD_gdrive_file",
                mimetype,
                caption: `📁 *LUKA-XMD GOOGLE DRIVE*\n\n${name || "Google Drive File"}`,
                category: mimeCategory,
                formatAudio,
                formatVideo,
            });

            await react("✅");
        } catch (error) {
            console.error("LUKA-XMD Google Drive error:", error);
            await react("❌");
            return reply(`Google Drive download imeshindwa: ${error.message}`);
        }
    }
);

// ═══════════════════════════════════════════════════════════════
// MEDIAFIRE DOWNLOADER
// ═══════════════════════════════════════════════════════════════

gmd(
    {
        pattern: "mediafire",
        category: "downloader",
        react: "🔥",
        aliases: ["mfire", "mediafiredl", "mfiredl"],
        description: "Download files from MediaFire",
    },
    async (from, Luka, conText) => {
        const {
            q,
            mek,
            reply,
            react,
            gmdBuffer,
            formatAudio,
            formatVideo,
        } = conText;

        const { api, key } = getApiSettings(conText);

        if (!q) {
            await react("❌");
            return reply("Tuma link ya MediaFire.\n\nMfano: .mediafire https://www.mediafire.com/file/...");
        }

        if (!/mediafire\.com/i.test(q)) {
            await react("❌");
            return reply("Link si ya MediaFire.");
        }

        if (!api || !key) {
            await react("❌");
            return reply("MediaFire API haijawekwa vizuri kwenye settings.");
        }

        try {
            const url =
                `${api}/api/download/mediafire` +
                `?apikey=${encodeURIComponent(key)}` +
                `&url=${encodeURIComponent(q)}`;

            const data = await getApiJson(url, 60000);

            if (!data?.success || !data?.result) {
                await react("❌");
                return reply("Imeshindikana kupata file ya MediaFire.");
            }

            const result = data.result;
            const downloadUrl = result.downloadUrl || result.download_url;

            if (!downloadUrl) {
                await react("❌");
                return reply("MediaFire haikurudisha download URL.");
            }

            const fileName = result.fileName || result.filename || "mediafire_file";
            let mimetype = result.mimeType || getMimeFromUrl(fileName) || "application/octet-stream";

            if (mimetype === "application/octet-stream") {
                try {
                    const head = await axios.head(downloadUrl, { timeout: 15000 });
                    const contentType = head.headers["content-type"];

                    if (contentType && !contentType.includes("text/html")) {
                        mimetype = contentType.split(";")[0].trim();
                    }
                } catch {}
            }

            const mimeCategory = getMimeCategory(mimetype);
            const fileBuffer = await gmdBuffer(downloadUrl);

            if (!fileBuffer || fileBuffer instanceof Error) {
                throw new Error("Imeshindikana kupakua file.");
            }

            await sendDownloadedFile({
                Luka,
                from,
                mek,
                buffer: fileBuffer,
                fileName,
                mimetype,
                caption:
                    `🔥 *LUKA-XMD MEDIAFIRE*\n\n` +
                    `*File:* ${fileName}\n` +
                    `*Size:* ${result.fileSize || "Unknown"}`,
                category: mimeCategory,
                formatAudio,
                formatVideo,
            });

            await react("✅");
        } catch (error) {
            console.error("LUKA-XMD MediaFire error:", error);
            await react("❌");
            return reply(`MediaFire download imeshindwa: ${error.message}`);
        }
    }
);

// ═══════════════════════════════════════════════════════════════
// APK DOWNLOADER
// ═══════════════════════════════════════════════════════════════

gmd(
    {
        pattern: "apk",
        category: "downloader",
        react: "📱",
        aliases: ["app", "apkdl", "appdownload"],
        description: "Search and download Android APK files",
    },
    async (from, Luka, conText) => {
        const { q, mek, reply, react, botName } = conText;
        const { api, key } = getApiSettings(conText);

        if (!q) {
            await react("❌");
            return reply("Tuma jina la app.\n\nMfano: .apk WhatsApp");
        }

        if (!api || !key) {
            await react("❌");
            return reply("APK API haijawekwa vizuri kwenye settings.");
        }

        try {
            const url =
                `${api}/api/download/apkdl` +
                `?apikey=${encodeURIComponent(key)}` +
                `&appName=${encodeURIComponent(q)}`;

            const data = await getApiJson(url, 60000);

            if (!data?.success || !data?.result) {
                await react("❌");
                return reply("App haijapatikana. Jaribu jina jingine.");
            }

            const result = data.result;
            const downloadUrl = result.download_url || result.downloadUrl;

            if (!downloadUrl) {
                await react("❌");
                return reply("Download URL ya APK haijapatikana.");
            }

            const appName = result.appname || result.name || q;
            const appIcon = result.appicon || result.icon;
            const developer = result.developer || "Unknown";

            if (appIcon) {
                try {
                    await Luka.sendMessage(
                        from,
                        {
                            image: { url: appIcon },
                            caption:
                                `📱 *${botName || "LUKA-XMD"} APK DOWNLOADER*\n\n` +
                                `*App:* ${appName}\n` +
                                `*Developer:* ${developer}\n\n` +
                                "_Inatuma APK..._",
                        },
                        getQuotedOptions(mek)
                    );
                } catch (error) {
                    console.error("APK icon send error:", error.message);
                }
            }

            await Luka.sendMessage(
                from,
                {
                    document: { url: downloadUrl },
                    fileName: `${cleanFileName(appName)}.apk`,
                    mimetype: "application/vnd.android.package-archive",
                },
                getQuotedOptions(mek)
            );

            await react("✅");
        } catch (error) {
            console.error("LUKA-XMD APK error:", error);
            await react("❌");
            return reply(`APK download imeshindwa: ${error.message}`);
        }
    }
);

// ═══════════════════════════════════════════════════════════════
// PASTEBIN VIEWER
// ═══════════════════════════════════════════════════════════════

gmd(
    {
        pattern: "pastebin",
        category: "downloader",
        react: "📋",
        aliases: ["getpaste", "getpastebin", "pastedl", "pastebindl", "paste"],
        description: "Fetch and read Pastebin content",
    },
    async (from, Luka, conText) => {
        const { q, mek, reply, react, botName } = conText;
        const { api, key } = getApiSettings(conText);

        if (!q) {
            await react("❌");
            return reply("Tuma link ya Pastebin.\n\nMfano: .pastebin https://pastebin.com/xxxxxx");
        }

        if (!/pastebin\.com/i.test(q)) {
            await react("❌");
            return reply("Link si ya Pastebin.");
        }

        if (!api || !key) {
            await react("❌");
            return reply("Pastebin API haijawekwa vizuri kwenye settings.");
        }

        try {
            await reply("📋 *LUKA-XMD PASTEBIN VIEWER*\n\nInatafuta content...");

            const url =
                `${api}/api/download/pastebin` +
                `?apikey=${encodeURIComponent(key)}` +
                `&url=${encodeURIComponent(q)}`;

            const data = await getApiJson(url, 30000);

            if (!data?.success || data?.result == null) {
                await react("❌");
                return reply("Imeshindikana kupata Pastebin content.");
            }

            let content = typeof data.result === "string"
                ? data.result
                : data.result.content || data.result.text || JSON.stringify(data.result, null, 2);

            content = content
                .replace(/\\r\\n/g, "\n")
                .replace(/\\n/g, "\n")
                .replace(/\\t/g, "\t")
                .replace(/\r\n/g, "\n")
                .replace(/\r/g, "\n");

            const pasteId = new URL(q).pathname.split("/").filter(Boolean).pop() || "paste";
            const header =
                `📋 *${botName || "LUKA-XMD"} PASTEBIN VIEWER*\n` +
                `*Paste ID:* ${pasteId}\n` +
                "━━━━━━━━━━━━━━━━━━━━\n\n";

            const message = header + content;

            if (message.length > 60000) {
                await Luka.sendMessage(
                    from,
                    {
                        document: Buffer.from(content, "utf8"),
                        fileName: `LUKA-XMD_pastebin_${cleanFileName(pasteId)}.txt`,
                        mimetype: "text/plain",
                        caption: `📋 Pastebin content — ${pasteId}`,
                    },
                    getQuotedOptions(mek)
                );
            } else {
                await Luka.sendMessage(
                    from,
                    { text: message },
                    getQuotedOptions(mek)
                );
            }

            await react("✅");
        } catch (error) {
            console.error("LUKA-XMD Pastebin error:", error);
            await react("❌");
            return reply(`Pastebin imeshindwa: ${error.message}`);
        }
    }
);

// ═══════════════════════════════════════════════════════════════
// END OF LUKA-XMD DOWNLOADER 2
// ═══════════════════════════════════════════════════════════════
