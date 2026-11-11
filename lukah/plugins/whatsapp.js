'use strict';
// ╔══════════════════════════════════════════════════════════════╗
//  ⚡LUKA-XMD  —  Advanced WhatsApp Settings
//  Profile, presence, blocklist, privacy controls
// ╚══════════════════════════════════════════════════════════════╝

const { addCmd } = require('../../luka/handlers/loader');
const { cleanJid } = require('../../luka/utils/helpers');

// Resolve target JID from quoted reply, mention, or phone-number arg
function resolveTarget(ctx) {
    if (ctx.quoted?.sender)               return cleanJid(ctx.quoted.sender);
    if (ctx.m?.mentioned?.length)         return cleanJid(ctx.m.mentioned[0]);
    if (ctx.args?.[0]) {
        const num = ctx.args[0].replace(/[^0-9]/g, '');
        if (num) return `${num}@s.whatsapp.net`;
    }
    return null;
}

// ── SET PROFILE STATUS (About line) ─────────────────────────
addCmd({
    name: 'setstatus',
    aliases: ['setabout', 'setbio'],
    desc: 'Update the bot WhatsApp About / status line',
    usage: 'setstatus <new status text>',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const txt = (ctx.args || []).join(' ').trim();
        if (!txt) return ctx.reply('📝 Usage: `.setstatus <text>`');
        try {
            await ctx.sock.updateProfileStatus(txt);
            await ctx.reply(`✅ Profile status updated to:\n> ${txt}`);
        } catch (e) {
            await ctx.reply(`❌ Failed: ${e.message}`);
        }
    },
});

// ── SET PRESENCE (online status) ────────────────────────────
addCmd({
    name: 'setpresence',
    aliases: ['presence'],
    desc: 'Set bot presence (available, unavailable, composing, recording, paused)',
    usage: 'setpresence <available|unavailable|composing|recording|paused>',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const v = (ctx.args[0] || '').toLowerCase();
        const valid = ['available', 'unavailable', 'composing', 'recording', 'paused'];
        if (!valid.includes(v)) return ctx.reply(`❌ Use one of: ${valid.join(', ')}`);
        try {
            await ctx.sock.sendPresenceUpdate(v);
            await ctx.reply(`✅ Presence set to *${v}*`);
        } catch (e) {
            await ctx.reply(`❌ Failed: ${e.message}`);
        }
    },
});

// ── BLOCK USER ──────────────────────────────────────────────
addCmd({
    name: 'block',
    aliases: ['blockuser'],
    desc: 'Block the current chat user',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        try {
            const target = ctx.from;

            if (!target) {
                return ctx.reply('❌ Failed to get the user JID.');
            }

            await ctx.sock.updateBlockStatus(target, 'block');

            await ctx.reply('🚫 User blocked successfully.');
        } catch (e) {
            await ctx.reply(`❌ Failed to block user: ${e.message}`);
        }
    },
});

// ── UNBLOCK USER ────────────────────────────────────────────
addCmd({
    name: 'unblock',
    aliases: ['unblockuser'],
    desc: 'Unblock a user',
    usage: 'unblock @user  |  unblock <number>',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const target = resolveTarget(ctx);
        if (!target) return ctx.reply('❌ Mention a user or pass a phone number.');
        try {
            await ctx.sock.updateBlockStatus(target, 'unblock');
            await ctx.reply(`✅ Unblocked: \`${target}\``);
        } catch (e) {
            await ctx.reply(`❌ Failed: ${e.message}`);
        }
    },
});

// ── BLOCK LIST ──────────────────────────────────────────────
addCmd({
    name: 'blocklist',
    aliases: ['blocked'],
    desc: 'Show all blocked users',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        try {
            const list = await ctx.sock.fetchBlocklist();
            if (!list?.length) return ctx.reply('✅ No users blocked.');
            const out = list.map((j, i) => `${i + 1}. \`${j}\``).join('\n');
            await ctx.reply(`🚫 *BLOCKED USERS* (${list.length})\n\n${out}`);
        } catch (e) {
            await ctx.reply(`❌ Failed: ${e.message}`);
        }
    },
});

// ── PRIVACY CONTROLS ────────────────────────────────────────
const PRIVACY_OPTS = {
    lastseen:     { fn: 'updateLastSeenPrivacy',       valid: ['all', 'contacts', 'contact_blacklist', 'none'] },
    online:       { fn: 'updateOnlinePrivacy',         valid: ['all', 'match_last_seen'] },
    profile:      { fn: 'updateProfilePicturePrivacy', valid: ['all', 'contacts', 'contact_blacklist', 'none'] },
    status:       { fn: 'updateStatusPrivacy',         valid: ['all', 'contacts', 'contact_blacklist', 'none'] },
    readreceipts: { fn: 'updateReadReceiptsPrivacy',   valid: ['all', 'none'] },
    groupadd:     { fn: 'updateGroupsAddPrivacy',      valid: ['all', 'contacts', 'contact_blacklist'] },
};

addCmd({
    name: 'privacy',
    aliases: ['setprivacy'],
    desc: 'Update WhatsApp privacy settings',
    usage: 'privacy <lastseen|online|profile|status|readreceipts|groupadd> <value>',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const what = (ctx.args[0] || '').toLowerCase();
        const val  = (ctx.args[1] || '').toLowerCase();

        if (!what) {
            const lines = Object.entries(PRIVACY_OPTS)
                .map(([k, v]) => `• *${k}* → ${v.valid.join(' / ')}`)
                .join('\n');
            return ctx.reply(`🔒 *PRIVACY OPTIONS*\n\n${lines}\n\n_Usage:_ \`.privacy <option> <value>\``);
        }

        const opt = PRIVACY_OPTS[what];
        if (!opt) return ctx.reply(`❌ Unknown option *${what}*. Send \`.privacy\` for the list.`);
        if (!opt.valid.includes(val)) return ctx.reply(`❌ Value must be one of: ${opt.valid.join(', ')}`);

        try {
            await ctx.sock[opt.fn](val);
            await ctx.reply(`✅ *${what}* privacy set to *${val}*`);
        } catch (e) {
            await ctx.reply(`❌ Failed: ${e.message}`);
        }
    },
});

// ── PROFILE INFO (bot's own) ────────────────────────────────
addCmd({
    name: 'profile',
    aliases: ['waprofile'],
    desc: 'Show bot WhatsApp profile info',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        try {
            const me = ctx.sock.user;
            let about = '';
            try {
                const r = await ctx.sock.fetchStatus(me.id);
                about = r?.status || '';
            } catch {}
            let pp = '';
            try { pp = await ctx.sock.profilePictureUrl(me.id, 'image'); } catch {}

            const txt =
                `🪪 *BOT PROFILE*\n\n` +
                `📛 *Name:*    ${me.name || '—'}\n` +
                `📞 *Number:*  ${me.id?.split('@')[0]?.split(':')[0] || '—'}\n` +
                `🆔 *JID:*     \`${me.id}\`\n` +
                `📝 *About:*   ${about || '—'}\n` +
                `🖼️ *Photo:*   ${pp ? '✅' : '❌ none'}`;

            if (pp) {
                await ctx.send({ image: { url: pp }, caption: txt });
            } else {
                await ctx.reply(txt);
            }
        } catch (e) {
            await ctx.reply(`❌ Failed: ${e.message}`);
        }
    },
});

// ── ARCHIVE / UNARCHIVE CHAT ────────────────────────────────
addCmd({
    name: 'archive',
    desc: 'Archive the current chat',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        try {
            await ctx.sock.chatModify({ archive: true, lastMessages: [{ key: ctx.m.key, messageTimestamp: ctx.m.messageTimestamp }] }, ctx.from);
            await ctx.reply('📦 Chat archived.');
        } catch (e) { await ctx.reply(`❌ ${e.message}`); }
    },
});
addCmd({
    name: 'unarchive',
    desc: 'Unarchive the current chat',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        try {
            await ctx.sock.chatModify({ archive: false, lastMessages: [{ key: ctx.m.key, messageTimestamp: ctx.m.messageTimestamp }] }, ctx.from);
            await ctx.reply('📂 Chat unarchived.');
        } catch (e) { await ctx.reply(`❌ ${e.message}`); }
    },
});

// ── PIN / UNPIN CHAT ────────────────────────────────────────
addCmd({
    name: 'pinchat',
    aliases: ['pin'],
    desc: 'Pin the current chat',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        try {
            await ctx.sock.chatModify({ pin: true }, ctx.from);
            await ctx.reply('📌 Chat pinned.');
        } catch (e) { await ctx.reply(`❌ ${e.message}`); }
    },
});
addCmd({
    name: 'unpinchat',
    aliases: ['unpin'],
    desc: 'Unpin the current chat',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        try {
            await ctx.sock.chatModify({ pin: false }, ctx.from);
            await ctx.reply('📍 Chat unpinned.');
        } catch (e) { await ctx.reply(`❌ ${e.message}`); }
    },
});

// ── MARK CHAT READ / UNREAD ─────────────────────────────────
addCmd({
    name: 'markread',
    desc: 'Mark current chat as read',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        try {
            await ctx.sock.chatModify({ markRead: true, lastMessages: [{ key: ctx.m.key, messageTimestamp: ctx.m.messageTimestamp }] }, ctx.from);
            await ctx.reply('👁️ Chat marked read.');
        } catch (e) { await ctx.reply(`❌ ${e.message}`); }
    },
});
addCmd({
    name: 'markunread',
    desc: 'Mark current chat as unread',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        try {
            await ctx.sock.chatModify({ markRead: false, lastMessages: [{ key: ctx.m.key, messageTimestamp: ctx.m.messageTimestamp }] }, ctx.from);
            await ctx.reply('🔵 Chat marked unread.');
        } catch (e) { await ctx.reply(`❌ ${e.message}`); }
    },
});

// ── DISAPPEARING MESSAGES TIMER ─────────────────────────────
const TIMERS = { off: 0, '24h': 86400, '7d': 604800, '90d': 7776000 };
addCmd({
    name: 'disappear',
    aliases: ['ephemeral'],
    desc: 'Set disappearing-message timer in this chat',
    usage: 'disappear <off|24h|7d|90d>',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const v = (ctx.args[0] || '').toLowerCase();
        if (!(v in TIMERS)) return ctx.reply('⏳ Use one of: `off`, `24h`, `7d`, `90d`.');
        try {
            await ctx.sock.sendMessage(ctx.from, { disappearingMessagesInChat: TIMERS[v] });
            await ctx.reply(`✅ Disappearing timer set to *${v}*.`);
        } catch (e) { await ctx.reply(`❌ ${e.message}`); }
    },
});
// ═══════════════════════════════════════════════════════════════
// ⚡ WHATSAPP USERNAME MANAGEMENT
// ═══════════════════════════════════════════════════════════════

function cleanUsername(input) {
    return String(input || '')
        .trim()
        .replace(/^@/, '');
}

function validUsername(username) {
    return /^[a-zA-Z0-9._]{3,35}$/.test(username);
}

function usernameSupport(ctx, method) {
    if (typeof ctx.sock[method] !== 'function') {
        ctx.reply(
            `❌ Your installed Baileys version does not support ${method}().\n\n` +
            `Update or use a Baileys build that supports WhatsApp Username API.`
        );
        return false;
    }

    return true;
}

// ── SET USERNAME ─────────────────────────────────────────────

addCmd({
    name: 'setusername',
    aliases: ['claimusername'],
    desc: 'Set bot WhatsApp username',
    usage: 'setusername <username>',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        const username = cleanUsername(ctx.args.join(' '));

        if (!username) {
            return ctx.reply(
                '📝 Usage: `.setusername lukabrand`'
            );
        }

        if (!validUsername(username)) {
            return ctx.reply(
                '❌ Invalid username!\n\n' +
                'Username rules:\n' +
                '• 3–35 characters\n' +
                '• Letters and numbers\n' +
                '• Dot (.) and underscore (_) allowed'
            );
        }

        if (!usernameSupport(ctx, 'checkUsername')) return;
        if (!usernameSupport(ctx, 'setUsername')) return;

        try {
            await ctx.reply(
                `🔍 Checking username: @${username}...`
            );

            const check = await ctx.sock.checkUsername(username);

            if (!check?.available) {
                const suggestions = check?.suggestions?.length
                    ? '\n\n💡 Suggestions:\n' +
                      check.suggestions.map(x => `• @${x}`).join('\n')
                    : '';

                return ctx.reply(
                    `❌ Username @${username} is unavailable.` +
                    suggestions
                );
            }

            await ctx.sock.setUsername(username);

            await ctx.reply(
                `✅ *WHATSAPP USERNAME UPDATED*\n\n` +
                `👤 Username: @${username}\n` +
                `📌 Status: Successfully claimed\n\n` +
                `ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`
            );

        } catch (e) {
            await ctx.reply(
                `❌ Failed to set username:\n${e.message}`
            );
        }
    }
});

// ── CHECK USERNAME AVAILABILITY ─────────────────────────────

addCmd({
    name: 'checkusername',
    aliases: ['usernamecheck', 'isusername'],
    desc: 'Check WhatsApp username availability',
    usage: 'checkusername <username>',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        const username = cleanUsername(ctx.args.join(' '));

        if (!username) {
            return ctx.reply(
                '📝 Usage: `.checkusername lukabrand`'
            );
        }

        if (!validUsername(username)) {
            return ctx.reply('❌ Invalid username format.');
        }

        if (!usernameSupport(ctx, 'checkUsername')) return;

        try {
            const result = await ctx.sock.checkUsername(username);

            if (result?.available) {
                return ctx.reply(
                    `✅ *USERNAME AVAILABLE*\n\n` +
                    `👤 @${username}\n\n` +
                    `You can claim this username.`
                );
            }

            const suggestions = result?.suggestions?.length
                ? '\n\n💡 Suggestions:\n' +
                  result.suggestions.map(x => `• @${x}`).join('\n')
                : '';

            await ctx.reply(
                `❌ *USERNAME NOT AVAILABLE*\n\n` +
                `👤 @${username}` +
                suggestions
            );

        } catch (e) {
            await ctx.reply(`❌ Error: ${e.message}`);
        }
    }
});

// ── GET BOT USERNAME ────────────────────────────────────────

addCmd({
    name: 'myusername',
    aliases: ['getusername', 'botusername'],
    desc: 'Show bot WhatsApp username',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        if (!usernameSupport(ctx, 'getMyUsername')) return;

        try {
            const result = await ctx.sock.getMyUsername();

            const username = typeof result === 'string'
                ? result
                : result?.username || result?.name;

            if (!username) {
                return ctx.reply(
                    'ℹ️ No WhatsApp username was returned for this account.'
                );
            }

            await ctx.reply(
                `👤 *BOT WHATSAPP USERNAME*\n\n` +
                `Username: @${username}\n\n` +
                `ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`
            );

        } catch (e) {
            await ctx.reply(`❌ Failed: ${e.message}`);
        }
    }
});

// ── FIND USER BY USERNAME ───────────────────────────────────

addCmd({
    name: 'username',
    aliases: ['findusername', 'userbyname'],
    desc: 'Find WhatsApp user by username',
    usage: 'username <username>',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        const username = cleanUsername(ctx.args.join(' '));

        if (!username) {
            return ctx.reply(
                '📝 Usage: `.username lukabrand`'
            );
        }

        if (!validUsername(username)) {
            return ctx.reply('❌ Invalid username format.');
        }

        if (!usernameSupport(ctx, 'findUserByUsername')) return;

        try {
            const result = await ctx.sock.findUserByUsername(username);

            if (!result?.jid) {
                return ctx.reply(
                    `❌ No WhatsApp user found for @${username}.`
                );
            }

            await ctx.reply(
                `✅ *WHATSAPP USER FOUND*\n\n` +
                `👤 Username: @${username}\n` +
                `🆔 JID: ${result.jid}\n` +
                `📱 Contact: ${result.contact ? 'Yes' : 'No'}\n\n` +
                `ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`
            );

        } catch (e) {
            await ctx.reply(`❌ Lookup failed: ${e.message}`);
        }
    }
});

// ── DELETE BOT USERNAME ─────────────────────────────────────

addCmd({
    name: 'deleteusername',
    aliases: ['removeusername', 'dropusername'],
    desc: 'Remove bot WhatsApp username',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        if (!usernameSupport(ctx, 'deleteUsername')) return;

        try {
            await ctx.sock.deleteUsername();

            await ctx.reply(
                `✅ *WHATSAPP USERNAME REMOVED*\n\n` +
                `The bot username has been removed successfully.\n\n` +
                `ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`
            );

        } catch (e) {
            await ctx.reply(
                `❌ Failed to remove username:\n${e.message}`
            );
        }
    }
});
