'use strict';

const { serialize } = require('../utils/serialize');
const { findCmd, triggers } = require('./loader');
const { isSudo, trackCommand: trackCmd } = require('../db/database');
const config = require('../config/settings');
const logger = require('../utils/logger');
const { cleanJid } = require('../utils/helpers');

const {
    channelCtx,
    PantherAntiViewOnce
} = require('../utils/gmdFunctions2');

const processed = new Set();

setInterval(() => {
    if (processed.size > 5000) processed.clear();
}, 600000).unref?.();

function getAfkMap() {
    try {
        return require('../../lukah/plugins/extras').AFK_MAP;
    } catch {
        return null;
    }
}

function getOwnerJid() {
    const number = String(config.OWNER_NUMBER || '').replace(/\D/g, '');
    return number ? cleanJid(`${number}@s.whatsapp.net`) : null;
}

async function processOne(raw, sock) {
    try {
        if (!raw?.message || !raw?.key?.id) return;

        const messageId = `${raw.key.remoteJid}:${raw.key.id}`;

        if (processed.has(messageId)) return;

        processed.add(messageId);

        setTimeout(() => {
            processed.delete(messageId);
        }, 120000).unref?.();

        if (raw.key.remoteJid === 'status@broadcast') return;

        // ANTI VIEW ONCE — GLOBAL (DM + GROUPS)
        if (!raw.key.fromMe) {
            await PantherAntiViewOnce(sock, raw);
        }

        if (process.env.DEBUG === 'true') {
            logger.info(
                'MSG',
                `${raw.key.fromMe ? '↗' : '↙'} ${raw.key.remoteJid}`
            );
        }

        const m = await serialize(raw, sock);

        if (!m) return;

        // AUTO TYPING / RECORDING
        if (!m.fromMe && !m.isStatus) {
            const flags = global.autoPresenceFlags ||= {
                typing: null,
                recording: null
            };

            const recording =
                flags.recording ?? config.AUTO_RECORDING;

            const typing =
                flags.typing ?? config.AUTO_TYPING;

            const presence = recording
                ? 'recording'
                : typing
                    ? 'composing'
                    : null;

            if (presence && m.from) {
                Promise.resolve(
                    sock.sendPresenceUpdate(presence, m.from)
                ).catch(() => {});

                setTimeout(() => {
                    Promise.resolve(
                        sock.sendPresenceUpdate('paused', m.from)
                    ).catch(() => {});
                }, 5000).unref?.();
            }
        }

        const ctx = buildCtx(m, sock);

        // AFK SYSTEM
        if (!m.fromMe && !m.isStatus) {
            const AFK_MAP = getAfkMap();

            if (AFK_MAP instanceof Map) {

                if (AFK_MAP.has(m.sender)) {
                    const { reason, time } = AFK_MAP.get(m.sender);

                    AFK_MAP.delete(m.sender);

                    const seconds = Math.floor(
                        (Date.now() - time) / 1000
                    );

                    const gone = formatDuration(seconds);

                    sock.sendMessage(m.from, {
                        text:
                            `✅ Welcome back *${m.pushName || m.sender.split('@')[0]}*!\n` +
                            `⏱️ Was AFK for: *${gone}*\n` +
                            `📝 Reason was: _${reason || 'No reason'}_`,
                        contextInfo: channelCtx()
                    }).catch(() => {});
                }

                const mentions =
                    m.message?.extendedTextMessage
                        ?.contextInfo?.mentionedJid || [];

                for (const jid of mentions) {
                    if (!AFK_MAP.has(jid)) continue;

                    const { reason, time } = AFK_MAP.get(jid);

                    const seconds = Math.floor(
                        (Date.now() - time) / 1000
                    );

                    const gone = formatDuration(seconds);

                    sock.sendMessage(m.from, {
                        text:
                            `😴 *@${jid.split('@')[0]} is AFK*\n` +
                            `📝 Reason: _${reason || 'No reason'}_\n` +
                            `⏱️ Since: *${gone} ago*`,
                        mentions: [jid],
                        contextInfo: channelCtx()
                    }).catch(() => {});
                }
            }
        }

        // TRIGGERS
        if (Array.isArray(triggers) && triggers.length) {
            const matched = triggers.filter(({ pattern }) => {
                if (!(pattern instanceof RegExp)) return false;

                pattern.lastIndex = 0;

                return pattern.test(m.body || '');
            });

            for (const trigger of matched) {
                Promise.resolve()
                    .then(() => trigger.handler(ctx))
                    .catch(error => {
                        logger.error(
                            'TRIGGER',
                            error.message || String(error)
                        );
                    });
            }
        }

        // COMMANDS
        if (!m.isCmd) return;

        if (!m.command) return;

        const cmd = findCmd(m.command);

        if (!cmd || typeof cmd.handler !== 'function') {
            return;
        }

        // OWNER CHECK
        const ownerJid = getOwnerJid();

        const sender = cleanJid(m.sender);

        const isOwner =
            (ownerJid && sender === ownerJid) ||
            m.fromMe === true;

        const sudoUser = isSudo(sender);

        const isSuperUser = isOwner || sudoUser;

        // OWNER ONLY
        if (cmd.ownerOnly && !isOwner) {
            return ctx.reply(
                '❌ This command is for the *bot owner* only.'
            );
        }

        // GROUP ONLY
        if (cmd.groupOnly && !m.isGroup) {
            return ctx.reply(
                '❌ This command can only be used in *groups*.'
            );
        }

        // ADMIN ONLY
        if (
            cmd.adminOnly &&
            !m.isAdmin &&
            !isSuperUser
        ) {
            return ctx.reply(
                '❌ This command requires *group admin* privileges.'
            );
        }

        // BOT MODE
        const mode = String(
            config.MODE || 'public'
        ).toLowerCase().trim();

        if (mode === 'private' && !isSuperUser) return;

        if (
            mode === 'groups' &&
            !m.isGroup &&
            !isSuperUser
        ) return;

        if (
            mode === 'dm' &&
            m.isGroup &&
            !isSuperUser
        ) return;

        // COMMAND LOG
        logger.info(
            'CMD',
            `${m.sender.split('@')[0]} → ${config.BOT_PREFIX || '.'}${m.command}`
        );

        // TRACK COMMAND
        try {
            if (typeof trackCmd === 'function') {
                trackCmd(cmd.name || m.command);
            }
        } catch (error) {
            logger.error(
                'TRACK_CMD',
                error.message || String(error)
            );
        }

        // EXECUTE COMMAND
        Promise.resolve()
            .then(() => cmd.handler(ctx))
            .catch(error => {
                logger.error(
                    'CMD_ERR',
                    `${m.command}: ${error.message || String(error)}`
                );
            });

    } catch (error) {
        logger.error(
            'MESSAGE',
            error.stack || error.message || String(error)
        );
    }
}

// FORMAT AFK TIME
function formatDuration(seconds) {
    if (seconds >= 3600) {
        return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds / 60) % 60}m`;
    }

    if (seconds >= 60) {
        return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    }

    return `${seconds}s`;
}

// MESSAGE HANDLER
function handleMessage(update, sock) {
    try {
        const { messages, type } = update || {};

        if (!Array.isArray(messages) || !messages.length) return;

        if (type === 'append') return;

        for (const raw of messages) {
            processOne(raw, sock).catch(error => {
                logger.error(
                    'PROCESS_MESSAGE',
                    error.message || String(error)
                );
            });
        }

    } catch (error) {
        logger.error(
            'HANDLE_MESSAGE',
            error.message || String(error)
        );
    }
}

// COMMAND CONTEXT
function buildCtx(m, sock) {

    const reply = (text) => {
        return sock.sendMessage(
            m.from,
            {
                text: String(text),
                contextInfo: channelCtx()
            },
            {
                quoted: m
            }
        );
    };

    const send = (content, opts = {}) => {
        if (!content || typeof content !== 'object') {
            return reply(content);
        }

        if (
            content.sticker !== undefined ||
            content.audio !== undefined ||
            content.video !== undefined ||
            content.image !== undefined ||
            content.document !== undefined
        ) {
            return sock.sendMessage(m.from, content, opts);
        }

        return sock.sendMessage(
            m.from,
            {
                ...content,
                contextInfo: content.contextInfo || channelCtx()
            },
            {
                quoted: m,
                ...opts
            }
        );
    };

    const react = (emoji) => {
        return sock.sendMessage(m.from, {
            react: {
                text: emoji,
                key: m.key
            }
        });
    };

    const deleteMsg = (key = m.key) => {
        return sock.sendMessage(m.from, {
            delete: key
        });
    };

    const editMsg = (key, newText) => {
        return sock.sendMessage(m.from, {
            text: newText,
            edit: key
        });
    };

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

module.exports = {
    handleMessage,
    processOne,
    buildCtx
};
