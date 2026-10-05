"use strict";

const { gmd, commands } = require("../luka");

// ══════════════════════════════════════════════════════════════════════════════
//                         LUKA-XMD • GENERAL
// ══════════════════════════════════════════════════════════════════════════════


// ─── HELP / MENU ──────────────────────────────────────────────────────────────

gmd(
    {
        pattern: "menu",
        aliases: ["help", "start", "commands", "cmds"],
        react: "📂",
        category: "general",
        description: "Open bot menu",
    },

    async (from, Guru, conText) => {

        const {
            react,
            botName,
            botPrefix,
            botFooter,
        } = conText;

        try {

            await Guru.sendMessage(
                from,
                {
                    text:
`╭━━━〔 ${botName || "LUKA-XMD"} 〕━━━╮
┃
┃  📖 *COMMAND MENU*
┃
┃  📌 Prefix : *${botPrefix || "."}*
┃  🤖 Status : *ONLINE*
┃
┃  Type *${botPrefix || "."}menu* to explore
┃
╰━━━━━━━━━━━━━━━━━━━━╯

${botFooter || "ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ"}`
                }
            );

            await react("✅");

        } catch (error) {

            console.error(
                "Menu Error:",
                error
            );

            await react("❌");
        }
    }
);


// ─── PING ────────────────────────────────────────────────────────────────────

gmd(
    {
        pattern: "ping",
        aliases: ["p", "pi"],
        react: "⚡",
        category: "general",
        description: "Check bot response speed",
    },

    async (from, Guru, conText) => {

        const {
            react,
            newsletterUrl,
            botFooter,
            botName,
            botPrefix,
        } = conText;

        try {

            const start =
                process.hrtime();

            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        Math.floor(
                            80 +
                            Math.random() * 420
                        )
                    )
            );

            const elapsed =
                process.hrtime(start);

            const responseTime =
                Math.floor(
                    elapsed[0] * 1000 +
                    elapsed[1] / 1000000
                );

            await sendButtons(
                Guru,
                from,
                {
                    title:
                        `${botName || "LUKA-XMD"} Speed`,

                    text:
                        `⚡ ${responseTime} ms`,

                    footer:
                        `> *${botFooter || "ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ"}*`,

                    buttons: [

                        {
                            id:
                                `${botPrefix || "."}uptime`,

                            text:
                                "⏱️ Uptime",
                        },

                        {
                            name:
                                "cta_url",

                            buttonParamsJson:
                                JSON.stringify({

                                    display_text:
                                        "WaChannel",

                                    url:
                                        newsletterUrl,
                                }),
                        },

                    ],
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


// ─── UPTIME ───────────────────────────────────────────────────────────────────

const bootTime = Date.now();

function getUptime() {

    let seconds =
        Math.floor(
            (Date.now() - bootTime) / 1000
        );

    const days =
        Math.floor(seconds / 86400);

    seconds %= 86400;

    const hours =
        Math.floor(seconds / 3600);

    seconds %= 3600;

    const minutes =
        Math.floor(seconds / 60);

    seconds %= 60;

    const parts = [];

    if (days)
        parts.push(`${days}d`);

    if (hours)
        parts.push(`${hours}h`);

    if (minutes)
        parts.push(`${minutes}m`);

    parts.push(`${seconds}s`);

    return parts.join(" ");
}


gmd(
    {
        pattern: "uptime",
        aliases: ["runtime", "up"],
        react: "⏱️",
        category: "general",
        description: "Check bot uptime",
    },

    async (from, Guru, conText) => {

        const {
            react,
            botName,
            botFooter,
        } = conText;

        try {

            await Guru.sendMessage(
                from,
                {
                    text:
`╭─〔 ⏱️ ${botName || "LUKA-XMD"} 〕─╮
│
│ 🟢 Running
│ ${getUptime()}
│
╰─〔 ${botFooter || "ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ"} 〕─╯`
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


// ─── BOT INFO ────────────────────────────────────────────────────────────────

gmd(
    {
        pattern: "botinfo",
        aliases: ["info", "about"],
        react: "🤖",
        category: "general",
        description: "Show bot information",
    },

    async (from, Guru, conText) => {

        const {
            react,
            botName,
            botPrefix,
            botVersion,
            botMode,
            ownerName,
            botFooter,
        } = conText;

        try {

            const totalCommands =
                commands.filter(
                    cmd =>
                        cmd.pattern &&
                        !cmd.dontAddCommandList
                ).length;

            await Guru.sendMessage(
                from,
                {
                    text:
`╭━━〔 🤖 BOT INFO 〕━━╮
┃
┃ 🤖 Bot      : *${botName || "LUKA-XMD"}*
┃ 📦 Version  : *v${botVersion || "5.0.0"}*
┃ 📌 Prefix   : *${botPrefix || "."}*
┃ 🌐 Mode     : *${(botMode || "public").toUpperCase()}*
┃ 📊 Commands : *${totalCommands}*
┃ 👑 Owner    : *${ownerName || "Lukabrand"}*
┃ ⚡ Engine   : *Baileys*
┃
╰━━〔 ${botFooter || "ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ"} 〕━━╯`
                }
            );

            await react("✅");

        } catch (error) {

            console.error(
                "BotInfo Error:",
                error
            );

            await react("❌");
        }
    }
);


// ─── ALIVE ───────────────────────────────────────────────────────────────────

gmd(
    {
        pattern: "alive",
        aliases: ["online"],
        react: "🟢",
        category: "general",
        description: "Check bot status",
    },

    async (from, Guru, conText) => {

        const {
            react,
            botName,
            botFooter,
            botMode,
        } = conText;

        try {

            await Guru.sendMessage(
                from,
                {
                    text:
`╭──〔 🟢 ONLINE 〕──╮
│
│ 🤖 ${botName || "LUKA-XMD"}
│ ⚡ Status : *ACTIVE*
│ 🌐 Mode   : *${(botMode || "public").toUpperCase()}*
│
╰──〔 ${botFooter || "ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ"} 〕──╯`
                }
            );

            await react("✅");

        } catch (error) {

            console.error(
                "Alive Error:",
                error
            );

            await react("❌");
        }
    }
);


module.exports = {};
