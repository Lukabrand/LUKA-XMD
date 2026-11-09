'use strict';

const { serialize } = require('../utils/serialize');
const { findCmd, triggers } = require('./loader');
const { isSudo, trackCmd, getSetting } = require('../db/database');
const config = require('../config/settings');
const logger = require('../utils/logger');
const { cleanJid } = require('../utils/helpers');
const { channelCtx } = require('../utils/gmdFunctions2');

function getAfkMap() {
try {
return require('../../lukah/plugins/extras').AFK_MAP;
} catch {
return null;
}
}

// Normalize phone numbers and WhatsApp JIDs
function normalizeNumber(value) {
if (!value) return '';

return String(value)
    .split('@')[0]
    .split(':')[0]
    .replace(/\D/g, '');

}

// Read the current owner number directly from database
function getCurrentOwnerNumber() {
try {
const saved = getSetting('OWNER_NUMBER', config.OWNER_NUMBER || '');
const number = normalizeNumber(saved);

    if (number) {
        config.OWNER_NUMBER = number;
        return number;
    }
} catch (error) {
    logger.error('OWNER', `Could not read owner number: ${error.message}`);
}

return normalizeNumber(config.OWNER_NUMBER);

}

// Check owner on every incoming message
function isCurrentOwner(m) {
if (m?.fromMe) return true;

const ownerNumber = getCurrentOwnerNumber();
if (!ownerNumber) return false;

const senderCandidates = [
    m?.sender,
    m?.senderPn,
    m?.key?.participant,
    m?.key?.remoteJid,
    m?.from
];

return senderCandidates.some(value => {
    const number = normalizeNumber(value);
    return number && number === ownerNumber;
});

}

const processed = new Set();

setInterval(() => {
if (processed.size > 500) processed.clear();
}, 600000);

async function processOne(raw, sock) {
try {
if (!raw?.message || !raw.key?.id) return;

    if (processed.has(raw.key.id)) return;

    processed.add(raw.key.id);

    setTimeout(() => processed.delete(raw.key.id), 120000);

    if (raw.key.remoteJid === 'status@broadcast') return;

    if (process.env.DEBUG === 'true') {
        logger.info(
            'MSG',
            `${raw.key.fromMe ? '↗' : '↙'} ${raw.key.remoteJid}`
        );
    }

    const m = await serialize(raw, sock);
    if (!m) return;

    // Dynamic owner verification
    const isOwner = isCurrentOwner(m);

    // Keep serialized message owner status synchronized
    m.isOwner = isOwner;

    // Auto-typing / Auto-recording
if (!m.fromMe && !m.isStatus) {
    const flags = global.autoPresenceFlags ||= {
        typing: null,
        recording: null
    };

    const toBoolean = value =>
        value === true ||
        String(value).toLowerCase().trim() === 'true' ||
        String(value).trim() === '1';

    const recordingValue =
        flags.recording !== null
            ? flags.recording
            : getSetting('AUTO_RECORDING', config.AUTO_RECORDING ?? false);

    const typingValue =
        flags.typing !== null
            ? flags.typing
            : getSetting('AUTO_TYPING', config.AUTO_TYPING ?? false);

    const recording = toBoolean(recordingValue);
    const typing = toBoolean(typingValue);

    const presence = recording
        ? 'recording'
        : typing
            ? 'composing'
            : null;

    if (presence) {
        sock.sendPresenceUpdate(presence, m.from).catch(() => {});

        setTimeout(() => {
            sock.sendPresenceUpdate('paused', m.from).catch(() => {});
        }, 5000);
    }
}
    // AFK
    if (!m.fromMe && !m.isStatus) {
        const AFK_MAP = getAfkMap();

        if (AFK_MAP) {
            if (AFK_MAP.has(m.sender)) {
                const { reason, time } = AFK_MAP.get(m.sender);

                AFK_MAP.delete(m.sender);

                const s = Math.floor((Date.now() - time) / 1000);

                const gone = s >= 3600
                    ? `${Math.floor(s / 3600)}h ${Math.floor(s / 60) % 60}m`
                    : s >= 60
                        ? `${Math.floor(s / 60)}m ${s % 60}s`
                        : `${s}s`;

                sock.sendMessage(m.from, {
                    text: `✅ Welcome back *${m.pushName || m.sender.split('@')[0]}*!\n⏱️ Was AFK for: *${gone}*\n📝 Reason was: _${reason}_`,
                    contextInfo: channelCtx()
                }).catch(() => {});
            }

            const mentions =
                m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

            for (const jid of mentions) {
                if (!AFK_MAP.has(jid)) continue;

                const { reason, time } = AFK_MAP.get(jid);

                const s = Math.floor((Date.now() - time) / 1000);

                const gone = s >= 3600
                    ? `${Math.floor(s / 3600)}h ${Math.floor(s / 60) % 60}m`
                    : s >= 60
                        ? `${Math.floor(s / 60)}m ${s % 60}s`
                        : `${s}s`;

                sock.sendMessage(m.from, {
                    text: `😴 *@${jid.split('@')[0]} is AFK*\n📝 Reason: _${reason}_\n⏱️ Since: *${gone} ago*`,
                    mentions: [jid],
                    contextInfo: channelCtx()
                }).catch(() => {});
            }
        }
    }

    // Triggers
    if (triggers.length) {
        const matched = triggers.filter(({ pattern }) =>
            pattern.test(m.body)
        );

        if (matched.length) {
            Promise.allSettled(
                matched.map(({ handler }) =>
                    Promise.resolve()
                        .then(() => handler(ctx))
                        .catch(error =>
                            logger.error('TRIGGER', error.message)
                        )
                )
            );
        }
    }

    // Commands
    if (!m.isCmd) return;

    const cmd = findCmd(m.command);
    if (!cmd) return;

    // Dynamic owner and sudo verification
    const currentOwner = isCurrentOwner(m);
    const isSuperUser = currentOwner || isSudo(m.sender);

    if (cmd.ownerOnly && !currentOwner) {
        return ctx.reply(
            '❌ This command is for the *bot owner* only.'
        ).catch(() => {});
    }

    if (cmd.groupOnly && !m.isGroup) {
        return ctx.reply(
            '❌ This command can only be used in *groups*.'
        ).catch(() => {});
    }

    if (cmd.adminOnly && !m.isAdmin && !isSuperUser) {
        return ctx.reply(
            '❌ This command requires *group admin* privileges.'
        ).catch(() => {});
    }

    const mode = (config.MODE || 'public')
        .toLowerCase()
        .trim();

    if (mode === 'private' && !isSuperUser) return;
    if (mode === 'groups' && !m.isGroup && !isSuperUser) return;
    if (mode === 'dm' && m.isGroup && !isSuperUser) return;

    logger.info(
        'CMD',
        `${m.sender.split('@')[0]} → ${config.BOT_PREFIX}${m.command}`
    );

    trackCmd(cmd.name);

    Promise.resolve()
        .then(() => cmd.handler(ctx))
        .catch(error => {
            logger.error(
                'CMD_ERR',
                `${m.command}: ${error.message}`
            );
        });

} catch (err) {
    logger.error('MESSAGE', err.message);
}

}

function handleMessage({ messages, type }, sock) {
if (type === 'append' || !messages?.length) return;

Promise.allSettled(
    messages.map(raw => processOne(raw, sock))
);

}

function buildCtx(m, sock, isOwner = false) {
const reply = text =>
sock.sendMessage(
m.from,
{
text,
contextInfo: channelCtx()
},
{
quoted: m
}
);

const send = (content, opts = {}) =>
    content.sticker !== undefined
        ? sock.sendMessage(m.from, content, opts)
        : sock.sendMessage(
            m.from,
            {
                ...content,
                contextInfo: channelCtx()
            },
            opts
        );

const react = emoji =>
    sock.sendMessage(m.from, {
        react: {
            text: emoji,
            key: m.key
        }
    });

const deleteMsg = (key = m.key) =>
    sock.sendMessage(m.from, {
        delete: key
    });

const editMsg = (key, newText) =>
    sock.sendMessage(m.from, {
        text: newText,
        edit: key
    });

return {
    m,
    sock,
    from: m.from,
    sender: m.sender,
    pushName: m.pushName,
    isGroup: m.isGroup,
    isAdmin: m.isAdmin,
    isBotAdmin: m.isBotAdmin,
    isOwner,
    groupMeta: m.groupMeta,
    groupName: m.groupName,
    participants: m.participants,
    admins: m.admins,
    body: m.body,
    command: m.command,
    args: m.args,
    text: m.text,
    quoted: m.quoted,
    quotedKey: m.quotedKey,
    reply,
    send,
    react,
    deleteMsg,
    editMsg,
    config
};

}

module.exports = {
handleMessage,
isCurrentOwner,
getCurrentOwnerNumber
};
