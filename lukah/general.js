"use strict";

const { gmd, commands } = require("../luka");
const moment = require("moment-timezone");

const {
    buildThemedMenu,
    sendMenuMsg,
    getSortedCategories,
    CAT_ICONS,
    getMenuPicUrl,
} = require("./design");

// ══════════════════════════════════════════════════════════════════════════════
//                              GENERAL COMMANDS
//                              LUKA-XMD
// ══════════════════════════════════════════════════════════════════════════════


// ─── 1. MENU ──────────────────────────────────────────────────────────────────

gmd(
    {
        pattern: "menu",
        aliases: ["help", "cmds", "commands", "start"],
        react: "📋",
        category: "general",
        description: "Show the bot command menu",
    },

    async (from, Guru, conText) => {
        const { react } = conText;

        await react("📋");

        try {
            const text = await buildThemedMenu(conText, Guru);

            await sendMenuMsg(
                Guru,
                from,
                text,
                conText
            );

            await react("✅");
        } catch (error) {
            console.error("Menu Error:", error);
            await react("❌");
        }
    }
);


// ─── 2. CATEGORY HANDLER ──────────────────────────────────────────────────────

gmd(
    {
        pattern: /^\d+$/,
        on: "body",
        dontAddCommandList: true,
        react: "📂",
        category: "general",
        description: "Browse commands by category number",
    },

    async (from, Guru, conText) => {
        const {
            body,
            mek,
            botName,
            botPrefix,
            botFooter,
            newsletterJid,
            sender,
            botId,
        } = conText;

        const n = parseInt(body.trim(), 10);
        const cats = getSortedCategories();

        if (isNaN(n) || n < 1 || n > cats.length) {
            return;
        }

        const { cat, cmds } = cats[n - 1];

        const icon = CAT_ICONS[cat] || "⚡";

        const label =
            cat.charAt(0).toUpperCase() +
            cat.slice(1);

        const cmdList = cmds
            .map((c) => {
                const desc = c.description
                    ? ` — _${c.description}_`
                    : "";

                const alts =
                    (c.aliases || []).length
                        ? `\n> │   ↳ _${c.aliases
                              .map((a) => `${botPrefix}${a}`)
                              .join(", ")}_`
                        : "";

                return `> │ ◈ *${botPrefix}${c.pattern}*${desc}${alts}`;
            })
            .join("\n");

        const text = `
> ╭─⌈ ${icon} *${label.toUpperCase()}* ⌋
> │ _${cmds.length} command${cmds.length !== 1 ? "s" : ""} available_
> │
${cmdList}
> ╰⊷ ✨ _${botFooter || "ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ"}_
`;

        const picUrl = await getMenuPicUrl(
            Guru,
            botId
        );

        const contextInfo = {
            mentionedJid: sender ? [sender] : [],
            forwardingScore: 5,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid:
                    newsletterJid ||
                    "120363406649804510@newsletter",

                newsletterName:
                    botName || "LUKA-XMD",

                serverMessageId: 0,
            },
        };

        try {
            if (picUrl) {
                await Guru.sendMessage(
                    from,
                    {
                        image: {
                            url: picUrl,
                        },
                        caption: text.trim(),
                        contextInfo,
                    },
                    {
                        quoted: mek,
                    }
                );
            } else {
                await Guru.sendMessage(
                    from,
                    {
                        text: text.trim(),
                        contextInfo,
                    },
                    {
                        quoted: mek,
                    }
                );
            }
        } catch (error) {
            console.error(
                "Category Error:",
                error
            );

            await Guru.sendMessage(
                from,
                {
                    text: text.trim(),
                },
                {
                    quoted: mek,
                }
            );
        }
    }
);


// ─── 3. PING ──────────────────────────────────────────────────────────────────

gmd(
    {
        pattern: "ping",
        aliases: ["p", "pi", "alive", "status", "check"],
        react: "⚡",
        category: "general",
        description: "Check bot response speed",
    },

    async (from, Guru, conText) => {
        const {
            mek,
            react,
            botName,
        } = conText;

        try {
            const startTime = process.hrtime();

            const elapsed = process.hrtime(startTime);

            const speed = Math.floor(
                elapsed[0] * 1000 +
                elapsed[1] / 1000000
            );

            const name = botName || "LUKA-XMD";

            // JID ya BOT mwenyewe
            const botJid =
                Guru.user?.id?.split(":")[0];

            let botProfilePic;

            try {
                if (botJid) {
                    botProfilePic =
                        await Guru.profilePictureUrl(
                            botJid,
                            "image"
                        );
                }
            } catch (e) {
                console.log(
                    "Bot profile picture not available"
                );
            }

            await Guru.sendMessage(
                from,
                {
                    text:
`${name} speed

${speed} ms`,

                    contextInfo: {
                        externalAdReply: {
                            title: name,
                            body: "View details",
                            mediaType: 1,

                            thumbnailUrl:
                                botProfilePic,

                            renderLargerThumbnail: true,
                            showAdAttribution: false,

                            sourceUrl:
                                "https://wa.me/",
                        },
                    },
                },
                {
                    quoted: mek,
                }
            );

            await react("✅");

        } catch (error) {
            console.error(
                "Ping Error:",
                error
            );

            await react("❌");
        }
    }
);

// ─── 4. UPTIME ────────────────────────────────────────────────────────────────

if (!global._botStartTime) {
    global._botStartTime = Date.now();
}

function getUptime() {
    const totalSeconds = Math.floor(
        (Date.now() - global._botStartTime) /
        1000
    );

    const days = Math.floor(
        totalSeconds / 86400
    );

    const hours = Math.floor(
        (totalSeconds % 86400) / 3600
    );

    const minutes = Math.floor(
        (totalSeconds % 3600) / 60
    );

    const seconds =
        totalSeconds % 60;

    const parts = [];

    if (days) {
        parts.push(`${days}d`);
    }

    if (hours) {
        parts.push(`${hours}h`);
    }

    if (minutes) {
        parts.push(`${minutes}m`);
    }

    parts.push(`${seconds}s`);

    return parts.join(" : ");
}

gmd(
    {
        pattern: "uptime",
        aliases: ["runtime", "ut"],
        react: "⏱️",
        category: "general",
        description: "Check bot uptime",
    },

    async (from, Guru, conText) => {
        const {
            mek,
            react,
            botName,
        } = conText;

        try {
            const uptime = getUptime();

            await Guru.sendMessage(
                from,
                {
                    text:
`${botName || "LUKA-XMD"} uptime

${uptime}`,
                },
                {
                    quoted: mek,
                }
            );

            await react("✅");
        } catch (error) {
            console.error(
                "Uptime Error:",
                error
            );

            await react("❌");
        }
    }
);

// ─── 5. BOT INFO ──────────────────────────────────────────────────────────────

gmd(
    {
        pattern: "botinfo",
        aliases: [
            "info",
            "about",
            "mybot",
        ],
        react: "🤖",
        category: "general",
        description: "Show bot information",
    },

    async (from, Guru, conText) => {
        const {
            reply,
            react,
            botName,
            botPrefix,
            botVersion,
            botMode,
            ownerName,
        } = conText;

        await react("🤖");

        const totalCmds =
            commands.filter(
                (c) =>
                    c.pattern &&
                    !c.dontAddCommandList
            ).length;

        const uptimeSeconds =
            Math.floor(process.uptime());

        const hours =
            Math.floor(
                uptimeSeconds / 3600
            );

        const minutes =
            Math.floor(
                (uptimeSeconds % 3600) /
                60
            );

        await reply(
`╭─⌈ 🤖 *${botName || "LUKA-XMD"}* ⌋
│
│ 📦 Version  : *v${botVersion || "5.0.0"}*
│ 📌 Prefix   : *${botPrefix || "."}*
│ 🌐 Mode     : *${(
            botMode || "public"
        ).toUpperCase()}*
│ 📊 Commands : *${totalCmds}*
│ ⏱️ Uptime   : *${hours}h ${minutes}m*
│ 👑 Owner    : *${ownerName || "Lukabrand"}*
│ 📚 Library  : *Baileys*
│
╰⊷ ✦ *${botName || "LUKA-XMD"}* ✦`
        );
    }
);


module.exports = {};
