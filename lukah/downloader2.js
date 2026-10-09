 "use strict";

const axios = require("axios");
const { gmd } = require("../luka");

// ═══════════════════════════════════════════════════════════════
//                       LUKA-XMD DOWNLOADER 2
// ═══════════════════════════════════════════════════════════════

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const TIMEOUT = 120000;

function cleanFileName(name) {
    return String(name || "LUKA-XMD-Download")
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
        .replace(/\s+/g, "_")
        .slice(0, 100);
}

function getApiBase(api) {
    return String(api || "").replace(/\/+$/, "");
}

function getResult(data) {
    if (!data) return null;
    if (data.result) return data.result;
    if (data.data) return data.data;
    return data;
}

function getDownloadUrl(result) {
    if (typeof result === "string") {
        return result.startsWith("http") ? result : "";
    }

    return (
        result?.download_url ||
        result?.downloadUrl ||
        result?.url ||
        result?.link ||
        result?.download ||
        ""
    );
}

async function getJson(url, params = {}) {
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

async function downloadFile(url) {
    let parsed;

    try {
        parsed = new URL(url);
    } catch {
        throw new Error("API imerudisha download link isiyo sahihi.");
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Download link haikubaliki.");
    }

    const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: TIMEOUT,
        maxContentLength: MAX_FILE_SIZE,
        maxBodyLength: MAX_FILE_SIZE,
        headers: {
            "User-Agent": "Mozilla/5.0",
            Accept: "*/*",
        },
    });

    const buffer = Buffer.from(response.data);

    if (!buffer.length) {
        throw new Error("Faili lililopakuliwa halina data.");
    }

    if (buffer.length > MAX_FILE_SIZE) {
        throw new Error("Faili limezidi ukubwa unaoruhusiwa.");
    }

    const contentType = String(
        response.headers["content-type"] || ""
    ).toLowerCase();

    if (
        contentType.includes("text/html") ||
        contentType.includes("application/json")
    ) {
        throw new Error(
            "Link imerudisha webpage badala ya faili."
        );
    }

    return {
        buffer,
        contentType,
    };
}

async function sendDownload({
    from,
    Guru,
    mek,
    reply,
    react,
    url,
    title,
    fileName,
    mimetype,
    caption,
}) {
    if (!url) {
        await react("❌");
        return reply(
            "Download link haikupatikana. Jaribu tena baadaye."
        );
    }

    await react("⬇️");

    const { buffer, contentType } = await downloadFile(url);

    let finalMime =
        mimetype ||
        contentType ||
        "application/octet-stream";

    if (finalMime.includes(";")) {
        finalMime = finalMime.split(";")[0].trim();
    }

    await Guru.sendMessage(
        from,
        {
            document: buffer,
            fileName: cleanFileName(fileName || title),
            mimetype: finalMime,
            caption:
                caption ||
                `*LUKA-XMD DOWNLOADER*\n\n` +
                `*File:* ${title || "Download"}\n` +
                `*Size:* ${(buffer.length / 1048576).toFixed(2)} MB`,
        },
        { quoted: mek }
    );

    await react("✅");
}

async function runApiDownloader({
    from,
    Guru,
    conText,
    endpoint,
    queryName,
    filePrefix,
}) {
    const {
        q,
        mek,
        reply,
        react,
        botName,
        GuruTechApi,
        GuruApiKey,
    } = conText;

    if (!q || !q.trim()) {
        await react("❌");
        return reply(
            `Tumia command na jina au link.\n\nMfano: .${filePrefix} jina au link`
        );
    }

    if (!GuruTechApi || !GuruApiKey) {
        await react("❌");
        return reply(
            "API haijawekwa sawa. Hakikisha GuruTechApi na GuruApiKey zipo kwenye settings."
        );
    }

    try {
        await react("🔎");

        const base = getApiBase(GuruTechApi);
        const data = await getJson(
            `${base}${endpoint}`,
            {
                apikey: GuruApiKey,
                [queryName]: q.trim(),
            }
        );

        console.log(
            `[LUKA-XMD ${filePrefix.toUpperCase()} API]`,
            JSON.stringify(data).slice(0, 1500)
        );

        if (data?.success === false) {
            await react("❌");
            return reply(
                data.message ||
                "API imeshindwa kupata matokeo. Jaribu jina au link nyingine."
            );
        }

        const result = getResult(data);
        const url = getDownloadUrl(result);

        if (!url) {
            await react("❌");
            return reply(
                "API haikurudisha download link.\n\n" +
                "Angalia terminal kupata response ya API."
            );
        }

        const title =
            result?.title ||
            result?.name ||
            result?.filename ||
            q.trim();

        const fileName =
            result?.filename ||
            result?.fileName ||
            `${cleanFileName(title)}.bin`;

        await sendDownload({
            from,
            Guru,
            mek,
            reply,
            react,
            url,
            title,
            fileName,
            mimetype: result?.mimetype || result?.mimeType,
            caption:
                `*${botName || "LUKA-XMD"} DOWNLOADER*\n\n` +
                `*Title:* ${title}\n\n` +
                "_Powered by LUKA-XMD_",
        });
    } catch (error) {
        console.error(
            `[LUKA-XMD ${filePrefix.toUpperCase()} ERROR]`,
            error.response?.data || error.message
        );

        await react("❌");

        return reply(
            "DOWNLOAD IMESHINDWA\n\n" +
            (error.code === "ECONNABORTED"
                ? "Ombi limechukua muda mrefu. Jaribu tena."
                : error.response?.status === 401 ||
                  error.response?.status === 403
                ? "API key imekataliwa. Kagua settings."
                : "Kuna tatizo kwenye API au download link. Kagua terminal.")
        );
    }
}

// ─── APK DOWNLOADER ───────────────────────────────────────────

gmd(
    {
        pattern: "apk",
        aliases: ["apkdl", "app", "appdownload"],
        category: "downloader",
        react: "📱",
        description: "Download Android APK applications",
    },
    async (from, Guru, conText) => {
        const {
            q,
            mek,
            reply,
            react,
            GuruTechApi,
            GuruApiKey,
            botName,
        } = conText;

        if (!q || !q.trim()) {
            await react("❌");
            return reply("Mfano: .apk WhatsApp");
        }

        if (!GuruTechApi || !GuruApiKey) {
            await react("❌");
            return reply("APK API haijawekwa kwenye settings.");
        }

        try {
            await react("🔎");

            const data = await getJson(
                `${getApiBase(GuruTechApi)}/api/download/apkdl`,
                {
                    apikey: GuruApiKey,
                    appName: q.trim(),
                }
            );

            console.log(
                "[LUKA-XMD APK API]",
                JSON.stringify(data).slice(0, 1500)
            );

            if (!data?.success || !data?.result) {
                await react("❌");
                return reply("App haijapatikana. Jaribu jina lingine.");
            }

            const result = data.result;
            const url = getDownloadUrl(result);

            if (!url) {
                await react("❌");
                return reply("APK link haikupatikana kwenye API response.");
            }

            const appName =
                result.appname ||
                result.appName ||
                result.name ||
                q.trim();

            const { buffer } = await downloadFile(url);

            // APK files are ZIP archives and commonly begin with PK.
            if (
                buffer.length < 4 ||
                buffer[0] !== 0x50 ||
                buffer[1] !== 0x4B
            ) {
                throw new Error(
                    "Download link haikurudisha APK/ZIP halali."
                );
            }

            await Guru.sendMessage(
                from,
                {
                    document: buffer,
                    fileName: `${cleanFileName(appName)}.apk`,
                    mimetype:
                        "application/vnd.android.package-archive",
                    caption:
                        `*${botName || "LUKA-XMD"} APK DOWNLOADER*\n\n` +
                        `*App:* ${appName}\n` +
                        `*Developer:* ${result.developer || "Unknown"}\n` +
                        `*Size:* ${(buffer.length / 1048576).toFixed(2)} MB`,
                },
                { quoted: mek }
            );

            await react("✅");
        } catch (error) {
            console.error(
                "[LUKA-XMD APK ERROR]",
                error.response?.data || error.message
            );

            await react("❌");
            return reply(
                "APK download imeshindwa. Kagua terminal kuona error halisi."
            );
        }
    }
);

// ─── SPOTIFY DOWNLOADER ───────────────────────────────────────

gmd(
    {
        pattern: "spotify",
        aliases: ["spdl", "song"],
        category: "downloader",
        react: "🎵",
        description: "Download Spotify tracks",
    },
    async (from, Guru, conText) => {
        return runApiDownloader({
            from,
            Guru,
            conText,
            endpoint: "/api/download/spotify",
            queryName: "url",
            filePrefix: "spotify",
        });
    }
);

// ─── GOOGLE DRIVE DOWNLOADER ─────────────────────────────────

gmd(
    {
        pattern: "gdrive",
        aliases: ["drive", "gdrivedl"],
        category: "downloader",
        react: "📂",
        description: "Download Google Drive files",
    },
    async (from, Guru, conText) => {
        const {
            q,
            mek,
            reply,
            react,
        } = conText;

        if (!q || !q.trim()) {
            await react("❌");
            return reply("Mfano: .gdrive Google Drive file link");
        }

        try {
            const parsed = new URL(q.trim());

            if (
                parsed.hostname !== "drive.google.com" &&
                parsed.hostname !== "docs.google.com"
            ) {
                await react("❌");
                return reply("Tuma link halali ya Google Drive.");
            }

            await sendDownload({
                from,
                Guru,
                mek,
                reply,
                react,
                url: q.trim(),
                title: "Google Drive File",
                fileName: "LUKA-XMD-Drive-Download.bin",
            });
        } catch (error) {
            console.error("[LUKA-XMD GDRIVE ERROR]", error.message);
            await react("❌");
            return reply(
                "Google Drive download imeshindwa. Hakikisha faili lina ruhusa ya kupakuliwa."
            );
        }
    }
);

// ─── MEDIAFIRE DOWNLOADER ────────────────────────────────────

gmd(
    {
        pattern: "mediafire",
        aliases: ["mfire", "mf"],
        category: "downloader",
        react: "📥",
        description: "Download MediaFire files",
    },
    async (from, Guru, conText) => {
        return runApiDownloader({
            from,
            Guru,
            conText,
            endpoint: "/api/download/mediafire",
            queryName: "url",
            filePrefix: "mediafire",
        });
    }
);

// ─── GENERIC MEDIA DOWNLOADER ─────────────────────────────────

gmd(
    {
        pattern: "download",
        aliases: ["dl"],
        category: "downloader",
        react: "📥",
        description: "Download media using the configured API",
    },
    async (from, Guru, conText) => {
        return runApiDownloader({
            from,
            Guru,
            conText,
            endpoint: "/api/download",
            queryName: "url",
            filePrefix: "download",
        });
    }
);

// ─── PASTE TEXT DOWNLOADER ────────────────────────────────────

gmd(
    {
        pattern: "pastebin",
        aliases: ["paste", "pbin"],
        category: "downloader",
        react: "📝",
        description: "Retrieve text from a supported paste link",
    },
    async (from, Guru, conText) => {
        const { q, reply, react, GuruTechApi, GuruApiKey } = conText;

        if (!q || !q.trim()) {
            await react("❌");
            return reply("Mfano: .pastebin paste link");
        }

        if (!GuruTechApi || !GuruApiKey) {
            await react("❌");
            return reply("API haijawekwa kwenye settings.");
        }

        try {
            await react("🔎");

            const data = await getJson(
                `${getApiBase(GuruTechApi)}/api/download/pastebin`,
                {
                    apikey: GuruApiKey,
                    url: q.trim(),
                }
            );

            const result = getResult(data);
            const content =
                typeof result === "string"
                    ? result
                    : result?.text ||
                      result?.content ||
                      result?.paste ||
                      "";

            if (!content) {
                await react("❌");
                return reply("Maandishi hayakupatikana kwenye API response.");
            }

            const textContent = String(content);

            if (textContent.length <= 3500) {
                await reply(textContent);
            } else {
                await reply(
                    "Maandishi ni marefu. Yatatumwa kama faili la TXT."
                );

                const buffer = Buffer.from(textContent, "utf8");

                await Guru.sendMessage(
                    from,
                    {
                        document: buffer,
                        fileName: "LUKA-XMD-Paste.txt",
                        mimetype: "text/plain",
                    }
                );
            }

            await react("✅");
        } catch (error) {
            console.error(
                "[LUKA-XMD PASTEBIN ERROR]",
                error.response?.data || error.message
            );

            await react("❌");
            return reply(
                "Paste download imeshindwa. Kagua endpoint ya API yako."
            );
        }
    }
);

module.exports = {};
