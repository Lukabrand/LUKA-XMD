/**
 * design.js — Bot Design & Menu Theme System
 * Rounded Edition
 *
 * Commands:
 * .setmenu
 * .previewmenu
 * .setbotpic
 * .setmenupic
 * .setfooter
 * .setcaption
 * .setbotname
 * .setexpiry
 * .designinfo
 * .resetdesign
 */

"use strict";

const { gmd, commands } = require("../luka");
const {
    getSetting,
    setSetting,
    resetSetting
} = require("../luka/database/settings");

const { getExpiryStatus } = require("../luka/expiry");
const { Jimp } = require("jimp");
const { S_WHATSAPP_NET } = require("@whiskeysockets/baileys");

const fs = require("fs").promises;
const moment = require("moment-timezone");

// ─────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────

const MENU_IMAGE_URL = "https://i.imgur.com/9VP31oG.png";

const DEFAULTS = {
    BOT_NAME: "LUKA-XMD",
    PREFIX: ".",
    VERSION: "5.0.0",
    MODE: "public",
    FOOTER: "ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ",
    CAPTION: "Fast • Simple • Powerful",
    TIMEZONE: "Africa/Nairobi"
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function now(format, timezone) {
    return moment()
        .tz(timezone || DEFAULTS.TIMEZONE)
        .format(format);
}

function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    seconds %= 86400;

    const h = Math.floor(seconds / 3600);
    seconds %= 3600;

    const m = Math.floor(seconds / 60);
    seconds %= 60;

    return `${d}d ${h}h ${m}m ${seconds}s`;
}

function formatCategoryName(name) {
    return String(name || "general")
        .replace(/[_-]/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase());
}

const CAT_ICONS = {
    general: "💬",
    owner: "🔐",
    group: "👥",
    ai: "🧠",
    downloader: "⬇️",
    tools: "⚒️",
    search: "🔎",
    games: "🎮",
    fun: "🎭",
    religion: "🤲",
    sticker: "🪄",
    converter: "🔀",
    settings: "⚙️",
    media: "🎬",
    notes: "📝",
    channels: "📡",
    sports: "🏆",
    extras: "💎",
    texttools: "✍️",
    restrictions: "🛡️",
    ultracore: "🔥"
};

const CAT_ORDER = [
    "general",
    "ai",
    "downloader",
    "tools",
    "search",
    "games",
    "group",
    "owner",
    "settings",
    "fun",
    "converter",
    "religion",
    "texttools",
    "notes",
    "channels",
    "sports",
    "extras",
    "restrictions",
    "sticker",
    "media",
    "ultracore"
];

// ─────────────────────────────────────────────
// CATEGORY SYSTEM
// ─────────────────────────────────────────────

function getSortedCategories() {

    const map = {};

    for (const cmd of commands) {

        if (!cmd.pattern) continue;
        if (cmd.dontAddCommandList) continue;
        if (typeof cmd.pattern !== "string") continue;

        const category =
            String(cmd.category || "general").toLowerCase();

        if (!map[category]) {
            map[category] = [];
        }

        map[category].push(cmd);
    }

    return Object.keys(map)
        .sort((a, b) => {

            const ai = CAT_ORDER.indexOf(a);
            const bi = CAT_ORDER.indexOf(b);

            if (ai === -1 && bi === -1) {
                return a.localeCompare(b);
            }

            if (ai === -1) return 1;
            if (bi === -1) return -1;

            return ai - bi;

        })
        .map(category => ({
            cat: category,
            cmds: map[category]
        }));
}

// ─────────────────────────────────────────────
// CATEGORY DISPLAY
// ─────────────────────────────────────────────

function buildCategoryList() {

    const categories = getSortedCategories();

    return categories.map((item, index) => {

        const icon =
            CAT_ICONS[item.cat] || "🔥";

        const name =
            formatCategoryName(item.cat).toUpperCase();

        const number =
            String(index + 1).padStart(2, "0");

        return `│ ${number}  ${icon} ${name}  _(${item.cmds.length})_`;

    }).join("\n");
}

// ─────────────────────────────────────────────
// MENU DATA
// ─────────────────────────────────────────────

async function buildMenuData(conText) {

    const {
        sender,
        pushName,
        botName,
        botPrefix,
        botVersion,
        botMode,
        botFooter,
        botCaption,
        newsletterJid
    } = conText;

    const totalCmds =
        commands.filter(
            c => c.pattern && !c.dontAddCommandList
        ).length;

    const timezone =
        process.env.TIME_ZONE ||
        DEFAULTS.TIMEZONE;

    const uptime =
        formatUptime(
            Math.floor(process.uptime())
        );

    const date =
        now("DD/MM/YYYY", timezone);

    const time =
        now("HH:mm:ss", timezone);

    const expiry =
        await getExpiryStatus();

    const expiryLine =
        expiry.line || "Lifetime";

    const categories =
        getSortedCategories();

    return {

        sender,

        pushName:
            pushName || "User",

        botName:
            botName || DEFAULTS.BOT_NAME,

        botPrefix:
            botPrefix || DEFAULTS.PREFIX,

        botVersion:
            botVersion || DEFAULTS.VERSION,

        botMode:
            botMode || DEFAULTS.MODE,

        botFooter:
            botFooter || DEFAULTS.FOOTER,

        botCaption:
            botCaption || DEFAULTS.CAPTION,

        newsletterJid,

        uptime,
        totalCmds,

        date,
        time,

        expiryLine,

        categories,

        numCats:
            categories.length,

        categoryList:
            buildCategoryList()
    };
}

// ─────────────────────────────────────────────
// ROUNDED THEMES
// ─────────────────────────────────────────────

const THEMES = {

    rounded: {

        name: "╭╴⟮ ROUNDED ⟯╶╮",

        description:
            "Clean rounded WhatsApp style",

        render(data) {

            const {
                botName,
                botPrefix,
                botMode,
                botFooter,
                uptime,
                totalCmds,
                expiryLine,
                pushName,
                date,
                time,
                categoryList,
                numCats
            } = data;

            return (
`╭╴⟮ 🤖 *${botName}* ⟯╶╮
│ 👋 Hello › *${pushName}*
│ 🟢 Status › *ONLINE*
│ 📚 Cmds   › *${totalCmds}*
│ 📌 Prefix › *${botPrefix}*
│ 🌐 Mode   › *${botMode.toUpperCase()}*
│ ⏱️ Alive  › *${uptime}*
│ ⏳ Expiry › *${expiryLine}*
│ 🕐 Time   › *${time}*
│ 📅 Date   › *${date}*
╰╴⟮ ✦ *${botFooter}* ✦ ⟯╶╯

╭╴⟮ 📂 *COMMAND CATEGORIES* ⟯╶╮
${categoryList}
╰╴⟮ ✦ *Reply 1–${numCats}* ✦ ⟯╶╯

> _Reply with a number to open a category._`
            );
        }
    },

    compact: {

        name: "⚡ COMPACT",

        description:
            "Small rounded design",

        render(data) {

            const {
                botName,
                botPrefix,
                botMode,
                botFooter,
                uptime,
                totalCmds,
                categoryList,
                numCats
            } = data;

            return (
`╭╴⟮ ⚡ *${botName}* ⟯╶╮
│ 🟢 Online
│ 📦 Cmds   › *${totalCmds}*
│ 📌 Prefix › *${botPrefix}*
│ 🌐 Mode   › *${botMode}*
│ ⏱️ Alive  › *${uptime}*
╰╴⟮ ✦ *${botFooter}* ✦ ⟯╶╯

╭╴⟮ 📂 *CATEGORIES* ⟯╶╮
${categoryList}
╰╴⟮ ✦ *1–${numCats}* ✦ ⟯╶╯`
            );
        }
    },

    premium: {

        name: "💎 PREMIUM",

        description:
            "Premium rounded panel",

        render(data) {

            const {
                botName,
                botPrefix,
                botMode,
                botFooter,
                uptime,
                totalCmds,
                expiryLine,
                categoryList,
                numCats
            } = data;

            return (
`╭╴⟮ 💎 *${botName} ┃ ᴹᴰ* ⟯╶╮
│ 🟢 Status  › *ONLINE*
│ 📊 Plugins › *${totalCmds}*
│ 📌 Prefix  › *${botPrefix}*
│ 🌐 Mode    › *${botMode.toUpperCase()}*
│ ⏱️ Uptime  › *${uptime}*
│ 🔒 Licence › *${expiryLine}*
╰╴⟮ ✦ *${botFooter}* ✦ ⟯╶╯

╭╴⟮ 📂 *SELECT CATEGORY* ⟯╶╮
${categoryList}
╰╴⟮ ✦ *Reply 1–${numCats}* ✦ ⟯╶╯`
            );
        }
    },

    dark: {

        name: "🖤 DARK",

        description:
            "Dark rounded design",

        render(data) {

            const {
                botName,
                botPrefix,
                botMode,
                botFooter,
                uptime,
                totalCmds,
                categoryList,
                numCats
            } = data;

            return (
`╭╴⟮ 🖤 *${botName.toUpperCase()}* ⟯╶╮
│ ☠️ User    › *${data.pushName}*
│ 🟢 Status  › *ONLINE*
│ 💬 Cmds    › *${totalCmds}*
│ 🔑 Prefix  › *${botPrefix}*
│ 🛠️ Mode    › *${botMode.toUpperCase()}*
│ ⏱️ Uptime  › *${uptime}*
╰╴⟮ ✦ *${botFooter}* ✦ ⟯╶╯

╭╴⟮ 🕷️ *COMMANDS* ⟯╶╮
${categoryList}
╰╴⟮ ✦ *Reply 1–${numCats}* ✦ ⟯╶╯`
            );
        }
    },

    neon: {

        name: "⚡ NEON",

        description:
            "Modern neon rounded style",

        render(data) {

            const {
                botName,
                botPrefix,
                botMode,
                botFooter,
                uptime,
                totalCmds,
                categoryList,
                numCats
            } = data;

            return (
`╭╴⟮ ⚡ *${botName}* ⟯╶╮
│ 🤖 User   › *${data.pushName}*
│ 🟢 Status › *ONLINE*
│ 💬 Cmds   › *${totalCmds}*
│ 📌 Prefix › *${botPrefix}*
│ 🌐 Mode   › *${botMode.toUpperCase()}*
│ ⏱️ Alive  › *${uptime}*
╰╴⟮ ✦ *${botFooter}* ✦ ⟯╶╯

╭╴⟮ ⚡ *CATEGORIES* ⟯╶╮
${categoryList}
╰╴⟮ ✦ *Reply 1–${numCats}* ✦ ⟯╶╯`
            );
        }
    }

};

const THEME_KEYS =
    Object.keys(THEMES);

// ─────────────────────────────────────────────
// SEND MENU
// ─────────────────────────────────────────────

async function sendMenuMsg(
    Guru,
    from,
    text,
    conText
) {

    const {
        mek,
        botName,
        newsletterJid,
        sender
    } = conText;

    const customPic =
        await getSetting("MENU_PIC_CUSTOM");

    const picUrl =
        customPic || MENU_IMAGE_URL;

    try {

        await Guru.sendMessage(

            from,

            {
                image: {
                    url: picUrl
                },

                caption:
                    text.trim(),

                contextInfo: {

                    mentionedJid:
                        sender ? [sender] : [],

                    forwardingScore: 5,

                    isForwarded: true,

                    forwardedNewsletterMessageInfo: {

                        newsletterJid:
                            newsletterJid ||
                            "120363406649804510@newsletter",

                        newsletterName:
                            botName ||
                            DEFAULTS.BOT_NAME,

                        serverMessageId: 0
                    }
                }

            },

            {
                quoted: mek
            }

        );

    } catch (error) {

        await Guru.sendMessage(
            from,
            {
                text: text.trim()
            },
            {
                quoted: mek
            }
        );

    }
}

// ─────────────────────────────────────────────
// SETMENU
// ─────────────────────────────────────────────

gmd(
    {
        pattern: "setmenu",
        aliases: [
            "menutheme",
            "menudesign",
            "themenu"
        ],
        react: "🎨",
        category: "owner",
        description:
            "Change menu theme"
    },

    async (
        from,
        Guru,
        conText
    ) => {

        const {
            reply,
            react,
            isSuperUser,
            args,
            botFooter
        } = conText;

        if (!isSuperUser) {

            await react("❌");

            return reply(
                "❌ Owner Only Command!"
            );

        }

        const current =
            (await getSetting("MENU_THEME")) ||
            "rounded";

        if (!args[0]) {

            const list =
                THEME_KEYS.map(
                    (key, index) => {

                        const theme =
                            THEMES[key];

                        const active =
                            key === current
                                ? " ✅ *ACTIVE*"
                                : "";

                        return (
`${index + 1}. ${theme.name}${active}
_   ${theme.description}_`
                        );

                    }
                ).join("\n\n");

            return reply(
`╭╴⟮ 🎨 *MENU THEMES* ⟯╶╮
│ Total  › *${THEME_KEYS.length}*
│ Active › *${THEMES[current]?.name || current}*
╰╴⟮ ✦ *LUKABRAND* ✦ ⟯╶╯

${list}

> *.setmenu <number>*
> *.previewmenu <number>*`
            );
        }

        const number =
            parseInt(args[0], 10);

        if (
            isNaN(number) ||
            number < 1 ||
            number > THEME_KEYS.length
        ) {

            await react("❌");

            return reply(
`❌ Invalid theme.

Use:
*.setmenu 1-${THEME_KEYS.length}*`
            );
        }

        const key =
            THEME_KEYS[number - 1];

        await setSetting(
            "MENU_THEME",
            key
        );

        await react("⏳");

        const data =
            await buildMenuData(conText);

        const menu =
            THEMES[key].render(data);

        await sendMenuMsg(
            Guru,
            from,
            `✅ *Theme changed!*\n\n${menu}`,
            conText
        );

        await react("✅");
    }
);

// ─────────────────────────────────────────────
// PREVIEWMENU
// ─────────────────────────────────────────────

gmd(
    {
        pattern: "previewmenu",
        aliases: [
            "menupreview",
            "prevmenu"
        ],
        react: "👁️",
        category: "owner",
        description:
            "Preview a menu theme"
    },

    async (
        from,
        Guru,
        conText
    ) => {

        const {
            reply,
            react,
            isSuperUser,
            args
        } = conText;

        if (!isSuperUser) {

            await react("❌");

            return reply(
                "❌ Owner Only Command!"
            );

        }

        const number =
            parseInt(args[0], 10);

        if (
            isNaN(number) ||
            number < 1 ||
            number > THEME_KEYS.length
        ) {

            await react("❌");

            return reply(
`❌ Usage:
*.previewmenu 1-${THEME_KEYS.length}*`
            );
        }

        const key =
            THEME_KEYS[number - 1];

        const data =
            await buildMenuData(conText);

        const menu =
            THEMES[key].render(data);

        await sendMenuMsg(
            Guru,
            from,
`👁️ *Preview — ${THEMES[key].name}*

${menu}`,
            conText
        );

        await react("✅");
    }
);

// ─────────────────────────────────────────────
// SETMENUPIC
// ─────────────────────────────────────────────

gmd(
    {
        pattern: "setmenupic",
        aliases: [
            "menupic",
            "menuimage",
            "setmenuimg"
        ],
        react: "🖼️",
        category: "owner",
        description:
            "Change menu image"
    },

    async (
        from,
        Guru,
        conText
    ) => {

        const {
            reply,
            react,
            isSuperUser,
            q
        } = conText;

        if (!isSuperUser) {

            await react("❌");

            return reply(
                "❌ Owner Only Command!"
            );

        }

        if (
            !q ||
            !q.trim().startsWith("http")
        ) {

            await react("❌");

            return reply(
`❌ Provide an image URL.

Example:
*.setmenupic https://example.com/image.jpg*`
            );
        }

        await react("⏳");

        try {

            await setSetting(
                "MENU_PIC_CUSTOM",
                q.trim()
            );

            await react("✅");

            return reply(
`✅ *Menu image updated!*

Send *.menu* to view it.`
            );

        } catch (error) {

            await react("❌");

            return reply(
                `❌ Failed: ${error.message}`
            );

        }
    }
);

// ─────────────────────────────────────────────
// SETFOOTER
// ─────────────────────────────────────────────

gmd(
    {
        pattern: "setfooter",
        aliases: [
            "footer",
            "botfooter",
            "changefooter"
        ],
        react: "✏️",
        category: "owner",
        description:
            "Change menu footer"
    },

    async (
        from,
        Guru,
        conText
    ) => {

        const {
            reply,
            react,
            isSuperUser,
            q
        } = conText;

        if (!isSuperUser) {

            await react("❌");

            return reply(
                "❌ Owner Only Command!"
            );

        }

        if (!q || !q.trim()) {

            await react("❌");

            return reply(
`❌ Enter footer text.

Example:
*.setfooter Powered by Lukabrand*`
            );
        }

        await setSetting(
            "FOOTER",
            q.trim()
        );

        await react("✅");

        return reply(
`✅ Footer updated!

_${q.trim()}_`
        );
    }
);

// ─────────────────────────────────────────────
// SETCAPTION
// ─────────────────────────────────────────────

gmd(
    {
        pattern: "setcaption",
        aliases: [
            "caption",
            "botcaption",
            "changecaption"
        ],
        react: "✏️",
        category: "owner",
        description:
            "Change menu caption"
    },

    async (
        from,
        Guru,
        conText
    ) => {

        const {
            reply,
            react,
            isSuperUser,
            q
        } = conText;

        if (!isSuperUser) {

            await react("❌");

            return reply(
                "❌ Owner Only Command!"
            );

        }

        if (!q || !q.trim()) {

            await react("❌");

            return reply(
`❌ Enter caption text.

Example:
*.setcaption ⚡ Fast WhatsApp Bot*`
            );
        }

        await setSetting(
            "CAPTION",
            q.trim()
        );

        await react("✅");

        return reply(
`✅ Caption updated!

_${q.trim()}_`
        );
    }
);

// ─────────────────────────────────────────────
// SETBOTNAME
// ─────────────────────────────────────────────

gmd(
    {
        pattern: "setbotname",
        aliases: [
            "botname",
            "namebot",
            "changename",
            "renamebot"
        ],
        react: "✏️",
        category: "owner",
        description:
            "Change bot name"
    },

    async (
        from,
        Guru,
        conText
    ) => {

        const {
            reply,
            react,
            isSuperUser,
            q
        } = conText;

        if (!isSuperUser) {

            await react("❌");

            return reply(
                "❌ Owner Only Command!"
            );

        }

        if (!q || !q.trim()) {

            await react("❌");

            return reply(
`❌ Enter bot name.

Example:
*.setbotname LUKA-XMD*`
            );
        }

        await setSetting(
            "BOT_NAME",
            q.trim()
        );

        try {

            await Guru.updateProfileName(
                q.trim()
            );

        } catch {}

        await react("✅");

        return reply(
`✅ Bot name updated!

*${q.trim()}*`
        );
    }
);

// ─────────────────────────────────────────────
// DESIGNINFO
// ─────────────────────────────────────────────

gmd(
    {
        pattern: "designinfo",
        aliases: [
            "mydesign",
            "designstatus",
            "currentdesign"
        ],
        react: "🎨",
        category: "owner",
        description:
            "Show design settings"
    },

    async (
        from,
        Guru,
        conText
    ) => {

/**
 * design.js — Bot Design & Menu Theme System
 * Rounded Edition
 *
 * Commands:
 * .setmenu
 * .previewmenu
 * .setbotpic
 * .setmenupic
 * .setfooter
 * .setcaption
 * .setbotname
 * .setexpiry
 * .designinfo
 * .resetdesign
 */

"use strict";

const { gmd, commands } = require("../luka");
const {
    getSetting,
    setSetting,
    resetSetting
} = require("../luka/database/settings");

const { getExpiryStatus } = require("../luka/expiry");
const { Jimp } = require("jimp");
const { S_WHATSAPP_NET } = require("@whiskeysockets/baileys");

const fs = require("fs").promises;
const moment = require("moment-timezone");

// ─────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────

const MENU_IMAGE_URL = "https://i.imgur.com/9VP31oG.png";

const DEFAULTS = {
    BOT_NAME: "LUKA-XMD",
    PREFIX: ".",
    VERSION: "5.0.0",
    MODE: "public",
    FOOTER: "Powered by Lukabrand",
    CAPTION: "Fast • Simple • Powerful",
    TIMEZONE: "Africa/Nairobi"
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function now(format, timezone) {
    return moment()
        .tz(timezone || DEFAULTS.TIMEZONE)
        .format(format);
}

function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    seconds %= 86400;

    const h = Math.floor(seconds / 3600);
    seconds %= 3600;

    const m = Math.floor(seconds / 60);
    seconds %= 60;

    return `${d}d ${h}h ${m}m ${seconds}s`;
}

function formatCategoryName(name) {
    return String(name || "general")
        .replace(/[_-]/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase());
}

const CAT_ICONS = {
    general: "💬",
    owner: "🔐",
    group: "👥",
    ai: "🧠",
    downloader: "⬇️",
    tools: "⚒️",
    search: "🔎",
    games: "🎮",
    fun: "🎭",
    religion: "🤲",
    sticker: "🪄",
    converter: "🔀",
    settings: "⚙️",
    media: "🎬",
    notes: "📝",
    channels: "📡",
    sports: "🏆",
    extras: "💎",
    texttools: "✍️",
    restrictions: "🛡️",
    ultracore: "🔥"
};

const CAT_ORDER = [
    "general",
    "ai",
    "downloader",
    "tools",
    "search",
    "games",
    "group",
    "owner",
    "settings",
    "fun",
    "converter",
    "religion",
    "texttools",
    "notes",
    "channels",
    "sports",
    "extras",
    "restrictions",
    "sticker",
    "media",
    "ultracore"
];

// ─────────────────────────────────────────────
// CATEGORY SYSTEM
// ─────────────────────────────────────────────

function getSortedCategories() {

    const map = {};

    for (const cmd of commands) {

        if (!cmd.pattern) continue;
        if (cmd.dontAddCommandList) continue;
        if (typeof cmd.pattern !== "string") continue;

        const category =
            String(cmd.category || "general").toLowerCase();

        if (!map[category]) {
            map[category] = [];
        }

        map[category].push(cmd);
    }

    return Object.keys(map)
        .sort((a, b) => {

            const ai = CAT_ORDER.indexOf(a);
            const bi = CAT_ORDER.indexOf(b);

            if (ai === -1 && bi === -1) {
                return a.localeCompare(b);
            }

            if (ai === -1) return 1;
            if (bi === -1) return -1;

            return ai - bi;

        })
        .map(category => ({
            cat: category,
            cmds: map[category]
        }));
}

// ─────────────────────────────────────────────
// CATEGORY DISPLAY
// ─────────────────────────────────────────────

function buildCategoryList() {

    const categories = getSortedCategories();

    return categories.map((item, index) => {

        const icon =
            CAT_ICONS[item.cat] || "🔥";

        const name =
            formatCategoryName(item.cat).toUpperCase();

        const number =
            String(index + 1).padStart(2, "0");

        return `│ ${number}  ${icon} ${name}  _(${item.cmds.length})_`;

    }).join("\n");
}

// ─────────────────────────────────────────────
// MENU DATA
// ─────────────────────────────────────────────

async function buildMenuData(conText) {

    const {
        sender,
        pushName,
        botName,
        botPrefix,
        botVersion,
        botMode,
        botFooter,
        botCaption,
        newsletterJid
    } = conText;

    const totalCmds =
        commands.filter(
            c => c.pattern && !c.dontAddCommandList
        ).length;

    const timezone =
        process.env.TIME_ZONE ||
        DEFAULTS.TIMEZONE;

    const uptime =
        formatUptime(
            Math.floor(process.uptime())
        );

    const date =
        now("DD/MM/YYYY", timezone);

    const time =
        now("HH:mm:ss", timezone);

    const expiry =
        await getExpiryStatus();

    const expiryLine =
        expiry.line || "Lifetime";

    const categories =
        getSortedCategories();

    return {

        sender,

        pushName:
            pushName || "User",

        botName:
            botName || DEFAULTS.BOT_NAME,

        botPrefix:
            botPrefix || DEFAULTS.PREFIX,

        botVersion:
            botVersion || DEFAULTS.VERSION,

        botMode:
            botMode || DEFAULTS.MODE,

        botFooter:
            botFooter || DEFAULTS.FOOTER,

        botCaption:
            botCaption || DEFAULTS.CAPTION,

        newsletterJid,

        uptime,
        totalCmds,

        date,
        time,

        expiryLine,

        categories,

        numCats:
            categories.length,

        categoryList:
            buildCategoryList()
    };
}

// ─────────────────────────────────────────────
// ROUNDED THEMES
// ─────────────────────────────────────────────

const THEMES = {

    rounded: {

        name: "╭╴⟮ ROUNDED ⟯╶╮",

        description:
            "Clean rounded WhatsApp style",

        render(data) {

            const {
                botName,
                botPrefix,
                botMode,
                botFooter,
                uptime,
                totalCmds,
                expiryLine,
                pushName,
                date,
                time,
                categoryList,
                numCats
            } = data;

            return (
`╭╴⟮ 🤖 *${botName}* ⟯╶╮
│ 👋 Hello › *${pushName}*
│ 🟢 Status › *ONLINE*
│ 📚 Cmds   › *${totalCmds}*
│ 📌 Prefix › *${botPrefix}*
│ 🌐 Mode   › *${botMode.toUpperCase()}*
│ ⏱️ Alive  › *${uptime}*
│ ⏳ Expiry › *${expiryLine}*
│ 🕐 Time   › *${time}*
│ 📅 Date   › *${date}*
╰╴⟮ ✦ *${botFooter}* ✦ ⟯╶╯

╭╴⟮ 📂 *COMMAND CATEGORIES* ⟯╶╮
${categoryList}
╰╴⟮ ✦ *Reply 1–${numCats}* ✦ ⟯╶╯

> _Reply with a number to open a category._`
            );
        }
    },

    compact: {

        name: "⚡ COMPACT",

        description:
            "Small rounded design",

        render(data) {

            const {
                botName,
                botPrefix,
                botMode,
                botFooter,
                uptime,
                totalCmds,
                categoryList,
                numCats
            } = data;

            return (
`╭╴⟮ ⚡ *${botName}* ⟯╶╮
│ 🟢 Online
│ 📦 Cmds   › *${totalCmds}*
│ 📌 Prefix › *${botPrefix}*
│ 🌐 Mode   › *${botMode}*
│ ⏱️ Alive  › *${uptime}*
╰╴⟮ ✦ *${botFooter}* ✦ ⟯╶╯

╭╴⟮ 📂 *CATEGORIES* ⟯╶╮
${categoryList}
╰╴⟮ ✦ *1–${numCats}* ✦ ⟯╶╯`
            );
        }
    },

    premium: {

        name: "💎 PREMIUM",

        description:
            "Premium rounded panel",

        render(data) {

            const {
                botName,
                botPrefix,
                botMode,
                botFooter,
                uptime,
                totalCmds,
                expiryLine,
                categoryList,
                numCats
            } = data;

            return (
`╭╴⟮ 💎 *${botName} ┃ ᴹᴰ* ⟯╶╮
│ 🟢 Status  › *ONLINE*
│ 📊 Plugins › *${totalCmds}*
│ 📌 Prefix  › *${botPrefix}*
│ 🌐 Mode    › *${botMode.toUpperCase()}*
│ ⏱️ Uptime  › *${uptime}*
│ 🔒 Licence › *${expiryLine}*
╰╴⟮ ✦ *${botFooter}* ✦ ⟯╶╯

╭╴⟮ 📂 *SELECT CATEGORY* ⟯╶╮
${categoryList}
╰╴⟮ ✦ *Reply 1–${numCats}* ✦ ⟯╶╯`
            );
        }
    },

    dark: {

        name: "🖤 DARK",

        description:
            "Dark rounded design",

        render(data) {

            const {
                botName,
                botPrefix,
                botMode,
                botFooter,
                uptime,
                totalCmds,
                categoryList,
                numCats
            } = data;

            return (
`╭╴⟮ 🖤 *${botName.toUpperCase()}* ⟯╶╮
│ ☠️ User    › *${data.pushName}*
│ 🟢 Status  › *ONLINE*
│ 💬 Cmds    › *${totalCmds}*
│ 🔑 Prefix  › *${botPrefix}*
│ 🛠️ Mode    › *${botMode.toUpperCase()}*
│ ⏱️ Uptime  › *${uptime}*
╰╴⟮ ✦ *${botFooter}* ✦ ⟯╶╯

╭╴⟮ 🕷️ *COMMANDS* ⟯╶╮
${categoryList}
╰╴⟮ ✦ *Reply 1–${numCats}* ✦ ⟯╶╯`
            );
        }
    },

    neon: {

        name: "⚡ NEON",

        description:
            "Modern neon rounded style",

        render(data) {

            const {
                botName,
                botPrefix,
                botMode,
                botFooter,
                uptime,
                totalCmds,
                categoryList,
                numCats
            } = data;

            return (
`╭╴⟮ ⚡ *${botName}* ⟯╶╮
│ 🤖 User   › *${data.pushName}*
│ 🟢 Status › *ONLINE*
│ 💬 Cmds   › *${totalCmds}*
│ 📌 Prefix › *${botPrefix}*
│ 🌐 Mode   › *${botMode.toUpperCase()}*
│ ⏱️ Alive  › *${uptime}*
╰╴⟮ ✦ *${botFooter}* ✦ ⟯╶╯

╭╴⟮ ⚡ *CATEGORIES* ⟯╶╮
${categoryList}
╰╴⟮ ✦ *Reply 1–${numCats}* ✦ ⟯╶╯`
            );
        }
    }

};

const THEME_KEYS =
    Object.keys(THEMES);

// ─────────────────────────────────────────────
// SEND MENU
// ─────────────────────────────────────────────

async function sendMenuMsg(
    Guru,
    from,
    text,
    conText
) {

    const {
        mek,
        botName,
        newsletterJid,
        sender
    } = conText;

    const customPic =
        await getSetting("MENU_PIC_CUSTOM");

    const picUrl =
        customPic || MENU_IMAGE_URL;

    try {

        await Guru.sendMessage(

            from,

            {
                image: {
                    url: picUrl
                },

                caption:
                    text.trim(),

                contextInfo: {

                    mentionedJid:
                        sender ? [sender] : [],

                    forwardingScore: 5,

                    isForwarded: true,

                    forwardedNewsletterMessageInfo: {

                        newsletterJid:
                            newsletterJid ||
                            "120363406649804510@newsletter",

                        newsletterName:
                            botName ||
                            DEFAULTS.BOT_NAME,

                        serverMessageId: 0
                    }
                }

            },

            {
                quoted: mek
            }

        );

    } catch (error) {

        await Guru.sendMessage(
            from,
            {
                text: text.trim()
            },
            {
                quoted: mek
            }
        );

    }
}

// ─────────────────────────────────────────────
// SETMENU
// ─────────────────────────────────────────────

gmd(
    {
        pattern: "setmenu",
        aliases: [
            "menutheme",
            "menudesign",
            "themenu"
        ],
        react: "🎨",
        category: "owner",
        description:
            "Change menu theme"
    },

    async (
        from,
        Guru,
        conText
    ) => {

        const {
            reply,
            react,
            isSuperUser,
            args,
            botFooter
        } = conText;

        if (!isSuperUser) {

            await react("❌");

            return reply(
                "❌ Owner Only Command!"
            );

        }

        const current =
            (await getSetting("MENU_THEME")) ||
            "rounded";

        if (!args[0]) {

            const list =
                THEME_KEYS.map(
                    (key, index) => {

                        const theme =
                            THEMES[key];

                        const active =
                            key === current
                                ? " ✅ *ACTIVE*"
                                : "";

                        return (
`${index + 1}. ${theme.name}${active}
_   ${theme.description}_`
                        );

                    }
                ).join("\n\n");

            return reply(
`╭╴⟮ 🎨 *MENU THEMES* ⟯╶╮
│ Total  › *${THEME_KEYS.length}*
│ Active › *${THEMES[current]?.name || current}*
╰╴⟮ ✦ *LUKABRAND* ✦ ⟯╶╯

${list}

> *.setmenu <number>*
> *.previewmenu <number>*`
            );
        }

        const number =
            parseInt(args[0], 10);

        if (
            isNaN(number) ||
            number < 1 ||
            number > THEME_KEYS.length
        ) {

            await react("❌");

            return reply(
`❌ Invalid theme.

Use:
*.setmenu 1-${THEME_KEYS.length}*`
            );
        }

        const key =
            THEME_KEYS[number - 1];

        await setSetting(
            "MENU_THEME",
            key
        );

        await react("⏳");

        const data =
            await buildMenuData(conText);

        const menu =
            THEMES[key].render(data);

        await sendMenuMsg(
            Guru,
            from,
            `✅ *Theme changed!*\n\n${menu}`,
            conText
        );

        await react("✅");
    }
);

// ─────────────────────────────────────────────
// PREVIEWMENU
// ─────────────────────────────────────────────

gmd(
    {
        pattern: "previewmenu",
        aliases: [
            "menupreview",
            "prevmenu"
        ],
        react: "👁️",
        category: "owner",
        description:
            "Preview a menu theme"
    },

    async (
        from,
        Guru,
        conText
    ) => {

        const {
            reply,
            react,
            isSuperUser,
            args
        } = conText;

        if (!isSuperUser) {

            await react("❌");

            return reply(
                "❌ Owner Only Command!"
            );

        }

        const number =
            parseInt(args[0], 10);

        if (
            isNaN(number) ||
            number < 1 ||
            number > THEME_KEYS.length
        ) {

            await react("❌");

            return reply(
`❌ Usage:
*.previewmenu 1-${THEME_KEYS.length}*`
            );
        }

        const key =
            THEME_KEYS[number - 1];

        const data =
            await buildMenuData(conText);

        const menu =
            THEMES[key].render(data);

        await sendMenuMsg(
            Guru,
            from,
`👁️ *Preview — ${THEMES[key].name}*

${menu}`,
            conText
        );

        await react("✅");
    }
);

// ─────────────────────────────────────────────
// SETMENUPIC
// ─────────────────────────────────────────────

gmd(
    {
        pattern: "setmenupic",
        aliases: [
            "menupic",
            "menuimage",
            "setmenuimg"
        ],
        react: "🖼️",
        category: "owner",
        description:
            "Change menu image"
    },

    async (
        from,
        Guru,
        conText
    ) => {

        const {
            reply,
            react,
            isSuperUser,
            q
        } = conText;

        if (!isSuperUser) {

            await react("❌");

            return reply(
                "❌ Owner Only Command!"
            );

        }

        if (
            !q ||
            !q.trim().startsWith("http")
        ) {

            await react("❌");

            return reply(
`❌ Provide an image URL.

Example:
*.setmenupic https://example.com/image.jpg*`
            );
        }

        await react("⏳");

        try {

            await setSetting(
                "MENU_PIC_CUSTOM",
                q.trim()
            );

            await react("✅");

            return reply(
`✅ *Menu image updated!*

Send *.menu* to view it.`
            );

        } catch (error) {

            await react("❌");

            return reply(
                `❌ Failed: ${error.message}`
            );

        }
    }
);

// ─────────────────────────────────────────────
// SETFOOTER
// ─────────────────────────────────────────────

gmd(
    {
        pattern: "setfooter",
        aliases: [
            "footer",
            "botfooter",
            "changefooter"
        ],
        react: "✏️",
        category: "owner",
        description:
            "Change menu footer"
    },

    async (
        from,
        Guru,
        conText
    ) => {

        const {
            reply,
            react,
            isSuperUser,
            q
        } = conText;

        if (!isSuperUser) {

            await react("❌");

            return reply(
                "❌ Owner Only Command!"
            );

        }

        if (!q || !q.trim()) {

            await react("❌");

            return reply(
`❌ Enter footer text.

Example:
*.setfooter Powered by Lukabrand*`
            );
        }

        await setSetting(
            "FOOTER",
            q.trim()
        );

        await react("✅");

        return reply(
`✅ Footer updated!

_${q.trim()}_`
        );
    }
);

// ─────────────────────────────────────────────
// SETCAPTION
// ─────────────────────────────────────────────

gmd(
    {
        pattern: "setcaption",
        aliases: [
            "caption",
            "botcaption",
            "changecaption"
        ],
        react: "✏️",
        category: "owner",
        description:
            "Change menu caption"
    },

    async (
        from,
        Guru,
        conText
    ) => {

        const {
            reply,
            react,
            isSuperUser,
            q
        } = conText;

        if (!isSuperUser) {

            await react("❌");

            return reply(
                "❌ Owner Only Command!"
            );

        }

        if (!q || !q.trim()) {

            await react("❌");

            return reply(
`❌ Enter caption text.

Example:
*.setcaption ⚡ Fast WhatsApp Bot*`
            );
        }

        await setSetting(
            "CAPTION",
            q.trim()
        );

        await react("✅");

        return reply(
`✅ Caption updated!

_${q.trim()}_`
        );
    }
);

// ─────────────────────────────────────────────
// SETBOTNAME
// ─────────────────────────────────────────────

gmd(
    {
        pattern: "setbotname",
        aliases: [
            "botname",
            "namebot",
            "changename",
            "renamebot"
        ],
        react: "✏️",
        category: "owner",
        description:
            "Change bot name"
    },

    async (
        from,
        Guru,
        conText
    ) => {

        const {
            reply,
            react,
            isSuperUser,
            q
        } = conText;

        if (!isSuperUser) {

            await react("❌");

            return reply(
                "❌ Owner Only Command!"
            );

        }

        if (!q || !q.trim()) {

            await react("❌");

            return reply(
`❌ Enter bot name.

Example:
*.setbotname LUKA-XMD*`
            );
        }

        await setSetting(
            "BOT_NAME",
            q.trim()
        );

        try {

            await Guru.updateProfileName(
                q.trim()
            );

        } catch {}

        await react("✅");

        return reply(
`✅ Bot name updated!

*${q.trim()}*`
        );
    }
);

// ─────────────────────────────────────────────
// DESIGNINFO
// ─────────────────────────────────────────────

gmd(
    {
        pattern: "designinfo",
        aliases: [
            "mydesign",
            "designstatus",
            "currentdesign"
        ],
        react: "🎨",
        category: "owner",
        description:
            "Show design settings"
    },

    async (
        from,
        Guru,
        conText
    ) => {

        const {
            reply,
            react,
            isSuperUser
        } = conText;

        if (!isSuperUser) {

            await react("❌");

            return reply(
                "❌ Owner Only Command!"
            );

        }

        const [
            theme,
            footer,
            caption,
            name,
            pic
        ] = await Promise.all([

            getSetting("MENU_THEME"),
            getSetting("FOOTER"),
            getSetting("CAPTION"),
            getSetting("BOT_NAME"),
            getSetting("MENU_PIC_CUSTOM")

        ]);

        const active =
            theme || "rounded";

        const themeIndex =
            THEME_KEYS.indexOf(active) + 1;

        await react("✅");

        return reply(
`╭╴⟮ 🎨 *DESIGN SETTINGS* ⟯╶╮
│ 🎨 Theme   › *${THEMES[active]?.name || active}*
│ 🔢 Number  › *${themeIndex}/${THEME_KEYS.length}*
│ 🤖 Name    › *${name || DEFAULTS.BOT_NAME}*
│ 📝 Footer  › _${footer || DEFAULTS.FOOTER}_
│ 💬 Caption › _${caption || DEFAULTS.CAPTION}_
│ 🖼️ Picture › ${pic ? "CUSTOM" : "DEFAULT"}
╰╴⟮ ✦ *LUKABRAND* ✦ ⟯╶╯

*Commands*

◈ *.setmenu*
◈ *.previewmenu <n>*
◈ *.setmenupic <url>*
◈ *.setbotname <name>*
◈ *.setfooter <text>*
◈ *.setcaption <text>*
◈ *.resetdesign*`
        );
    }
);

// ─────────────────────────────────────────────
// RESET DESIGN
// ─────────────────────────────────────────────

const resetConfirm =
    new Map();

gmd(
    {
        pattern: "resetdesign",
        aliases: [
            "designreset",
            "resettheme"
        ],
        react: "🔄",
        category: "owner",
        description:
            "Reset design settings"
    },

    async (
        from,
        Guru,
        conText
    ) => {

        const {
            reply,
            react,
            isSuperUser
        } = conText;

        if (!isSuperUser) {

            await react("❌");

            return reply(
                "❌ Owner Only Command!"
            );

        }

        const current =
            Date.now();

        const pending =
            resetConfirm.get(from);

        if (
            !pending ||
            current - pending > 25000
        ) {

            resetConfirm.set(
                from,
                current
            );

            await react("⚠️");

            return reply(
`╭╴⟮ ⚠️ *RESET DESIGN* ⟯╶╮
│ This will reset:
│ 🎨 Theme
│ 🤖 Bot name
│ 📝 Footer
│ 💬 Caption
│ 🖼️ Menu picture
╰╴⟮ ✦ *Send .resetdesign again* ✦ ⟯╶╯`
            );
        }

        resetConfirm.delete(from);

        await Promise.all([

            resetSetting("MENU_THEME"),
            resetSetting("BOT_PIC"),
            resetSetting("MENU_PIC_CUSTOM"),
            resetSetting("FOOTER"),
            resetSetting("CAPTION"),
            resetSetting("BOT_NAME")

        ]);

        await react("✅");

        return reply(
`╭╴⟮ ✅ *DESIGN RESET* ⟯╶╮
│ 🎨 Theme   › *Rounded*
│ 🖼️ Picture › *Default*
│ 🤖 Name    › *Default*
│ 📝 Footer  › *Default*
╰╴⟮ ✦ *LUKABRAND* ✦ ⟯╶╯

Send *.menu* to view the result.`
        );
    }
);

// ─────────────────────────────────────────────
// BUILD THEMED MENU
// ─────────────────────────────────────────────

async function buildThemedMenu(
    conText,
    Guru
) {

    const themeKey =
        (await getSetting("MENU_THEME")) ||
        "rounded";

    const theme =
        THEMES[themeKey] ||
        THEMES.rounded;

    const data =
        await buildMenuData(conText);

    return theme.render(data);
}

// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────

module.exports = {
    buildThemedMenu,
    THEMES,
    THEME_KEYS,
    buildMenuData,
    sendMenuMsg,
    getSortedCategories,
    CAT_ICONS
};Enter        const {
            reply,
            react,
            isSuperUser
        } = conText;

        if (!isSuperUser) {

            await react("❌");

            return reply(
                "❌ Owner Only Command!"
            );

        }

        const [
            theme,
            footer,
            caption,
            name,
            pic
        ] = await Promise.all([

            getSetting("MENU_THEME"),
       getSetting("FOOTER"),
            getSetting("CAPTION"),
            getSetting("BOT_NAME"),
            getSetting("MENU_PIC_CUSTOM")

        ]);

        const active =
            theme || "rounded";

        const themeIndex =
            THEME_KEYS.indexOf(active) + 1;

        await react("✅");

        return reply(
`╭╴⟮ 🎨 *DESIGN SETTINGS* ⟯╶╮
│ 🎨 Theme   › *${THEMES[active]?.name || active}*
│ 🔢 Number  › *${themeIndex}/${THEME_KEYS.length}*
│ 🤖 Name    › *${name || DEFAULTS.BOT_NAME}*
│ 📝 Footer  › _${footer || DEFAULTS.FOOTER}_
│ 💬 Caption › _${caption || DEFAULTS.CAPTION}_
│ 🖼️ Picture › ${pic ? "CUSTOM" : "DEFAULT"}
╰╴⟮ ✦ *LUKABRAND* ✦ ⟯╶╯

*Commands*

◈ *.setmenu*
◈ *.previewmenu <n>*
◈ *.setmenupic <url>*
◈ *.setbotname <name>*
◈ *.setfooter <text>*
◈ *.setcaption <text>*
◈ *.resetdesign*`
        );
    }
);

// ─────────────────────────────────────────────
// RESET DESIGN
// ─────────────────────────────────────────────

const resetConfirm =
    new Map();

gmd(
    {
        pattern: "resetdesign",
        aliases: [
            "designreset",
            "resettheme"
        ],
        react: "🔄",
        category: "owner",
        description:
            "Reset design settings"
    },

    async (
        from,
        Guru,
        conText
    ) => {

        const {
            reply,
            react,
            isSuperUser
        } = conText;

        if (!isSuperUser) {

            await react("❌");

            return reply(
                "❌ Owner Only Command!"
            );

        }

        const current =
            Date.now();

        const pending =
            resetConfirm.get(from);

        if (
            !pending ||
            current - pending > 25000
        ) {

            resetConfirm.set(
                from,
                current
            );

            await react("⚠️");

            return reply(
