'use strict';

const messageCache = new Map();
const CACHE_TTL = 30 * 60 * 1000;
const MAX_CACHE = 5000;

const getOwnerJid = config => {
    const number = String(config.OWNER_NUMBER || '').replace(/\D/g, '');
    return number ? `${number}@s.whatsapp.net` : null;
};

const unwrapMessage = message => {
    if (!message) return null;
    return message.ephemeralMessage?.message ||
        message.viewOnceMessage?.message ||
        message.viewOnceMessageV2?.message ||
        message.viewOnceMessageV2Extension?.message || message;
};

const getMessageText = message => {
    const msg = unwrapMessage(message);
    if (!msg) return '';
    return msg.conversation ||
        msg.extendedTextMessage?.text ||
        msg.imageMessage?.caption ||
        msg.videoMessage?.caption ||
        msg.documentMessage?.caption ||
        msg.documentWithCaptionMessage?.message?.documentMessage?.caption ||
        msg.buttonsResponseMessage?.selectedDisplayText ||
        msg.listResponseMessage?.title ||
        msg.templateButtonReplyMessage?.selectedDisplayText ||
        msg.interactiveResponseMessage?.body?.text || '';
};

const getMessageType = message => {
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
};

const getSenderJid = message =>
    message.key?.participant || message.participant ||
    message.key?.remoteJid || 'Unknown';

const getMessageKey = update =>
    update?.update?.message?.protocolMessage?.key ||
    update?.message?.protocolMessage?.key || update?.key || null;

const isRevoke = update => {
    const protocol = update?.update?.message?.protocolMessage ||
        update?.message?.protocolMessage;
    return !!protocol && (protocol.type === 0 || protocol.type === 'REVOKE');
};

const cacheKey = (jid, id) => `${jid || 'unknown'}:${id}`;

function cleanCache() {
    const now = Date.now();
    for (const [key, item] of messageCache) {
        if (now - item.timestamp > CACHE_TTL) messageCache.delete(key);
    }
    while (messageCache.size > MAX_CACHE) {
        messageCache.delete(messageCache.keys().next().value);
    }
}

async function getAntiDeleteMode(config, getSetting) {
    try {
        const saved = typeof getSetting === 'function'
            ? await getSetting('ANTIDELETE') : null;
        return String(saved ?? config.ANTI_DELETE ?? 'indm').trim().toLowerCase();
    } catch (err) {
        console.error('[ANTI-DELETE] Database:', err.message);
        return String(config.ANTI_DELETE ?? 'indm').trim().toLowerCase();
    }
}

function attachAntiDelete(sock, config, getSetting) {
    if (!sock?.ev) throw new Error('Anti-Delete: Invalid WhatsApp socket.');
    if (sock.__lukaAntiDeleteAttached) return;
    sock.__lukaAntiDeleteAttached = true;

    sock.ev.on('messages.upsert', ({ messages }) => {
        if (!Array.isArray(messages)) return;

        for (const message of messages) {
            const key = message.key;
            if (!key?.id || !message.message || key.fromMe) continue;

            messageCache.set(cacheKey(key.remoteJid, key.id), {
                message,
                timestamp: Date.now()
            });
        }
        cleanCache();
    });

    sock.ev.on('messages.update', async updates => {
        if (!Array.isArray(updates)) return;

        for (const update of updates) {
            try {
                if (!isRevoke(update)) continue;

                const mode = await getAntiDeleteMode(config, getSetting);
                if (!['indm', 'true', 'on', '1'].includes(mode)) continue;

                cleanCache();

                const key = getMessageKey(update);
                if (!key?.id) continue;

                const cacheId = cacheKey(key.remoteJid, key.id);
                let cached = messageCache.get(cacheId);

                // Fallback kwa Baileys updates zisizo na remoteJid.
                if (!cached && !key.remoteJid) {
                    for (const [id, item] of messageCache) {
                        if (id.endsWith(`:${key.id}`)) {
                            cached = item;
                            messageCache.delete(id);
                            break;
                        }
                    }
                }

                if (!cached) {
                    console.log('[ANTI-DELETE] Message not found:', key.id);
                    continue;
                }

                messageCache.delete(cacheId);

                const original = cached.message;
                const ownerJid = getOwnerJid(config);
                if (!ownerJid) {
                    console.error('[ANTI-DELETE] OWNER_NUMBER missing.');
                    continue;
                }

                const chatJid = original.key?.remoteJid || key.remoteJid || 'Unknown';
                const sender = getSenderJid(original);
                const senderName = original.pushName || 'Unknown';
                const type = getMessageType(original.message);
                const text = getMessageText(original.message);
                const isGroup = chatJid.endsWith('@g.us');

                const report =
                    `🗑️ *LUKA-XMD ANTI-DELETE*\n\n` +
                    `👤 *Sender:* ${senderName}\n` +
                    `📱 *Number/JID:* ${sender}\n` +
                    `💬 *Chat:* ${chatJid}\n` +
                    `📍 *Chat type:* ${isGroup ? 'Group' : 'Private chat'}\n` +
                    `📦 *Message type:* ${type}\n` +
                    `🕒 *Detected:* ${new Date().toLocaleString()}\n\n` +
                    (text ? `📝 *Deleted message:*\n${text}\n\n` : '') +
                    `_ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ_`;

                await sock.sendMessage(ownerJid, { text: report });

                try {
                    await sock.sendMessage(ownerJid, { forward: original });
                } catch (err) {
                    console.error('[ANTI-DELETE] Forward failed:', err.message);
                }

                console.log(`[ANTI-DELETE] Report sent: ${key.id}`);
            } catch (err) {
                console.error('[ANTI-DELETE] Event error:', err.message);
            }
        }
    });

    console.log('[ANTI-DELETE] Listener attached.');
}

module.exports = { attachAntiDelete };
