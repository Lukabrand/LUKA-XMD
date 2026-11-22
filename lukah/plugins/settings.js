
'use strict';

const { addCmd, addTrigger } = require('../../luka/handlers/loader');
const {
    getSetting, setSetting, getGroupSettings, setGroupSetting,
    resetSetting, resetAllSettings, getSudoNumbers, clearAllSudo,
    getAllWarnings, clearWarnings
} = require('../../luka/db/database');

const config = require('../../luka/config/settings');
const moment = require('moment-timezone');
const { channelCtx, sendButtons } = require('../../luka/utils/gmdFunctions2');

function parseBooleanInput(input) {
    if (input === undefined || input === null) return null;
    const value = String(input).trim().toLowerCase();

    if (['on', 'true', 'yes', 'enable', 'enabled'].includes(value)) return 'true';
    if (['off', 'false', 'no', 'disable', 'disabled'].includes(value)) return 'false';

    return null;
}

function formatBoolDisplay(value) {
    return String(value).toLowerCase() === 'true' ? 'ON' : 'OFF';
}

function ownerToggle({ name, aliases = [], desc, configKey, onMsg, offMsg }) {
    addCmd({
        name, aliases, desc, category: 'owner', ownerOnly: true,
        handler: async (ctx) => {
            const arg = ctx.args[0]?.toLowerCase();
            const current = String(config[configKey]).toLowerCase() === 'true';
            const newVal = arg === 'on' ? true : arg === 'off' ? false : !current;

            await setSetting(configKey, String(newVal));
            config[configKey] = newVal;
            await ctx.reply(newVal ? onMsg : offMsg);
        }
    });
}

function addOwnerBoolCommand({ name, aliases = [], key, description, extraNote = '' }) {
    addCmd({
        name, aliases, desc: description, category: 'owner', ownerOnly: true,
        handler: async (ctx) => {
            const value = parseBooleanInput(ctx.text);

            if (!value) {
                return ctx.reply(`❌ Please specify on or off.\n\nExample: .${name} on`);
            }

            try {
                const current = String(getSetting(key, config[key] ?? 'false')).toLowerCase();

                if (current === value) {
                    return ctx.reply(`⚠️ ${name} is already: *${formatBoolDisplay(value)}*`);
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
        }
    });
}

// OWNER TOGGLES

ownerToggle({
    name: 'autoreact',
    aliases: ['togglereact'],
    desc: 'Toggle auto-react on incoming messages',
    configKey: 'AUTO_REACT',
    onMsg: '✅ *Auto-React ON*\n\nI will react to incoming messages.',
    offMsg: '🔕 *Auto-React OFF*\n\nAuto-react has been disabled.'
});

ownerToggle({
    name: 'autobio',
    aliases: ['togglebio'],
    desc: 'Toggle auto-bio rotation',
    configKey: 'AUTO_BIO',
    onMsg: '✅ *Auto-Bio ON*\n\nProfile bio will rotate every 10 minutes.',
    offMsg: '🔕 *Auto-Bio OFF*\n\nBio rotation has been stopped.'
});

// AUTO-LIKE STATUS

addCmd({
    name: 'setautolikestatus',
    aliases: ['autolikestatus', 'autostatuslike', 'statuslike', 'likestatus', 'autolike'],
    desc: 'Set auto-like status on/off',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const value = parseBooleanInput(ctx.text);

        if (!value) {
            return ctx.reply('❌ Please specify on or off.\n\nExample: .setautolikestatus on');
        }

        try {
            const current = String(
                getSetting('AUTO_LIKE_STATUS', config.AUTO_LIKE_STATUS ?? 'false')
            ).toLowerCase();

            if (current === value) {
                return ctx.reply(`⚠️ Auto-like status is already: *${formatBoolDisplay(value)}*`);
            }

            await setSetting('AUTO_LIKE_STATUS', value);
            config.AUTO_LIKE_STATUS = value === 'true';

            await ctx.reply(
                `✅ Auto-like status set to: *${formatBoolDisplay(value)}*\n\n` +
                '⚠️ Auto-like works when auto-read status is also ON.'
            );
        } catch (error) {
            await ctx.reply(`❌ Error: ${error.message}`);
        }
    }
});

// AUTO-READ STATUS

addCmd({
    name: 'setautoreadstatus',
    aliases: ['autoreadstatus', 'readstatus', 'viewstatus'],
    desc: 'Set auto-read status on/off',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const value = parseBooleanInput(ctx.text);

        if (!value) {
            return ctx.reply('❌ Please specify on or off.\n\nExample: .setautoreadstatus on');
        }

        try {
            const current = String(
                getSetting('AUTO_READ_STATUS', config.AUTO_READ_STATUS ?? 'false')
            ).toLowerCase();

            if (current === value) {
                return ctx.reply(`⚠️ Auto-read status is already: *${formatBoolDisplay(value)}*`);
            }

            await setSetting('AUTO_READ_STATUS', value);
            config.AUTO_READ_STATUS = value === 'true';

            await ctx.reply(`✅ Auto-read status set to: *${formatBoolDisplay(value)}*`);
        } catch (error) {
            await ctx.reply(`❌ Error: ${error.message}`);
        }
    }
});

// ANTI-FLOOD

const floodMap = new Map();
const FLOOD_LIMIT = 7;
const FLOOD_WINDOW = 6000;

addCmd({
    name: 'antiflood',
    aliases: ['noflood'],
    desc: 'Toggle flood protection',
    category: 'group',
    groupOnly: true,
    adminOnly: true,
    handler: async (ctx) => {
        if (!ctx.isBotAdmin) {
            return ctx.sock.sendMessage(
                ctx.from,
                { text: '❌ I need to be an *admin* to remove members.', contextInfo: channelCtx() },
                { quoted: ctx.m }
            );
        }

        const current = getGroupSettings(ctx.from).antiflood;

        if (current === undefined) {
            return ctx.reply('⚠️ Please run the bot once after this update so the DB migrates.');
        }

        const newVal = !current;
        setGroupSetting(ctx.from, 'antiflood', newVal);

        await ctx.reply(
            newVal
                ? `🌊 *Anti-Flood ON*\n\nMembers sending more than ${FLOOD_LIMIT} messages in ${FLOOD_WINDOW / 1000}s will be removed.`
                : '✅ *Anti-Flood OFF*\n\nFlood protection has been disabled.'
        );
    }
});

addTrigger({
    pattern: /.*/,
    handler: async (ctx) => {
        if (!ctx.isGroup || ctx.isAdmin || ctx.isOwner || ctx.m.fromMe) return;

        const settings = getGroupSettings(ctx.from);
        if (!settings.antiflood) return;

        const key = `${ctx.from}::${ctx.sender}`;
        const entry = floodMap.get(key) || { count: 0 };

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
                mentions: [ctx.sender]
            }).catch(() => {});
        }
    }
});

// WARN LIMIT

addCmd({
    name: 'setlimit',
    aliases: ['warnlimit', 'setwarnlimit'],
    desc: 'Set warn-kick limit',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const num = parseInt(ctx.args[0]);

        if (!num || num < 1 || num > 20) {
            return ctx.reply('❌ Provide a number between 1 and 20.\n\nExample: .setlimit 5');
        }

        await setSetting('WARN_LIMIT', String(num));
        await ctx.reply(`✅ *Warn Limit Set*\n\nMembers will be kicked after *${num}* warnings.`);
    }
});

// TIMEZONE

addCmd({
    name: 'settz',
    aliases: ['settimezone', 'timezone'],
    desc: 'Change the bot timezone',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const tz = ctx.args[0];

        if (!tz) {
            return ctx.reply(
                '❌ Provide a timezone.\n\n' +
                'Examples:\n`Africa/Nairobi`\n`Africa/Dar_es_Salaam`\n' +
                '`America/New_York`\n`Europe/London`\n`Asia/Dubai`\n\n' +
                `Current: *${config.TIME_ZONE}*`
            );
        }

        if (!moment.tz.zone(tz)) {
            return ctx.reply(`❌ *${tz}* is not a valid timezone.`);
        }

        await setSetting('TIME_ZONE', tz);
        config.TIME_ZONE = tz;

        const now = moment().tz(tz).format('hh:mm A · DD MMM YYYY');
        await ctx.reply(`✅ *Timezone Updated*\n\nNew timezone: *${tz}*\nCurrent time: *${now}*`);
    }
});

// BOT SETTINGS

addCmd({
    name: 'botsettings',
    aliases: ['settings', 'bsettings', 'config'],
    desc: 'View all bot and group settings',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        try {
            const botName = config.BOT_NAME || 'LUKA-XMD';
            const allSettings = [
                'ANTI_CALL', 'ANTI_DELETE', 'ANTI_VV', 'ANTI_EDIT', 'AUTO_BIO',
                'AUTO_FOLLOW_CHANNEL', 'AUTO_LIKE_STATUS', 'AUTO_REACT',
                'AUTO_READ_STATUS', 'AUTO_TYPING', 'AUTO_RECORDING', 'AUTO_UPDATE',
                'BOT_NAME', 'BOT_PREFIX', 'BOT_VERSION', 'BOT_PIC', 'CHATBOT',
                'CHAT_MODE', 'DM_PRESENCE', 'MENU_THEME', 'MODE', 'OWNER_NAME',
                'OWNER_NUMBER', 'GITHUB_REPO', 'PACK_NAME', 'STATUS_LIKE_EMOJIS',
                'SUDO_NUMBERS', 'TIME_ZONE'
            ];

            const formatValue = (value) => {
                if (value === undefined || value === null || value === '') return 'Not Set';
                if (typeof value === 'object') return JSON.stringify(value);
                if (value === true || String(value).toLowerCase() === 'true') return 'true';
                if (value === false || String(value).toLowerCase() === 'false') return 'false';
                return String(value);
            };

            const getValue = (key) => {
                const dbValue = getSetting(key, undefined);
                if (dbValue !== undefined && dbValue !== null) return dbValue;
                if (config[key] !== undefined && config[key] !== null) return config[key];
                return 'Not Set';
            };

            let output = `╭═══════════⊷\n       *BOT SETTINGS*\n╰═══════════⊷\n\n`;

            for (const key of allSettings) {
                output += `▸ *${key}:* ${formatValue(getValue(key))}\n`;
            }

            output += `\n▸ *SUDO_USERS:* ${formatValue(getValue('SUDO_USERS'))}\n`;

            const groupSettings = getGroupSettings(ctx.from) || {};
            const groupValue = (...keys) => {
                for (const key of keys) {
                    if (groupSettings[key] !== undefined && groupSettings[key] !== null) {
                        return formatValue(groupSettings[key]);
                    }
                }
                return 'None';
            };

            output += `\n╭═══════════⊷\n      📋 *GROUP SETTINGS*\n╰═══════════⊷\n\n`;
            output += `*🎉 WELCOME MESSAGE:*\n${groupValue('welcomeMessage', 'welcome', 'welcomemsg')}\n\n`;
            output += `*👋 GOODBYE MESSAGE:*\n${groupValue('goodbyeMessage', 'goodbye', 'goodbyemsg')}\n\n`;
            output += `*📢 GROUP EVENTS:*\n${groupValue('groupEvents', 'events')}\n\n`;
            output += `*🔗 ANTILINK:*\n${groupValue('antilink', 'antilinkAction')}\n\n`;
            output += `*🚫 ANTIBAD:*\n${groupValue('antibad', 'badwords')}\n\n`;
            output += `*🛡️ ANTI-GROUP-MENTION:*\n${groupValue('antigroupmention', 'antiGroupMention')}\n\n`;
            output += '\n_ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ_';

            const card = {
                title: `⚙️ ${botName} SETTINGS`,
                text: output,
                footer: botName,
                buttons: []
            };

            await sendButtons(ctx.sock, ctx.from, card, { quoted: ctx.m }).catch(async () => {
                await ctx.sock.sendMessage(ctx.from, { text: output }, { quoted: ctx.m });
            });
        } catch (error) {
            console.error('[BOT SETTINGS ERROR]', error);
            await ctx.reply(`❌ Failed to load settings.\n${error.message || error}`);
        }
    }
});

// GHOST MODE

addCmd({
    name: 'ghostmode',
    aliases: ['ghost', 'toggleghost'],
    desc: 'Toggle ghost mode',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const current = String(getSetting('GHOST_MODE', 'false')) === 'true';
        const newVal = !current;

        await setSetting('GHOST_MODE', String(newVal));
        config.GHOST_MODE = newVal;

        try {
            await ctx.sock.updatePrivacySettings?.('readreceipts', newVal ? 'none' : 'all');
        } catch {}

        await ctx.reply(
            newVal
                ? '👻 *Ghost Mode ON*\n\nRead receipts are now hidden.'
                : '👁️ *Ghost Mode OFF*\n\nRead receipts are now visible.'
        );
    }
});

// FREEZE LAST SEEN

addCmd({
    name: 'freezelastseen',
    aliases: ['freezels', 'hidelastseen'],
    desc: 'Toggle hiding last seen',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const current = String(getSetting('FREEZE_LAST_SEEN', 'false')) === 'true';
        const newVal = !current;

        await setSetting('FREEZE_LAST_SEEN', String(newVal));
        config.FREEZE_LAST_SEEN = newVal;

        try {
            await ctx.sock.updateLastSeenPrivacy?.(newVal ? 'none' : 'contacts');
        } catch {}

        await ctx.reply(
            newVal
                ? '🧊 *Last Seen Frozen*\n\nNobody can see my last seen anymore.'
                : '🕐 *Last Seen Visible*\n\nLast seen is now visible to contacts.'
        );
    }
});

// STATUS REPLY

addCmd({
    name: 'statusreply',
    aliases: ['togglestatusreply', 'autoreplystatuses'],
    desc: 'Toggle auto-reply to statuses',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const current = String(getSetting('STATUS_REPLY', 'false')) === 'true';
        const newVal = !current;

        await setSetting('STATUS_REPLY', String(newVal));
        config.STATUS_REPLY = newVal;

        await ctx.reply(
            newVal
                ? '💬 *Status Reply ON*\n\nI will auto-reply to statuses.'
                : '🔕 *Status Reply OFF*\n\nAuto status reply disabled.'
        );
    }
});

addCmd({
    name: 'setstatusmsg',
    aliases: ['statusmsg'],
    desc: 'Set status auto-reply message',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const msg = ctx.text?.trim();

        if (!msg) {
            return ctx.reply('📝 Usage: .setstatusmsg <message>\n\nExample: .setstatusmsg Nice status! 🔥');
        }

        await setSetting('STATUS_MSG', msg);
        config.STATUS_MSG = msg;
        await ctx.reply(`✅ *Status Reply Message Set*\n\n> ${msg}`);
    }
});

// REACT EMOJIS

addCmd({
    name: 'setreactemoji',
    aliases: ['reactemojis', 'setemoji'],
    desc: 'Set custom auto-react emojis',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const raw = ctx.text?.trim();

        if (!raw) {
            return ctx.reply(
                '📝 Usage: .setreactemoji 🔥,❤️,😎,✨\n\n' +
                `Current emojis: ${config.CUSTOM_REACT_EMOJIS || 'Not Set'}`
            );
        }

        const emojis = raw.split(',').map(e => e.trim()).filter(Boolean);

        if (emojis.length < 2) {
            return ctx.reply('❌ Provide at least 2 emojis separated by commas.');
        }

        const joined = emojis.join(',');
        await setSetting('CUSTOM_REACT_EMOJIS', joined);
        config.CUSTOM_REACT_EMOJIS = joined;

        await ctx.reply(`✅ *React Emojis Updated*\n\nNew pool: ${emojis.join(' ')}`);
    }
});

// WARN LIST

addCmd({
    name: 'warnlist',
    aliases: ['warnings', 'listwarns'],
    desc: 'List warned users in this group',
    category: 'group',
    groupOnly: true,
    adminOnly: true,
    handler: async (ctx) => {
        const warns = getAllWarnings(ctx.from);

        if (!warns || !warns.length) {
            return ctx.reply('✅ No warnings have been issued in this group yet.');
        }

        const grouped = {};

        for (const warning of warns) {
            grouped[warning.jid] = grouped[warning.jid] || [];
            grouped[warning.jid].push(warning.reason || 'No reason given');
        }

        const lines = Object.entries(grouped).map(([jid, reasons]) =>
            `👤 @${jid.split('@')[0]}  ─  *${reasons.length} warn(s)*\n   └ ${reasons.slice(-1)[0]}`
        );

        const limit = getSetting('WARN_LIMIT', '3');

        await ctx.send({
            text: `⚠️ *Warned Users* (Limit: ${limit})\n\n${lines.join('\n\n')}\n\n_${config.BOT_NAME}_`,
            mentions: Object.keys(grouped)
        });
    }
});

// RESET WARNS

addCmd({
    name: 'resetwarns',
    aliases: ['clearwarns', 'resetwarn'],
    desc: 'Clear warnings for a user',
    category: 'group',
    groupOnly: true,
    adminOnly: true,
    handler: async (ctx) => {
        const target =
            ctx.quoted?.sender ||
            ctx.m?.mentioned?.[0] ||
            (ctx.args[0] ? ctx.args[0].replace(/\D/g, '') + '@s.whatsapp.net' : null);

        if (!target) {
            return ctx.reply('❌ Reply to a user message or mention them.\n\nExample: .resetwarns @user');
        }

        clearWarnings(target, ctx.from);

        await ctx.send({
            text: `✅ *Warnings Cleared*\n\nAll warnings for @${target.split('@')[0]} have been reset.`,
            mentions: [target]
        });
    }
});

// ANTISTICKER

addCmd({
    name: 'antisticker',
    aliases: ['nosticker', 'blocksticker'],
    desc: 'Toggle antisticker',
    category: 'group',
    groupOnly: true,
    adminOnly: true,
    handler: async (ctx) => {
        if (!ctx.isBotAdmin) {
            return ctx.reply('❌ I need to be an admin to delete messages.');
        }

        const current = getGroupSettings(ctx.from).antisticker;
        const newVal = !current;
        setGroupSetting(ctx.from, 'antisticker', newVal);

        await ctx.reply(
            newVal
                ? '🚫 *Anti-Sticker ON*\n\nStickers sent in this group will be deleted.'
                : '✅ *Anti-Sticker OFF*\n\nSticker protection disabled.'
        );
    }
});

// SET OWNER

addCmd({
    name: 'setowner',
    aliases: ['changeowner', 'setownernumber', 'ownernumber'],
    desc: 'Change bot owner number',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const num = ctx.text?.replace(/\D/g, '');

        if (!num || num.length < 7) {
            return ctx.reply('❌ Provide a valid number.\n\nExample: .setowner 255712345678');
        }

        await setSetting('OWNER_NUMBER', num);
        config.OWNER_NUMBER = num;
        config.OWNER = num;
        config.ownerNumber = num;

        await ctx.reply(
            `✅ *Owner Number Updated*\n\nNew owner: +${num}\n\nRestart if owner permissions still use the old number.`
        );
    }
});

addCmd({
    name: 'setownername',
    aliases: ['ownername'],
    desc: 'Change owner name',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const name = ctx.text?.trim();

        if (!name) {
            return ctx.reply('❌ Provide a name.\n\nExample: .setownername LUKA iT');
        }

        await setSetting('OWNER_NAME', name);
        config.OWNER_NAME = name;
        await ctx.reply(`✅ *Owner Name Updated*\n\nNew name: *${name}*`);
    }
});

// STATUS EMOJIS

addCmd({
    name: 'setstatusemojis',
    aliases: ['statusemojis', 'likeemojis'],
    desc: 'Set status like emojis',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const value = ctx.text?.trim();

        if (!value) {
            return ctx.reply(
                '❌ Please provide emojis separated by commas!\n' +
                'Example: .setstatusemojis 💚,❤️,💜'
            );
        }

        const emojis = [...new Set(value.split(',').map(e => e.trim()).filter(Boolean))];

        if (!emojis.length) {
            return ctx.reply('❌ No valid emojis provided.');
        }

        const emojiValue = emojis.join(',');

        try {
            const current = String(getSetting('STATUS_LIKE_EMOJIS', '') || '').trim();

            if (current === emojiValue) {
                return ctx.reply(`⚠️ Status emojis are already set to: *${emojiValue}*`);
            }

            await setSetting('STATUS_LIKE_EMOJIS', emojiValue);
            config.STATUS_LIKE_EMOJIS = emojiValue;

            await ctx.reply(`✅ Status like emojis updated successfully!\n\n💚 Emojis: ${emojiValue}`);
        } catch (error) {
            console.error('[SET STATUS EMOJIS]', error);
            await ctx.reply(`❌ Failed to save status emojis:\n${error.message}`);
        }
    }
});

// STATUS REPLY TEXT

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
    }
});

// AUTO-REACT MODE

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
    }
});

// AUTO-REPLY

addOwnerBoolCommand({
    name: 'setautoreply',
    key: 'AUTO_REPLY',
    description: 'Set auto-reply on/off'
});

// AUTO-BLOCK

addCmd({
    name: 'setautoblock',
    aliases: ['blockcountry'],
    desc: 'Set auto-block country codes',
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
    }
});

// AUTO-READ MESSAGES MODE

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
                return ctx.reply(`⚠️ Auto read messages is already: *${value.toUpperCase()}*`);
            }

            await setSetting('AUTO_READ_MESSAGES', value);
            config.AUTO_READ_MESSAGES = value;
            await ctx.reply(`✅ Auto read messages set to: *${value.toUpperCase()}*`);
        } catch (error) {
            await ctx.reply(`❌ Error: ${error.message}`);
        }
    }
});

// YOUTUBE LINK

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
    }
});

// NEWSLETTER JID

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
    }
});

// GROUP JID

addCmd({
    name: 'setgcjid',
    aliases: ['gcjid', 'groupjid', 'supportgc'],
    desc: 'Set group JID or invite code',
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
    }
});

// NEWSLETTER URL

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
    }
});

// STICKER PACK NAME

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
    }
});

// STICKER PACK AUTHOR

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
    }
});

// GET SETTING

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
    }
});

// SET ANY SETTING

addCmd({
    name: 'setsetting',
    aliases: ['setconfig'],
    desc: 'Set any setting',
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
    }
});

// RESET ONE SETTING

addCmd({
    name: 'resetsetting',
    aliases: ['resetconfig', 'defaultsetting'],
    desc: 'Reset a setting to default',
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

            await ctx.reply(`✅ *${key}* reset to default: *${defaultValue ?? 'Not Set'}*`);
        } catch (error) {
            await ctx.reply(`❌ Error: ${error.message}`);
        }
    }
});

// RESET ALL SETTINGS

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
    }
});

// AUTO-REPLY STATUS

addOwnerBoolCommand({
    name: 'setautoreplystatus',
    aliases: ['autoreplystatus', 'replystatusauto'],
    key: 'AUTO_REPLY_STATUS',
    description: 'Set auto-reply to status on/off',
    extraNote: 'Auto reply to status works when autoreadstatus is ON.'
});

// PM PERMIT

addOwnerBoolCommand({
    name: 'setpmpermit',
    aliases: ['pmpermit'],
    key: 'PM_PERMIT',
    description: 'Set PM permit on/off'
});

// RESET SUDO

addCmd({
    name: 'resetsudo',
    aliases: ['deleteallsudos', 'resetsudos', 'clearsudo', 'clearsudos'],
    desc: 'Remove all sudo numbers',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        try {
            if (typeof getSudoNumbers !== 'function' || typeof clearAllSudo !== 'function') {
                return ctx.reply('❌ getSudoNumbers() or clearAllSudo() is missing from database module.');
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
    }
});

// ANTI-CALL

addOwnerBoolCommand({
    name: 'setanticall',
    aliases: ['anticall'],
    key: 'ANTICALL',
    description: 'Set anti-call on/off'
});

// PREFIX

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
    }
});

// RESET DATABASE

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
    }
});
