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

// ── WHATSAPP USERNAME MANAGEMENT (Baileys native; no external API) ──
// These methods must be exposed by the installed Baileys socket build.
// No HTTP requests or third-party username services are used here.
function normalizeUsername(value) {
    return String(value || '').trim().replace(/^@/, '').toLowerCase();
}

function requireNativeMethod(sock, method) {
    if (typeof sock?.[method] !== 'function') {
        throw new Error(
            `Njia ya Baileys '${method}()' haipo kwenye version iliyosakinishwa. ` +
            'Tumia Baileys build yenye native WhatsApp Username support; hakuna API ya nje inayotumika.'
        );
    }
    return sock[method].bind(sock);
}

function extractUsername(value) {
    if (typeof value === 'string') return value.replace(/^@/, '').trim();
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = extractUsername(item);
            if (found) return found;
        }
        return '';
    }
    if (value && typeof value === 'object') {
        return String(value.username || value.name || value.handle || value.userName || '').replace(/^@/, '').trim();
    }
    return '';
}

// .setusername <username> — claim/update the WhatsApp username of the logged-in session.
addCmd({
    name: 'setusername',
    aliases: ['claimusername', 'changeusername'],
    desc: 'Set WhatsApp username ya account iliyounganisha session',
    usage: 'setusername <username>',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const username = normalizeUsername(ctx.args?.[0]);
        if (!username) return ctx.reply('👤 Matumizi: `.setusername <username>`\nMfano: `.setusername luka_xmd`');
        if (!/^[a-z0-9._]{3,30}$/.test(username)) {
            return ctx.reply('❌ Username si sahihi. Tumia herufi ndogo, namba, dot au underscore (herufi 3–30).');
        }
        try {
            const checkUsername = ctx.sock.checkUsername;
            if (typeof checkUsername === 'function') {
                const check = await checkUsername.call(ctx.sock, username);
                if (check?.available === false) {
                    const suggestions = Array.isArray(check.suggestions) && check.suggestions.length
                        ? `\n\nSuggestions: ${check.suggestions.slice(0, 5).map(x => `@${extractUsername(x)}`).join(', ')}`
                        : '';
                    return ctx.reply(`❌ Username *@${username}* haipatikani au hairuhusiwi.${suggestions}`);
                }
            }
            const setUsername = requireNativeMethod(ctx.sock, 'setUsername');
            await setUsername(username, { source: 'USER_INPUT' });
            let current = username;
            try {
                const getMyUsername = ctx.sock.getMyUsername;
                if (typeof getMyUsername === 'function') current = extractUsername(await getMyUsername.call(ctx.sock)) || username;
            } catch {}
            return ctx.reply(`✅ WhatsApp username imewekwa kupitia Baileys native.\n\n👤 Username: *@${current}*`);
        } catch (e) {
            return ctx.reply(`❌ Imeshindikana kuweka username: ${e.message}`);
        }
    },
});

// .getusername — read the username belonging to the active WhatsApp session.
addCmd({
    name: 'getusername',
    aliases: ['myusername', 'botusername'],
    desc: 'Show username ya WhatsApp account iliyounganisha session',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        try {
            const getMyUsername = requireNativeMethod(ctx.sock, 'getMyUsername');
            const username = extractUsername(await getMyUsername());
            if (!username) return ctx.reply('ℹ️ Account hii haina username iliyowekwa, au WhatsApp haijarudisha username.');
            const sessionJid = ctx.sock.user?.id || 'Unknown';
            return ctx.reply(`👤 *SESSION WHATSAPP USERNAME*\n\n@${username}\n\n📱 Session: ${sessionJid}`);
        } catch (e) {
            return ctx.reply(`❌ Imeshindikana kupata username: ${e.message}`);
        }
    },
});

// .username @handle OR reply/mention/number — resolve a username or fetch a contact's username.
addCmd({
    name: 'username',
    aliases: ['checkusername', 'findusername'],
    desc: 'Tafuta WhatsApp account kwa username au angalia username ya contact',
    usage: 'username <@handle> | reply/mention/number',
    category: 'owner',
    ownerOnly: true,
    handler: async (ctx) => {
        const input = String(ctx.args?.[0] || '').trim();
        try {
            // @handle or plain non-numeric text is treated as a username lookup.
            if (input.startsWith('@') || (input && !/^\+?[0-9]+$/.test(input))) {
                const handle = normalizeUsername(input);
                if (!/^[a-z0-9._]{3,30}$/.test(handle)) {
                    return ctx.reply('❌ Username si sahihi. Mfano: `.username @johndoe`');
                }
                const findUser = requireNativeMethod(ctx.sock, 'findUserByUsername');
                const found = await findUser(handle);
                if (!found) return ctx.reply(`❌ Sijaweza kumpata mtumiaji *@${handle}*.`);
                const jid = found.jid || found.id || found.user?.jid || 'Haijapatikana';
                return ctx.reply(`🔎 *WHATSAPP USERNAME RESULT*\n\n👤 Username: *@${handle}*\n🆔 WhatsApp ID: \`${jid}\``);
            }

            const target = resolveTarget(ctx);
            if (!target) {
                return ctx.reply('🔎 Matumizi:\n• `.username @handle` kutafuta kwa username\n• Reply/mention/namba kuangalia username ya contact.');
            }
            const fetchUsernames = requireNativeMethod(ctx.sock, 'fetchContactUsernames');
            const result = await fetchUsernames(target);
            const username = extractUsername(result?.[target] || result);
            if (!username) return ctx.reply(`ℹ️ Hakuna WhatsApp username iliyopatikana kwa \`${target}\`. Inawezekana hana username au WhatsApp haijatoa taarifa hiyo.`);
            return ctx.reply(`👤 *CONTACT USERNAME*\n\n📛 Username: *@${username}*\n🆔 JID: \`${target}\``);
        } catch (e) {
            return ctx.reply(`❌ Imeshindikana kutafuta username: ${e.message}`);
        }
    },
});

