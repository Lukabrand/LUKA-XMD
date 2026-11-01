'use strict';

const { serialize } = require('../utils/serialize');
const { findCmd, triggers } = require('./loader');
const { isSudo, trackCmd } = require('../db/database');
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

const processed = new Set();
const presenceTimers = new Map();

setInterval(() => {
    if (processed.size > 500) processed.clear();
}, 600000);

// AUTO PRESENCE
async function updatePresence(sock, jid) {
    if (!sock || !jid) return;

    const flags = global.autoPresenceFlags ||= {
        typing: null,
        recording: null
    };

    const recording = flags.recording ?? config.AUTO_RECORDING;
    const typing = flags.typing ?? config.AUTO_TYPING;

    const presence = recording
        ? 'recording'
        : typing
            ? 'composing'
            : null;

    if (!presence) {
        const timer = presenceTimers.get(jid);
        if (timer) clearInterval(timer);
        presenceTimers.delete(jid);

        try {
            await sock.sendPresenceUpdate('paused', jid);
        } catch {}
        return;
    }

    try {
        await sock.sendPresenceUpdate(presence, jid);

        if (presenceTimers.has(jid)) {
            clearInterval(presenceTimers.get(jid));
        }

        const timer = setInterval(async () => {
            const currentRecording = flags.recording ?? config.AUTO_RECORDING;
            const currentTyping = flags.typing ?? config.AUTO_TYPING;

            if (!currentRecording && !currentTyping) {
                clearInterval(timer);
                presenceTimers.delete(jid);

                try {
                    await sock.sendPresenceUpdate('paused', jid);
                } catch {}
                return;
            }

            const currentPresence = currentRecording
                ? 'recording'
                : 'composing';

            try {
                await sock.sendPresenceUpdate(currentPresence, jid);
            } catch {}
        }, 10000);

        presenceTimers.set(jid, timer);
    } catch (err) {
        logger.error('PRESENCE', err.message);
    }
}

// MESSAGE PROCESSOR
async function processOne(raw, sock) {
    try {
        if (!raw?.message || !raw.key?.id) return;

        const id = raw.key.id;
        if (processed.has(id)) return;

        processed.add(id);
        setTimeout(() => processed.delete(id), 120000);

        if (raw.key.remoteJid === 'status@broadcast') return;

        if (process.env.DEBUG === 'true') {
            logger.info(
                'MSG',
                `${raw.key.fromMe ? '↗' : '↙'} ${raw.key.remoteJid}`
            );
        }

        const m = await serialize(raw, sock);
        if (!m) return;

        // AUTO TYPING / RECORDING - NO AUTO REACTION
        if (!m.fromMe && !m.isStatus) {
            await updatePresence(sock, m.from);
        }

        const ctx = buildCtx(m, sock);

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
                        text:
                            `✅ Welcome back *${m.pushName || m.sender.split('@')[0]}*!\n` +
                            `⏱️ Was AFK for: *${gone}*\n` +
                            `📝 Reason was: _${reason}_`,
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
                        text:
                            `😴 *@${jid.split('@')[0]} is AFK*\n` +
                            `📝 Reason: _${reason}_\n` +
                            `⏱️ Since: *${gone} ago*`,
                        mentions: [jid],
                        contextInfo: channelCtx()
                    }).catch(() => {});
                }
            }
        }

        // TRIGGERS
        if (triggers.length) {
            const matched = triggers.filter(({ pattern }) =>
                pattern.test(m.body)
            );

            if (matched.length) {
                Promise.allSettled(
                    matched.map(({ handler }) =>
                        handler(ctx).catch(err =>
                            logger.error('TRIGGER', err.message)
                        )
                    )
                );
            }
        }

        // COMMANDS
        if (!m.isCmd) return;

        const cmd = findCmd(m.command);
        if (!cmd) return;

        const ownerJid = config.OWNER_NUMBER + '@s.whatsapp.net';
        const isOwner =
            m.sender === cleanJid(ownerJid) || m.fromMe;

        const isSuperUser = isOwner || isSudo(m.sender);

        if (cmd.ownerOnly && !isOwner) {
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

        const mode = (config.MODE || 'public').toLowerCase().trim();

        if (mode === 'private' && !isSuperUser) return;
        if (mode === 'groups' && !m.isGroup && !isSuperUser) return;
        if (mode === 'dm' && m.isGroup && !isSuperUser) return;

        logger.info(
            'CMD',
            `${m.sender.split('@')[0]} → ${config.BOT_PREFIX}${m.command}`
        );

        trackCmd(cmd.name);

        cmd.handler(ctx).catch(err =>
            logger.error('CMD_ERR', `${m.command}: ${err.message}`)
        );

    } catch (err) {
        logger.error('MESSAGE', err.message);
    }
}

// MAIN HANDLER
function handleMessage({ messages, type }, sock) {
    if (type === 'append' || !messages?.length) return;

    Promise.allSettled(
        messages.map(raw => processOne(raw, sock))
    );
}

// CONTEXT BUILDER
function buildCtx(m, sock) {
    const reply = text =>
        sock.sendMessage(
            m.from,
            { text, contextInfo: channelCtx() },
            { quoted: m }
        );

    const send = (content, opts = {}) =>
        content.sticker !== undefined
            ? sock.sendMessage(m.from, content, opts)
            : sock.sendMessage(
                m.from,
                { ...content, contextInfo: channelCtx() },
                opts
            );

    const react = emoji =>
        sock.sendMessage(m.from, {
            react: { text: emoji, key: m.key }
        });

    const deleteMsg = (key = m.key) =>
        sock.sendMessage(m.from, { delete: key });

    const editMsg = (key, newText) =>
        sock.sendMessage(m.from, { text: newText, edit: key });

    return {
        m,
        sock,
        from: m.from,
        sender: m.sender,
        pushName: m.pushName,
        isGroup: m.isGroup,
        isAdmin: m.isAdmin,
        isBotAdmin: m.isBotAdmin,
        isOwner: m.isOwner,
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

module.exports = { handleMessage };
