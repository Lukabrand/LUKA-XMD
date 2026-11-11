'use strict';

const { serialize } = require('../utils/serialize');
const { findCmd, triggers } = require('./loader');
const { isSudo, trackCmd } = require('../db/database');
const config = require('../config/settings');
const logger = require('../utils/logger');
const { cleanJid } = require('../utils/helpers');
const { channelCtx } = require('../utils/gmdFunctions2');

const processed = new Set();

function getAfkMap() {
try { return require('../../lukah/plugins/extras').AFK_MAP; }
catch { return null; }
}

function safeRun(label, fn) {
Promise.resolve().then(fn).catch(e =>
logger.error(label, e.stack || e.message)
);
}

function handleMessage({ messages, type }, sock) {
if (type === 'append' || !messages?.length) return;
messages.forEach(raw => safeRun('MESSAGE', () => processOne(raw, sock)));
}

async function processOne(raw, sock) {
if (!raw?.message || !raw.key?.id || processed.has(raw.key.id)) return;

processed.add(raw.key.id);
setTimeout(() => processed.delete(raw.key.id), 120000).unref?.();

if (raw.key.remoteJid === 'status@broadcast') return;

const m = await serialize(raw, sock);
if (!m) return;

if (!m.fromMe && !m.isStatus) {
    const flags = global.autoPresenceFlags ||= { typing: null, recording: null };
    const presence = (flags.recording ?? config.AUTO_RECORDING)
        ? 'recording'
        : (flags.typing ?? config.AUTO_TYPING) ? 'composing' : null;

    if (presence) {
        safeRun('PRESENCE', () => sock.sendPresenceUpdate(presence, m.from));
        setTimeout(() => safeRun('PRESENCE', () =>
            sock.sendPresenceUpdate('paused', m.from)), 5000).unref?.();
    }

    const afk = getAfkMap();
    if (afk instanceof Map) {
        if (afk.has(m.sender)) {
            const { reason, time } = afk.get(m.sender);
            afk.delete(m.sender);
            const s = Math.floor((Date.now() - time) / 1000);
            safeRun('AFK', () => sock.sendMessage(m.from, {
                text: `✅ Welcome back *${m.pushName || m.sender.split('@')[0]}*!\n⏱️ AFK: *${s}s*\n📝 ${reason || 'No reason'}`,
                contextInfo: channelCtx()
            }));
        }

        const mentions = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        for (const jid of mentions) {
            if (!afk.has(jid)) continue;
            const { reason, time } = afk.get(jid);
            const s = Math.floor((Date.now() - time) / 1000);
            safeRun('AFK', () => sock.sendMessage(m.from, {
                text: `😴 *@${jid.split('@')[0]} is AFK*\n📝 ${reason || 'No reason'}\n⏱️ ${s}s ago`,
                mentions: [jid],
                contextInfo: channelCtx()
            }));
        }
    }
}

const ctx = buildCtx(m, sock);

for (const item of triggers) {
    const pattern = item.pattern || item.trigger;
    if (typeof item.handler !== 'function') continue;

    try {
        const matched = pattern instanceof RegExp
            ? (pattern.lastIndex = 0, pattern.test(m.body || ''))
            : typeof pattern === 'string' && (m.body || '').toLowerCase().includes(pattern.toLowerCase());

        if (matched) safeRun('TRIGGER', () => item.handler(ctx));
    } catch (e) {
        logger.error('TRIGGER', e.message);
    }
}

if (!m.isCmd) return;

const name = String(m.command || '').toLowerCase().trim();
const cmd = findCmd(name);
if (!cmd || typeof cmd.handler !== 'function') return;

const owner = String(config.OWNER_NUMBER || '').replace(/\D/g, '');
const sender = String(m.sender || '').split('@')[0].split(':')[0].replace(/\D/g, '');
const isOwner = m.fromMe || (!!owner && owner === sender);
const superUser = isOwner || isSudo(m.sender);

if (cmd.ownerOnly && !isOwner)
    return ctx.reply('❌ Owner only.');

if (cmd.groupOnly && !m.isGroup)
    return ctx.reply('❌ Groups only.');

if (cmd.adminOnly && !m.isAdmin && !superUser)
    return ctx.reply('❌ Group admin only.');

const mode = String(config.MODE || 'public').toLowerCase();
if (mode === 'private' && !superUser) return;
if (mode === 'groups' && !m.isGroup && !superUser) return;
if (mode === 'dm' && m.isGroup && !superUser) return;

logger.info('CMD', `${m.sender.split('@')[0]} → ${config.BOT_PREFIX || '.'}${name}`);

safeRun('CMD_TRACK', () => trackCmd(cmd.name));
safeRun(`CMD_ERR:${name}`, () => cmd.handler(ctx));

}

function buildCtx(m, sock) {
const reply = text => sock.sendMessage(m.from, {
text: String(text ?? ''),
contextInfo: channelCtx()
}, { quoted: m });

const send = (content, opts = {}) => {
    if (content.sticker !== undefined)
        return sock.sendMessage(m.from, content, opts);
    return sock.sendMessage(m.from, {
        ...content,
        contextInfo: channelCtx()
    }, opts);
};

return {
    m, sock, from: m.from, sender: m.sender,
    pushName: m.pushName, isGroup: m.isGroup,
    isAdmin: m.isAdmin, isBotAdmin: m.isBotAdmin,
    isOwner: m.fromMe, groupMeta: m.groupMeta,
    groupName: m.groupName, participants: m.participants,
    admins: m.admins, body: m.body, command: m.command,
    args: m.args, text: m.text, quoted: m.quoted,
    quotedKey: m.quotedKey, reply, send,
    react: emoji => sock.sendMessage(m.from, {
        react: { text: emoji, key: m.key }
    }),
    deleteMsg: (key = m.key) => sock.sendMessage(m.from, { delete: key }),
    editMsg: (key, text) => sock.sendMessage(m.from, { text, edit: key }),
    config
};

}

module.exports = { handleMessage, buildCtx };
