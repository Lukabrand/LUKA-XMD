'use strict';

const messageCache = new Map();

const CACHE_TTL = 30 * 60 * 1000;
const MAX_CACHE = 5000;

function getOwnerJid(config) {
    const number = String(config.OWNER_NUMBER || '')
        .replace(/\D/g, '');

    if (!number) return null;

    return `${number}@s.whatsapp.net`;
}

function unwrapMessage(message) {
    if (!message) return null;

    return (
        message.ephemeralMessage?.message ||
        message.viewOnceMessage?.message ||
        message.viewOnceMessageV2?.message ||
        message.viewOnceMessageV2Extension?.message ||
        message
    );
}

function getMessageText(message) {
    const msg = unwrapMessage(message);
    if (!msg) return '';

    return (
        msg.conversation ||
        msg.extendedTextMessage?.text ||
        msg.imageMessage?.caption ||
        msg.videoMessage?.caption ||
        msg.documentMessage?.caption ||
        msg.documentWithCaptionMessage?.message?.documentMessage?.caption ||
        msg.buttonsResponseMessage?.selectedDisplayText ||
        msg.listResponseMessage?.title ||
        msg.templateButtonReplyMessage?.selectedDisplayText ||
        msg.interactiveResponseMessage?.body?.text ||
        ''
    );
}

function getMessageType(message) {
    const msg = unwrapMessage(message);
    if (!msg) return 'Unknown';

    if (msg.conversation || msg.extendedTextMessage) return 'Text';
    if (msg.imageMessage) return 'Image';
    if (msg.videoMessage) return 'Video';
    if (msg.audioMessage) return 'Audio';
    if (msg.documentMessage || msg.documentWithCaptionMessage) return 'Document';
    if (msg.stickerMessage) return 'Sticker';
    if (msg.contactMessage || msg.contactsArrayMessage) return 'Contact';
    if (msg.locationMessage || msg.liveLocationMessage) return 'Location';
    if (msg.buttonsMessage || msg.templateMessage) return 'Interactive';
    if (msg.reactionMessage) return 'Reaction';

    return 'Other';
}

function getSenderJid(message) {
    return (
        message.key?.participant ||
        message.participant ||
        message.key?.remoteJid ||
        'Unknown'
    );
}

function getMessageKey(update) {
    const protocolKey =
        update?.update?.message?.protocolMessage?.key ||
        update?.message?.protocolMessage?.key;

    return protocolKey || update?.key || null;
}

function isRevoke(update) {
    const protocol =
        update?.update?.message?.protocolMessage ||
        update?.message?.protocolMessage;

    if (!protocol) return false;

    // Baileys REVOKE type is normally 0.
    return protocol.type === 0 || protocol.type === 'REVOKE';
}

function cleanCache() {
    const now = Date.now();

    for (const [id, item] of messageCache) {
        if (now - item.timestamp > CACHE_TTL) {
            messageCache.delete(id);
        }
    }

    while (messageCache.size > MAX_CACHE) {
        const oldestKey = messageCache.keys().next().value;
        if (!oldestKey) break;
        messageCache.delete(oldestKey);
    }
}

async function getAntiDeleteMode(config, getSetting) {
    let savedMode = null;

    try {
        if (typeof getSetting === 'function') {
            savedMode = await getSetting('ANTIDELETE');
        }
    } catch (error) {
        console.error(
            '[ANTI-DELETE] Could not read database setting:',
            error.message
        );
    }

    return String(
        savedMode || config.ANTI_DELETE || 'indm'
    ).trim().toLowerCase();
}

function attachAntiDelete(sock, config, getSetting) {
    if (!sock?.ev) {
        throw new Error('Anti-Delete: Invalid WhatsApp socket.');
    }

    // Prevent duplicate listeners on the same socket.
    if (sock.__lukaAntiDeleteAttached) return;

    sock.__lukaAntiDeleteAttached = true;

    // Cache incoming messages before they are deleted.
    sock.ev.on('messages.upsert', ({ messages }) => {
        if (!Array.isArray(messages)) return;

        for (const message of messages) {
            try {
                const key = message.key;
                const id = key?.id;

                if (!id || !message.message) continue;
                if (key.fromMe) continue;

                messageCache.set(id, {
                    message,
                    timestamp: Date.now(),
                });
            } catch (error) {
                console.error(
                    '[ANTI-DELETE] Cache error:',
                    error.message
                );
            }
        }

        cleanCache();
    });

    // Detect messages deleted for everyone.
    sock.ev.on('messages.update', async (updates) => {
        if (!Array.isArray(updates)) return;

        for (const update of updates) {
            try {
                if (!isRevoke(update)) continue;

                const mode = await getAntiDeleteMode(config, getSetting);

                // Enabled for indm / true / on.
                if (!['indm', 'true', 'on'].includes(mode)) continue;

                const key = getMessageKey(update);
                const id = key?.id;

                if (!id) continue;

                const cached = messageCache.get(id);

                if (!cached) {
                    console.log(
                        '[ANTI-DELETE] Original message not found in cache:',
                        id
                    );
                    continue;
                }

                // Remove from cache to prevent duplicate reports.
                messageCache.delete(id);

                const original = cached.message;
                const ownerJid = getOwnerJid(config);

                if (!ownerJid) {
                    console.error(
                        '[ANTI-DELETE] OWNER_NUMBER is missing in config.'
                    );
                    continue;
                }

                const chatJid =
                    original.key?.remoteJid ||
                    key?.remoteJid ||
                    'Unknown';

                const sender = getSenderJid(original);
                const senderName = original.pushName || 'Unknown';
                const messageType = getMessageType(original.message);
                const messageText = getMessageText(original.message);
                const isGroup = chatJid.endsWith('@g.us');

                const report =
                    `🗑️ *LUKA-XMD ANTI-DELETE*\n\n` +
                    `👤 *Sender:* ${senderName}\n` +
                    `📱 *Number/JID:* ${sender}\n` +
                    `💬 *Chat:* ${chatJid}\n` +
                    `📍 *Chat type:* ${isGroup ? 'Group' : 'Private chat'}\n` +
                    `📦 *Message type:* ${messageType}\n` +
                    `🕒 *Detected:* ${new Date().toLocaleString()}\n\n` +
                    (
                        messageText
                            ? `📝 *Deleted message:*\n${messageText}\n\n`
                            : ''
                    ) +
                    `_ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ_`;

                // Send report to owner's private inbox.
                await sock.sendMessage(ownerJid, {
                    text: report,
                });

                // Forward the original message, including media if supported.
                try {
                    await sock.sendMessage(ownerJid, {
                        forward: original,
                    });
                } catch (forwardError) {
                    console.error(
                        '[ANTI-DELETE] Forward failed:',
                        forwardError.message
                    );
                }

                console.log(
                    `[ANTI-DELETE] Report sent to owner for message ${id}`
                );
            } catch (error) {
                console.error(
                    '[ANTI-DELETE] Event error:',
                    error.message
                );
            }
        }
    });

    console.log('[ANTI-DELETE] Listener attached.');
}

module.exports = {
    attachAntiDelete,
};
