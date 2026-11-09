'use strict';

const { addCmd, addTrigger } = require('../../luka/handlers/loader');
const { getSetting, setSetting, getGroupSettings, setGroupSetting } = require('../../luka/db/database');
const config = require('../../luka/config/settings');
const moment = require('moment-timezone');
const { channelCtx, sendButtons } = require('../../luka/utils/gmdFunctions2');

// ═══════════════════════════════════════════════════════════════
//  OWNER BOOL TOGGLE HELPER
// ═══════════════════════════════════════════════════════════════

function ownerToggle({ name, aliases = [], desc, configKey, onMsg, offMsg }) {
    addCmd({
        name,
        aliases,
        desc,
        category: 'owner',
        ownerOnly: true,
        handler: async (ctx) => {
            const arg     = ctx.args[0]?.toLowerCase();
            const current = config[configKey];
            const newVal  = arg === 'on' ? true : arg === 'off' ? false : !current;
            setSetting(configKey, String(newVal));
            config[configKey] = newVal;
            await ctx.reply(newVal ? onMsg : offMsg);
        },
    });
}

// ── Auto-React ─────────────────────────────────────────────────
ownerToggle({
    name:      'autoreact',
    aliases:   ['togglereact'],
    desc:      'Toggle auto-react on every incoming message',
    configKey: 'AUTO_REACT',
    onMsg:     '✅ *Auto-React ON*\n\nI will react to every incoming message.',
    offMsg:    '🔕 *Auto-React OFF*\n\nAuto-react has been disabled.',
});

// ── Auto-Read Status ───────────────────────────────────────────
ownerToggle({
    name:      'autoread',
    aliases:   ['toggleread', 'autoreadstatus'],
    desc:      'Toggle auto-read of WhatsApp statuses',
    configKey: 'AUTO_READ_STATUS',
    onMsg:     '✅ *Auto-Read Status ON*\n\nI will automatically view all statuses.',
    offMsg:    '🔕 *Auto-Read Status OFF*\n\nStatus auto-reading has been disabled.',
});

// ── Auto-Like Status ───────────────────────────────────────────
ownerToggle({
    name:      'autolike',
    aliases:   ['togglelike', 'autolikestatus'],
    desc:      'Toggle auto-like of WhatsApp statuses',
    configKey: 'AUTO_LIKE_STATUS',
    onMsg:     '✅ *Auto-Like Status ON*\n\nI will automatically like all statuses.',
    offMsg:    '🔕 *Auto-Like Status OFF*\n\nStatus auto-liking has been disabled.',
});

// ── Auto-Bio ───────────────────────────────────────────────────
ownerToggle({
    name:      'autobio',
    aliases:   ['togglebio'],
    desc:      'Toggle auto-bio rotation every 10 minutes',
    configKey: 'AUTO_BIO',
    onMsg:     '✅ *Auto-Bio ON*\n\nProfile bio will rotate every 10 minutes.',
    offMsg:    '🔕 *Auto-Bio OFF*\n\nBio rotation has been stopped.',
});

// ═══════════════════════════════════════════════════════════════
//  ANTI-FLOOD
//  Removes members who send too many messages in a short window
// ═══════════════════════════════════════════════════════════════

const floodMap = new Map();   // key: `${groupJid}::${sender}` → { count, timer }
const FLOOD_LIMIT  = 7;       // messages
const FLOOD_WINDOW = 6000;    // milliseconds

addCmd({
    name:      'antiflood',
    aliases:   ['noflood'],
    desc:      'Toggle flood protection — removes members who spam quickly',
    category:  'group',
    groupOnly: true,
    adminOnly: true,
    handler:   async (ctx) => {
        if (!ctx.isBotAdmin) return ctx.sock.sendMessage(ctx.from, { text: '❌ I need to be an *admin* to remove members.', contextInfo: channelCtx() }, { quoted: ctx.m });
        const current = getGroupSettings(ctx.from).antiflood;
        if (current === undefined) {
            return ctx.sock.sendMessage(ctx.from, { text: '⚠️ Please run the bot once after this update so the DB migrates. Then try again.', contextInfo: channelCtx() }, { quoted: ctx.m });
        }
        const newVal = !current;
        setGroupSetting(ctx.from, 'antiflood', newVal);
        await ctx.reply(
            newVal
                ? `🌊 *Anti-Flood ON*\n\nMembers sending more than ${FLOOD_LIMIT} messages in ${FLOOD_WINDOW / 1000}s will be removed.`
                : '✅ *Anti-Flood OFF*\n\nFlood protection has been disabled.'
        );
    },
});

addTrigger({
    pattern: /.*/,
    handler: async (ctx) => {
        if (!ctx.isGroup) return;
        if (ctx.isAdmin || ctx.isOwner || ctx.m.fromMe) return;

        const settings = getGroupSettings(ctx.from);
        if (!settings.antiflood) return;

        const key     = `${ctx.from}::${ctx.sender}`;
        const entry   = floodMap.get(key) || { count: 0 };

        entry.count++;
        if (entry.timer) clearTimeout(entry.timer);
        entry.timer = setTimeout(() => floodMap.delete(key), FLOOD_WINDOW);
        floodMap.set(key, entry);

        if (entry.count >= FLOOD_LIMIT) {
            floodMap.delete(key);
            await ctx.sock.groupParticipantsUpdate(ctx.from, [ctx.sender], 'remove').catch(() => {});
            await ctx.send({
                text:
                    `🌊 *Anti-Flood*\n\n` +
                    `@${ctx.sender.split('@')[0]} was removed for flooding the group!\n\n` +
                    `_${config.BOT_NAME}_`,
                mentions: [ctx.sender],
            }).catch(() => {});
        }
    },
});

// ═══════════════════════════════════════════════════════════════
//  SET WARN LIMIT
//  Configure how many warnings before a member is kicked
// ═══════════════════════════════════════════════════════════════

addCmd({
    name:      'setlimit',
    aliases:   ['warnlimit', 'setwarnlimit'],
    desc:      'Set warn-kick limit for members (default: 3)',
    category:  'owner',
    ownerOnly: true,
    handler:   async (ctx) => {
        const num = parseInt(ctx.args[0]);
        if (!num || num < 1 || num > 20)
            return ctx.sock.sendMessage(ctx.from, { text: '❌ Provide a number between 1 and 20.\n\nExample: `.setlimit 5`', contextInfo: channelCtx() }, { quoted: ctx.m });
        setSetting('WARN_LIMIT', String(num));
        await ctx.sock.sendMessage(ctx.from, { text: `✅ *Warn Limit Set*\n\nMembers will be kicked after *${num}* warnings.`, contextInfo: channelCtx() }, { quoted: ctx.m });
    },
});

// ═══════════════════════════════════════════════════════════════
//  SET TIMEZONE
// ═══════════════════════════════════════════════════════════════

addCmd({
    name:      'settz',
    aliases:   ['settimezone', 'timezone'],
    desc:      'Change the bot timezone',
    category:  'owner',
    ownerOnly: true,
    handler:   async (ctx) => {
        const tz = ctx.args[0];
        if (!tz) return ctx.reply(
            '❌ Provide a timezone.\n\n' +
            'Examples:\n' +
            '`Africa/Nairobi`\n`America/New_York`\n`Europe/London`\n`Asia/Dubai`\n\n' +
            `Current: *${config.TIME_ZONE}*`
        );
        if (!moment.tz.zone(tz))
            return ctx.sock.sendMessage(ctx.from, { text: `❌ *"${tz}"* is not a valid timezone.\n\nCheck https://momentjs.com/timezone/`, contextInfo: channelCtx() }, { quoted: ctx.m });
        setSetting('TIME_ZONE', tz);
        config.TIME_ZONE = tz;
        const now = moment().tz(tz).format('hh:mm A · DD MMM YYYY');
        await ctx.sock.sendMessage(ctx.from, { text: `✅ *Timezone Updated*\n\nNew timezone: *${tz}*\nCurrent time: *${now}*`, contextInfo: channelCtx() }, { quoted: ctx.m });
    },
});

// ═══════════════════════════════════════════════════════════════
//  BOT SETTINGS OVERVIEW
// ═══════════════════════════════════════════════════════════════

const getBotName = () => config.BOT_NAME || 'LUKA-XMD';

addCmd({
    name: 'botsettings',
    aliases: ['settings', 'bsettings', 'config'],
    desc: 'View all bot and group settings',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        try {
            const botName = getBotName();

            const allSettings = [
                'ANTI_CALL',
                'ANTI_DELETE',
                'ANTI_VV',
                'ANTI_EDIT',
                'AUTO_BIO',
                'AUTO_BLOCK',
                'AUTO_JOIN',
                'AUTO_LIKE_STATUS',
                'AUTO_MUTE',
                'AUTO_REACT',
                'AUTO_READ_MESSAGES',
                'AUTO_READ_STATUS',
                'AUTO_TYPING',
                'AUTO_RECORDING',
                'AUTO_UPDATE',
                'BOT_NAME',
                'BOT_PREFIX',
                'BOT_VERSION',
                'CHATBOT',
                'CHATBOT_MODE',
                'DM_PRESENCE',
                'MENU_THEME',
                'MODE',
                'OWNER_NAME',
                'OWNER_NUMBER',
                'PACK_AUTHOR',
                'PACK_NAME',
                'STARTING_MESSAGE',
                'STATUS_LIKE_EMOJIS',
                'STATUS_REACT_EMOJI',
                'STATUS_REPLY_TEXT',
                'SUDO_NUMBERS',
                'TIME_ZONE',
                'WHATSAPP_USERNAME',
            ];

            const formatValue = (value) => {
                if (value === undefined || value === null || value === '') {
                    return 'Not Set';
                }

                if (typeof value === 'object') {
                    return JSON.stringify(value);
                }

                if (value === true || String(value).toLowerCase() === 'true') {
                    return 'ON';
                }

                if (value === false || String(value).toLowerCase() === 'false') {
                    return 'OFF';
                }

                return String(value);
            };

            // Database first, config fallback
            const getValue = (key) => {
                const dbValue = getSetting(key, undefined);

                if (
                    dbValue !== undefined &&
                    dbValue !== null &&
                    dbValue !== ''
                ) {
                    return dbValue;
                }

                if (config[key] !== undefined && config[key] !== null) {
                    return config[key];
                }

                return 'Not Set';
            };

            let text =
                `╭══✦ ✦═⊷\n` +
                `      *${botName} SETTINGS*\n` +
                `╰══✦ ✦══⊷\n\n`;

            for (const key of allSettings) {
                let value = getValue(key);

                if (key === 'WHATSAPP_USERNAME' && value !== 'Not Set') {
                    value = `@${String(value).replace(/^@/, '')}`;
                }

                text += `▸ *${key}:* ${formatValue(value)}\n`;
            }

            const sudoUsers = getValue('SUDO_USERS');

            text += `\n▸ *SUDO_USERS:* ${formatValue(sudoUsers)}\n`;

            const groupSettings = getGroupSettings(ctx.from) || {};

            const groupValue = (...keys) => {
                for (const key of keys) {
                    if (
                        groupSettings[key] !== undefined &&
                        groupSettings[key] !== null
                    ) {
                        return formatValue(groupSettings[key]);
                    }
                }

                return 'None';
            };

            text +=
                `\n╭══✦ ✦═⊷\n` +
                `      📋 *GROUP SETTINGS*\n` +
                `╰══✦ ✦══⊷\n\n`;

            text += `*🎉 WELCOME MESSAGE:*\n${groupValue('welcomeMessage', 'welcome', 'welcomemsg')}\n\n`;

            text += `*👋 GOODBYE MESSAGE:*\n${groupValue('goodbyeMessage', 'goodbye', 'goodbyemsg')}\n\n`;

            text += `*📢 GROUP EVENTS:*\n${groupValue('groupEvents', 'events')}\n\n`;

            text += `*🔗 ANTILINK:*\n${groupValue('antilink', 'antilinkAction')}\n\n`;

            text += `*🚫 ANTIBAD:*\n${groupValue('antibad', 'badwords')}\n\n`;

            text += `*🛡️ ANTI-GROUP-MENTION:*\n${groupValue('antigroupmention', 'antiGroupMention')}\n\n`;

            text += `*🌊 ANTI-FLOOD:*\n${groupValue('antiflood')}\n\n`;

            text += `*🚫 ANTI-STICKER:*\n${groupValue('antisticker')}\n\n`;

            text += '\n_ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ_';

            const card = {
                title: `⚙️ ${botName} SETTINGS`,
                text,
                footer: botName,
                buttons: []
            };

            await sendButtons(
                ctx.sock,
                ctx.from,
                card,
                { quoted: ctx.m }
            ).catch(async () => {
                await ctx.sock.sendMessage(
                    ctx.from,
                    {
                        text,
                        contextInfo: channelCtx()
                    },
                    { quoted: ctx.m }
                );
            });

        } catch (error) {
            console.error('[BOT SETTINGS ERROR]', error);

            await ctx.reply(
                `❌ Failed to load settings.\n${error.message || error}`
            );
        }
    },
});

// ═══════════════════════════════════════════════════════════════
//  GHOST MODE
//  Disables read receipts — bot reads messages silently
// ═══════════════════════════════════════════════════════════════

addCmd({
    name:      'ghostmode',
    aliases:   ['ghost', 'toggleghost'],
    desc:      'Toggle ghost mode — hide read receipts',
    category:  'owner',
    ownerOnly: true,
    handler:   async (ctx) => {
        const current = getSetting('GHOST_MODE', 'false') === 'true';
        const newVal  = !current;
        setSetting('GHOST_MODE', String(newVal));
        config.GHOST_MODE = newVal;
        try {
            await ctx.sock.updatePrivacySettings?.('readreceipts', newVal ? 'none' : 'all').catch(() => {});
        } catch {}
        await ctx.reply(
            newVal
                ? '👻 *Ghost Mode ON*\n\nRead receipts are now hidden. I read silently.'
                : '👁️ *Ghost Mode OFF*\n\nRead receipts are now visible.'
        );
    },
});

// ═══════════════════════════════════════════════════════════════
//  FREEZE LAST SEEN
//  Hides last seen from everyone
// ═══════════════════════════════════════════════════════════════

addCmd({
    name:      'freezelastseen',
    aliases:   ['freezels', 'hidelastseen'],
    desc:      'Toggle hiding last seen from contacts',
    category:  'owner',
    ownerOnly: true,
    handler:   async (ctx) => {
        const current = getSetting('FREEZE_LAST_SEEN', 'false') === 'true';
        const newVal  = !current;
        setSetting('FREEZE_LAST_SEEN', String(newVal));
        config.FREEZE_LAST_SEEN = newVal;
        try {
            await ctx.sock.updateLastSeenPrivacy?.(newVal ? 'none' : 'contacts').catch(() => {});
        } catch {}
        await ctx.reply(
            newVal
                ? '🧊 *Last Seen Frozen*\n\nNobody can see my last seen anymore.'
                : '🕐 *Last Seen Visible*\n\nLast seen is now visible to contacts.'
        );
    },
});

// ═══════════════════════════════════════════════════════════════
//  STATUS REPLY
//  Auto-reply to statuses with a custom message
// ═══════════════════════════════════════════════════════════════

addCmd({
    name:      'statusreply',
    aliases:   ['togglestatusreply', 'autoreplystatuses'],
    desc:      'Toggle auto-reply to statuses',
    category:  'owner',
    ownerOnly: true,
    handler:   async (ctx) => {
        const current = getSetting('STATUS_REPLY', 'false') === 'true';
        const newVal  = !current;
        setSetting('STATUS_REPLY', String(newVal));
        config.STATUS_REPLY = newVal;
        await ctx.reply(
            newVal
                ? '💬 *Status Reply ON*\n\nI will auto-reply to statuses.'
                : '🔕 *Status Reply OFF*\n\nAuto status reply disabled.'
        );
    },
});

addCmd({
    name:      'setstatusmsg',
    aliases:   ['statusmsg'],
    desc:      'Set the message to auto-reply on statuses',
    category:  'owner',
    ownerOnly: true,
    handler:   async (ctx) => {
        const msg = ctx.text;
        if (!msg) return ctx.reply('📝 Usage: `.setstatusmsg <message>`\n\nExample: `.setstatusmsg Nice status! 🔥`');
        setSetting('STATUS_MSG', msg);
        config.STATUS_MSG = msg;
        await ctx.reply(`✅ *Status Reply Message Set*\n\n> ${msg}`);
    },
});

// ═══════════════════════════════════════════════════════════════
//  SET REACT EMOJIS
//  Change the random emoji pool used by auto-react
// ═══════════════════════════════════════════════════════════════

addCmd({
    name:      'setreactemoji',
    aliases:   ['reactemojis', 'setemoji'],
    desc:      'Set custom auto-react emojis (comma-separated)',
    category:  'owner',
    ownerOnly: true,
    handler:   async (ctx) => {
        const raw = ctx.text;
        if (!raw) return ctx.reply(
            '📝 Usage: `.setreactemoji 🔥,❤️,😎,✨`\n\n' +
            `Current emojis: \`${config.CUSTOM_REACT_EMOJIS}\``
        );
        const emojis = raw.split(',').map(e => e.trim()).filter(Boolean);
        if (emojis.length < 2) return ctx.reply('❌ Provide at least 2 emojis separated by commas.');
        const joined = emojis.join(',');
        setSetting('CUSTOM_REACT_EMOJIS', joined);
        config.CUSTOM_REACT_EMOJIS = joined;
        await ctx.reply(`✅ *React Emojis Updated*\n\nNew pool: ${emojis.join(' ')}`);
    },
});

// ═══════════════════════════════════════════════════════════════
//  WARN LIST  /  RESET WARNS
//  View and clear user warnings in a group
// ═══════════════════════════════════════════════════════════════

addCmd({
    name:      'warnlist',
    aliases:   ['warnings', 'listwarns'],
    desc:      'List all warned users in this group',
    category:  'group',
    groupOnly: true,
    adminOnly: true,
    handler:   async (ctx) => {
        const { getAllWarnings } = require('../../guru/db/database');
        const warns = getAllWarnings(ctx.from);
        if (!warns || !warns.length)
            return ctx.reply('✅ No warnings have been issued in this group yet.');

        // Group by JID
        const grouped = {};
        for (const w of warns) {
            grouped[w.jid] = grouped[w.jid] || [];
            grouped[w.jid].push(w.reason || 'No reason given');
        }
        const lines = Object.entries(grouped).map(([jid, reasons]) =>
            `👤 @${jid.split('@')[0]}  ─  *${reasons.length} warn(s)*\n   └ ${reasons.slice(-1)[0]}`
        );
        const limit = getSetting('WARN_LIMIT', '3');
        await ctx.send({
            text: `⚠️ *Warned Users* (Limit: ${limit})\n\n${lines.join('\n\n')}\n\n_${config.BOT_NAME}_`,
            mentions: Object.keys(grouped),
        });
    },
});

addCmd({
    name:      'resetwarns',
    aliases:   ['clearwarns', 'resetwarn'],
    desc:      'Clear all warnings for a user (reply or mention)',
    category:  'group',
    groupOnly: true,
    adminOnly: true,
    handler:   async (ctx) => {
        const target = ctx.quoted?.sender
            || (ctx.m?.mentioned?.[0])
            || (ctx.args[0] ? ctx.args[0].replace(/\D/g, '') + '@s.whatsapp.net' : null);
        if (!target) return ctx.reply('❌ Reply to a user\'s message or mention them.\n\nExample: `.resetwarns @user`');
        const { clearWarnings } = require('../../guru/db/database');
        if (clearWarnings) clearWarnings(target, ctx.from);
        await ctx.send({
            text: `✅ *Warnings Cleared*\n\nAll warnings for @${target.split('@')[0]} have been reset.`,
            mentions: [target],
        });
    },
});

// ═══════════════════════════════════════════════════════════════
//  ANTISTICKER  — block stickers in groups
// ═══════════════════════════════════════════════════════════════

addCmd({
    name:      'antisticker',
    aliases:   ['nosticker', 'blocksticker'],
    desc:      'Toggle antisticker — delete stickers sent in group',
    category:  'group',
    groupOnly: true,
    adminOnly: true,
    handler:   async (ctx) => {
        if (!ctx.isBotAdmin) return ctx.reply('❌ I need to be an *admin* to delete messages.');
        const current = getGroupSettings(ctx.from).antisticker;
        const newVal  = !current;
        setGroupSetting(ctx.from, 'antisticker', newVal);
        await ctx.reply(
            newVal
                ? '🚫 *Anti-Sticker ON*\n\nStickers sent in this group will be deleted.'
                : '✅ *Anti-Sticker OFF*\n\nSticker protection disabled.'
        );
    },
});

// ═══════════════════════════════════════════════════════════════
//  SET OWNER NAME  (runtime update)
// ═══════════════════════════════════════════════════════════════

addCmd({
    name:      'setownername',
    aliases:   ['ownername'],
    desc:      'Change the bot owner name at runtime',
    category:  'owner',
    ownerOnly: true,
    handler:   async (ctx) => {
        const name = ctx.text;
        if (!name) return ctx.reply('❌ Provide a name.\n\nExample: `.setownername GuruTech`');
        setSetting('OWNER_NAME', name);
        config.OWNER_NAME = name;
        await ctx.reply(`✅ *Owner Name Updated*\n\nNew name: *${name}*`);
    },
});

// ═══════════════════════════════════════════════════════════════
//  ADDCMD CONVERSION — EXTRA OWNER SETTINGS
//  Converted from gmd() to addCmd()
// ═══════════════════════════════════════════════════════════════

function parseBooleanInput(input) {
    if (input === undefined || input === null) return null;

    const value = String(input).trim().toLowerCase();

    if (['on', 'true', 'yes', 'enable', 'enabled'].includes(value)) {
        return 'true';
    }

    if (['off', 'false', 'no', 'disable', 'disabled'].includes(value)) {
        return 'false';
    }

    return null;
}

function formatBoolDisplay(value) {
    return String(value).toLowerCase() === 'true' ? 'ON' : 'OFF';
}

async function saveOwnerSetting(ctx, key, value, successMessage) {
    await setSetting(key, String(value));
    config[key] = value;
    await ctx.reply(successMessage);
}

function addOwnerBoolCommand({
    name,
    aliases = [],
    key,
    description,
    extraNote = '',
}) {
    addCmd({
        name,
        aliases,
        desc: description,
        category: 'owner',
        ownerOnly: true,
        handler: async (ctx) => {
            const value = parseBooleanInput(ctx.text);

            if (!value) {
                return ctx.reply(`❌ Please specify: on or off\n\nExample: .${name} on`);
            }

            try {
                const current = String(getSetting(key, config[key] ?? 'false'));

                if (current === value) {
                    return ctx.reply(
                        `⚠️ ${name} is already: *${formatBoolDisplay(value)}*`
                    );
                }

                await setSetting(key, value);
                config[key] = value === 'true';

                await ctx.reply(
                    `✅ *${name}* set to: *${formatBoolDisplay(value)}*` +
                    (extraNote ? `\n\n⚠️ ${extraNote}` : '')
                );
            } catch (error) {
                await ctx.reply(`❌ Error: ${error.message}`);
            }
        },
    });
}

// ── Set Auto-Like Status ───────────────────────────────────────

addOwnerBoolCommand({
    name: 'setautolikestatus',
    aliases: ['autolikestatus', 'autostatuslike', 'statuslike', 'likestatus'],
    key: 'AUTO_LIKE_STATUS',
    description: 'Set auto-like status on/off',
    extraNote: 'Auto-like works when autoreadstatus is also ON.',
});

// ── Set Auto-Read Status ───────────────────────────────────────

addOwnerBoolCommand({
    name: 'setautoreadstatus',
    aliases: ['readstatus', 'viewstatus'],
    key: 'AUTO_READ_STATUS',
    description: 'Set auto-read status on/off',
});

// ── Set Status Emojis ──────────────────────────────────────────

addCmd({
    name: 'setstatusemojis',
    aliases: ['statusemojis', 'likeemojis'],
    desc: 'Set status like emojis, comma separated',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        const value = ctx.text?.trim();

        if (!value) {
            return ctx.reply(
                '❌ Please provide emojis separated by commas!\n' +
                'Example: .setstatusemojis 💚,💛,❤️,💜'
            );
        }

        // Remove empty entries and duplicate emojis
        const emojis = [...new Set(
            value.split(',')
                .map(emoji => emoji.trim())
                .filter(Boolean)
        )];

        if (!emojis.length) {
            return ctx.reply('❌ No valid emojis provided.');
        }

        const emojiValue = emojis.join(',');

        try {
            const current = String(
                getSetting('STATUS_LIKE_EMOJIS', '') || ''
            ).trim();

            if (current === emojiValue) {
                return ctx.reply(
                    `⚠️ Status emojis are already set to: *${emojiValue}*`
                );
            }

            await setSetting('STATUS_LIKE_EMOJIS', emojiValue);

            // Update the runtime configuration
            config.STATUS_LIKE_EMOJIS = emojiValue;

            await ctx.reply(`✅ Status emojis updated!\n💚 ${emojiValue}`);
        } catch (error) {
            console.error('[SET STATUS EMOJIS]', error);

            await ctx.reply(
                `❌ Failed to save status emojis:\n${error.message}`
            );
        }
    }
});
// ── Set Status Reply Text ──────────────────────────────────────

addCmd({
    name: 'setstatusreplytext',
    aliases: ['statusreplytext'],
    desc: 'Set status reply text',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const value = ctx.text?.trim();

        if (!value) return ctx.reply('❌ Please provide reply text!');

        try {
            const current = getSetting('STATUS_REPLY_TEXT', '');

            if (String(current) === value) {
                return ctx.reply('⚠️ Status reply text is already set to this value!');
            }

            await setSetting('STATUS_REPLY_TEXT', value);
            config.STATUS_REPLY_TEXT = value;

            await ctx.reply('✅ Status reply text updated!');
        } catch (error) {
            await ctx.reply(`❌ Error: ${error.message}`);
        }
    },
});

// ── Set Auto-React Mode ────────────────────────────────────────

addCmd({
    name: 'setautoreact',
    aliases: ['react'],
    desc: 'Set auto-react mode',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const input = (ctx.text || '').toLowerCase().trim();
        const validModes = ['on', 'all', 'dm', 'groups', 'commands', 'off'];

        if (!validModes.includes(input)) {
            return ctx.reply(
                '❌ Please specify a valid mode:\n' +
                '• on/all - React to all messages\n' +
                '• dm - React to private chats only\n' +
                '• groups - React to group messages only\n' +
                '• commands - React to bot commands only\n' +
                '• off - Disable auto react'
            );
        }

        const value = input === 'on' ? 'all' : input;

        try {
            const current = getSetting('AUTO_REACT', '');

            if (String(current) === value) {
                return ctx.reply(`⚠️ Auto react is already: *${value.toUpperCase()}*`);
            }

            await setSetting('AUTO_REACT', value);
            config.AUTO_REACT = value;

            await ctx.reply(`✅ Auto react set to: *${value.toUpperCase()}*`);
        } catch (error) {
            await ctx.reply(`❌ Error: ${error.message}`);
        }
    },
});

// ── Set Auto-Reply ─────────────────────────────────────────────

addOwnerBoolCommand({
    name: 'setautoreply',
    aliases: [],
    key: 'AUTO_REPLY',
    description: 'Set auto-reply on/off',
});


// ── Set Auto-Block Country Codes ───────────────────────────────

addCmd({
    name: 'setautoblock',
    aliases: ['blockcountry'],
    desc: 'Set auto-block country codes or disable it',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const value = ctx.text?.trim() || '';

        try {
            const current = getSetting('AUTO_BLOCK', '');

            if (String(current) === value) {
                return ctx.reply(
                    value
                        ? `⚠️ Auto block is already set to: *${value}*`
                        : '⚠️ Auto block is already disabled!'
                );
            }

            await setSetting('AUTO_BLOCK', value);
            config.AUTO_BLOCK = value;

            await ctx.reply(
                value
                    ? `✅ Auto block set for country codes: *${value}*`
                    : '✅ Auto block disabled'
            );
        } catch (error) {
            await ctx.reply(`❌ Error: ${error.message}`);
        }
    },
});

// ── Set Auto-Read Messages Mode ────────────────────────────────

addCmd({
    name: 'setautoread',
    aliases: ['readmessages'],
    desc: 'Set auto-read messages mode',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const input = (ctx.text || '').toLowerCase().trim();
        const validModes = ['on', 'all', 'dm', 'groups', 'commands', 'off'];

        if (!validModes.includes(input)) {
            return ctx.reply(
                '❌ Please specify a valid mode:\n' +
                '• on/all - Read all messages\n' +
                '• dm - Read private chats only\n' +
                '• groups - Read group messages only\n' +
                '• commands - Read bot commands only\n' +
                '• off - Disable auto read'
            );
        }

        const value = input === 'on' ? 'all' : input;

        try {
            const current = getSetting('AUTO_READ_MESSAGES', '');

            if (String(current) === value) {
                return ctx.reply(
                    `⚠️ Auto read messages is already: *${value.toUpperCase()}*`
                );
            }

            await setSetting('AUTO_READ_MESSAGES', value);
            config.AUTO_READ_MESSAGES = value;

            await ctx.reply(`✅ Auto read messages set to: *${value.toUpperCase()}*`);
        } catch (error) {
            await ctx.reply(`❌ Error: ${error.message}`);
        }
    },
});

// ── Set YouTube Link ───────────────────────────────────────────

addCmd({
    name: 'setytlink',
    aliases: ['ytlink', 'youtube', 'setyt'],
    desc: 'Set YouTube channel link',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const value = ctx.text?.trim();
        if (!value) return ctx.reply('❌ Please provide a YouTube link!');

        try {
            const current = getSetting('YT', '');

            if (String(current) === value) {
                return ctx.reply(`⚠️ YouTube link is already set to: *${value}*`);
            }

            await setSetting('YT', value);
            config.YT = value;

            await ctx.reply(`✅ YouTube link set to: *${value}*`);
        } catch (error) {
            await ctx.reply(`❌ Error: ${error.message}`);
        }
    },
});

// ── Set Newsletter JID ────────────────────────────────────────

addCmd({
    name: 'setnewsletterjid',
    aliases: ['newsletterjid', 'channeljid'],
    desc: 'Set newsletter JID',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const value = ctx.text?.trim();
        if (!value) return ctx.reply('❌ Please provide a newsletter JID!');

        try {
            await setSetting('NEWSLETTER_JID', value);
            config.NEWSLETTER_JID = value;
            await ctx.reply('✅ Newsletter JID set!');
        } catch (error) {
            await ctx.reply(`❌ Error: ${error.message}`);
        }
    },
});

// ── Set Group JID ──────────────────────────────────────────────

addCmd({
    name: 'setgcjid',
    aliases: ['gcjid', 'groupjid', 'supportgc'],
    desc: 'Set group chat JID or invite code',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const value = ctx.text?.trim();
        if (!value) return ctx.reply('❌ Please provide a group JID or invite code!');

        try {
            await setSetting('GC_JID', value);
            config.GC_JID = value;
            await ctx.reply('✅ Group JID set!');
        } catch (error) {
            await ctx.reply(`❌ Error: ${error.message}`);
        }
    },
});

// ── Set Newsletter URL ────────────────────────────────────────

addCmd({
    name: 'setnewsletterurl',
    aliases: ['newsletterurl', 'channelurl'],
    desc: 'Set newsletter URL',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const value = ctx.text?.trim();
        if (!value) return ctx.reply('❌ Please provide a newsletter URL!');

        try {
            await setSetting('NEWSLETTER_URL', value);
            config.NEWSLETTER_URL = value;
            await ctx.reply('✅ Newsletter URL set!');
        } catch (error) {
            await ctx.reply(`❌ Error: ${error.message}`);
        }
    },
});

// ── Set Sticker Pack Name ──────────────────────────────────────

addCmd({
    name: 'setpackname',
    aliases: ['packname', 'stickerpack', 'stickername'],
    desc: 'Set sticker pack name',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const value = ctx.text?.trim();
        if (!value) return ctx.reply('❌ Please provide a pack name!');

        try {
            await setSetting('PACK_NAME', value);
            config.PACK_NAME = value;
            await ctx.reply(`✅ Pack name set to: *${value}*`);
        } catch (error) {
            await ctx.reply(`❌ Error: ${error.message}`);
        }
    },
});

// ── Set Sticker Pack Author ────────────────────────────────────

addCmd({
    name: 'setpackauthor',
    aliases: ['packauthor', 'stickerauthor'],
    desc: 'Set sticker pack author',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const value = ctx.text?.trim();
        if (!value) return ctx.reply('❌ Please provide a pack author!');

        try {
            await setSetting('PACK_AUTHOR', value);
            config.PACK_AUTHOR = value;
            await ctx.reply(`✅ Pack author set to: *${value}*`);
        } catch (error) {
            await ctx.reply(`❌ Error: ${error.message}`);
        }
    },
});

// ── Get Setting ────────────────────────────────────────────────

addCmd({
    name: 'getsetting',
    aliases: ['getconfig', 'viewsetting'],
    desc: 'Get a setting value',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const key = ctx.args[0]?.toUpperCase().trim();
        if (!key) {
            return ctx.reply('❌ Please provide a setting key!\nExample: .getsetting PREFIX');
        }

        try {
            const value = getSetting(key, config[key] ?? 'Not Set');
            await ctx.reply(`⚙️ *${key}:* ${value ?? 'Not Set'}`);
        } catch (error) {
            await ctx.reply(`❌ Error: ${error.message}`);
        }
    },
});

// ── Set Any Setting ────────────────────────────────────────────

addCmd({
    name: 'setsetting',
    aliases: ['setconfig'],
    desc: 'Set any setting using key and value',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const key = ctx.args[0]?.toUpperCase().trim();
        const value = ctx.args.slice(1).join(' ').trim();

        if (!key || !value) {
            return ctx.reply('❌ Usage: .setsetting <key> <value>\nExample: .setsetting PREFIX !');
        }

        try {
            const current = getSetting(key, '');

            if (String(current) === value) {
                return ctx.reply(`⚠️ *${key}* is already set to: *${value}*`);
            }

            await setSetting(key, value);
            config[key] = value;

            await ctx.reply(`✅ *${key}* set to: *${value}*`);
        } catch (error) {
            await ctx.reply(`❌ Error: ${error.message}`);
        }
    },
});

// ── Reset One Setting ──────────────────────────────────────────

addCmd({
    name: 'resetsetting',
    aliases: ['resetconfig', 'defaultsetting'],
    desc: 'Reset a setting to its default',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const key = ctx.args[0]?.toUpperCase().trim();
        if (!key) return ctx.reply('❌ Please provide a setting key to reset!');

        try {
            if (typeof resetSetting !== 'function') {
                return ctx.reply('❌ resetSetting() is not exported by your database module.');
            }

            const defaultValue = await resetSetting(key);
            if (config[key] !== undefined) config[key] = defaultValue;

            await ctx.reply(
                `✅ *${key}* reset to default: *${defaultValue ?? 'Not Set'}*`
            );
        } catch (error) {
            await ctx.reply(`❌ Error: ${error.message}`);
        }
    },
});

// ── Reset All Settings ─────────────────────────────────────────

addCmd({
    name: 'resetallsettings',
    aliases: ['resetsettings', 'resetall', 'defaultsettings'],
    desc: 'Reset all settings to defaults',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        try {
            if (typeof resetAllSettings !== 'function') {
                return ctx.reply('❌ resetAllSettings() is not exported by your database module.');
            }

            await resetAllSettings();
            await ctx.reply('✅ All settings have been reset to defaults!');
        } catch (error) {
            await ctx.reply(`❌ Error: ${error.message}`);
        }
    },
});

// ── Set Auto-Reply Status ──────────────────────────────────────

addOwnerBoolCommand({
    name: 'setautoreplystatus',
    aliases: ['autoreplystatus', 'replystatusauto'],
    key: 'AUTO_REPLY_STATUS',
    description: 'Set auto-reply to status on/off',
    extraNote: 'Auto reply to status works when autoreadstatus is ON.',
});

// ── Set PM Permit ──────────────────────────────────────────────

addOwnerBoolCommand({
    name: 'setpmpermit',
    aliases: ['pmpermit'],
    key: 'PM_PERMIT',
    description: 'Set PM permit on/off',
});

// ── Reset Sudo Numbers ─────────────────────────────────────────

addCmd({
    name: 'resetsudo',
    aliases: ['deleteallsudos', 'resetsudos', 'clearsudo', 'clearsudos'],
    desc: 'Remove all sudo numbers from database',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        try {
            if (
                typeof getSudoNumbers !== 'function' ||
                typeof clearAllSudo !== 'function'
            ) {
                return ctx.reply(
                    '❌ getSudoNumbers() or clearAllSudo() is missing from database module.'
                );
            }

            const sudoList = await getSudoNumbers();

            if (!sudoList || sudoList.length === 0) {
                return ctx.reply('⚠️ No sudo numbers to remove.');
            }

            const count = await clearAllSudo();
            await ctx.reply(`✅ Removed *${count ?? sudoList.length}* sudo number(s) from database.`);
        } catch (error) {
            await ctx.reply(`❌ Error: ${error.message}`);
        }
    },
});

// ── Set Owner Number ──────────────────────────────────────────

addCmd({
    name: 'setownernumber',
    aliases: ['ownernumber'],
    desc: 'Set bot owner number',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        const number = ctx.text?.replace(/\D/g, '');

        if (!number || number.length < 7) {
            return ctx.reply('❌ Example: .setownernumber 255768619068');
        }

        try {
            await setSetting('OWNER_NUMBER', number);

            config.OWNER_NUMBER = number;
            config.OWNER = number;
            config.ownerNumber = number;

            await ctx.reply(`✅ Owner number updated to +${number}`);
        } catch (error) {
            console.error('[SET OWNER NUMBER]', error);
            await ctx.reply(`❌ ${error.message}`);
        }
    },
});

// ── Set Anti-Call ──────────────────────────────────────────────

addOwnerBoolCommand({
    name: 'setanticall',
    aliases: ['anticall'],
    key: 'ANTI_CALL',
    description: 'Set anti-call on/off',
});

// ── Set Prefix ────────────────────────────────────────────────

addCmd({
    name: 'setprefix',
    aliases: ['prefix'],
    desc: 'Set bot command prefix',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const value = ctx.text?.trim();

        if (!value || value.length > 5) {
            return ctx.reply('❌ Provide a prefix (1-5 characters).\nExample: .setprefix !');
        }

        try {
            await setSetting('BOT_PREFIX', value);
            config.BOT_PREFIX = value;
            config.PREFIX = value;

            await ctx.reply(`✅ Bot prefix updated to: *${value}*`);
        } catch (error) {
            await ctx.reply(`❌ Error: ${error.message}`);
        }
    },
});

// ── Reset Database ─────────────────────────────────────────────

addCmd({
    name: 'resetdb',
    aliases: ['resetdatabase', 'wipedatabase', 'wipedb', 'factoryreset'],
    desc: 'Reset bot settings database',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const confirm = ctx.args[0]?.toLowerCase();

        if (confirm !== 'confirm') {
            return ctx.reply(
                '⚠️ *WARNING: This will reset bot settings!*\n\n' +
                'To confirm, type:\n*.resetdb confirm*'
            );
        }

        try {
            if (typeof resetAllSettings !== 'function') {
                return ctx.reply('❌ resetAllSettings() is not exported by your database module.');
            }

            await resetAllSettings();

            if (typeof clearAllSudo === 'function') {
                await clearAllSudo();
            }

            await ctx.reply(
                '✅ Bot settings database has been reset.\n' +
                'Group settings are not modified by this command.'
            );
        } catch (error) {
            await ctx.reply(`❌ Error: ${error.message}`);
        }
    },
});

// ═══════════════════════════════════════════════════════════════
//  WHATSAPP USERNAME SETTINGS
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'setusername',
    aliases: ['setwausername', 'wausername'],
    desc: 'Set WhatsApp username',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        const username = ctx.text?.trim();

        if (!username) {
            return ctx.reply(
                '❌ Provide a username.\nExample: `.setusername lukabrand`\nDisable: `.setusername off`'
            );
        }

        try {
            if (username.toLowerCase() === 'off') {
                await setSetting('WHATSAPP_USERNAME', '');
                config.WHATSAPP_USERNAME = '';

                return ctx.reply('✅ Username cleared.');
            }

            if (!/^[a-zA-Z0-9._]{3,30}$/.test(username)) {
                return ctx.reply(
                    '❌ Invalid username. Use 3–30 letters, numbers, dots or underscores.'
                );
            }

            await setSetting('WHATSAPP_USERNAME', username);
            config.WHATSAPP_USERNAME = username;

            return ctx.reply(`✅ Username saved: @${username}`);

        } catch (error) {
            console.error('[SET WHATSAPP USERNAME]', error);
            return ctx.reply(`❌ Error: ${error.message}`);
        }
    },
});

// ═══════════════════════════════════════════════════════════════
//  GET WHATSAPP USERNAME
// ═══════════════════════════════════════════════════════════════

addCmd({
    name: 'getusername',
    aliases: ['myusername', 'wauser'],
    desc: 'View saved WhatsApp username',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        try {
            const username = getSetting(
                'WHATSAPP_USERNAME',
                config.WHATSAPP_USERNAME || ''
            );

            if (!username) {
                return ctx.reply(
                    '⚠️ No username saved. Use `.setusername <username>`'
                );
            }

            return ctx.reply(`👤 @${username}`);

        } catch (error) {
            console.error('[GET WHATSAPP USERNAME]', error);
            return ctx.reply(`❌ Error: ${error.message}`);
        }
    },
});
