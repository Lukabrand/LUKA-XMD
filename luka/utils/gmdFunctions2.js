'use strict';

const axios   = require('axios');
const config  = require('../config/settings');
const logger  = require('./logger');
const { gmdBanner, gmdTable, pickRandom, sleep } = require('./gmdFunctions');
const { getGroupSettings, getSetting }            = require('../db/database');
const {
    sendButtons:           giftedSendButtons,
    sendInteractiveMessage: giftedSendInteractive,
} = require('gifted-btns');

// ═══════════════════════════════════════════════════════════════
//  📢  CHANNEL CONTEXT INFO
//  Uses forwardedNewsletterMessageInfo so every response carries
//  a "Forwarded from <channel>" chip — works in groups & DMs.
//  Also includes externalAdReply for a richer card in DMs.
// ═══════════════════════════════════════════════════════════════

function channelCtx() {
    return {
        // Newsletter forwarding chip — shows "Forwarded from <channel>" tag
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid:     config.CHANNEL_JID,
            newsletterName:    config.CHANNEL_NEWSLETTER_NAME,
            serverMessageId:   Math.floor(Math.random() * 9000) + 1000,
        },
        // External ad card — rich preview in DMs
        externalAdReply: {
            title:                 config.BOT_NAME,
            body:                  '⚡ Follow our WhatsApp Channel',
            mediaType:             1,
            renderLargerThumbnail: false,
            showAdAttribution:     true,
            sourceUrl:             config.CHANNEL_URL,
            thumbnailUrl:          'https://files.catbox.moe/pj9a34.png',
        },
    };
}

async function sendWithChannel(sock, jid, content, opts = {}) {
    const ctx = channelCtx();
    if (content.sticker !== undefined) {
        return sock.sendMessage(jid, content, opts);
    }
    return sock.sendMessage(jid, { ...content, contextInfo: ctx }, opts);
}

// ═══════════════════════════════════════════════════════════════
//  ✨  EMOJIS
// ═══════════════════════════════════════════════════════════════

const REACT_EMOJIS = [
    '❤️','💛','💚','💙','💜','🧡','🤎','🖤','🤍',
    '🔥','⭐','🌟','✨','🎉','🎊','💯','🥰','😍',
    '👏','🙌','💪','🫡','🤩','😎','🐾',
];

const LINK_REGEX = /https?:\/\/[^\s]+|chat\.whatsapp\.com\/[^\s]+|wa\.me\/[^\s]+/gi;

// ═══════════════════════════════════════════════════════════════
//  💬  AUTO REACT
// ═══════════════════════════════════════════════════════════════

async function PantherAutoReact(emoji, msg, sock) {
    const em = emoji || pickRandom(REACT_EMOJIS);
    await sock.sendMessage(msg.key.remoteJid, {
        react: { text: em, key: msg.key },
    }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════
//  🔗  ANTI-LINK
// ═══════════════════════════════════════════════════════════════

async function PantherAntiLink(sock, msg, getGroupMetadataFn) {
    try {
        const { from, sender, body, isAdmin, isOwner, fromMe, isGroup } = msg;
        if (!isGroup || isAdmin || isOwner || fromMe) return;
        const settings = getGroupSettings(from);
        if (!settings?.antilink) return;
        if (!LINK_REGEX.test(body)) return;

        const groupMeta = await getGroupMetadataFn(sock, from).catch(() => null);
        const botJid    = sock.user?.id?.split(':')[0] + '@s.whatsapp.net';
        const isBotAdm  = groupMeta?.participants?.find(p => p.id === botJid)?.admin;
        const senderNum = sender.split('@')[0];

        await sock.sendMessage(from, { delete: msg.key }).catch(() => {});

        const text = gmdBanner('🔗 AntiLink Triggered', [
            `👤 User   : @${senderNum}`,
            `🚫 Action : Message Deleted`,
            `⚠️  Links are not allowed here!`,
        ], config.BOT_NAME);

        await sendWithChannel(sock, from, { text, mentions: [sender] });

        if (isBotAdm) {
            await sleep(1000);
            await sock.groupParticipantsUpdate(from, [sender], 'remove').catch(() => {});
            const kickText = gmdBanner('🚫 User Removed', [
                `👤 User   : @${senderNum}`,
                `📋 Reason : Sent a link`,
            ], config.BOT_NAME);
            await sendWithChannel(sock, from, { text: kickText, mentions: [sender] });
        }
    } catch (err) {
        logger.error('ANTILINK', err.message);
    }
}

// ═══════════════════════════════════════════════════════════════
//  🤬  ANTI BAD WORD
// ═══════════════════════════════════════════════════════════════

async function PantherAntiBad(sock, msg, badWords = []) {
    try {
        const { from, sender, body, isAdmin, isOwner, fromMe, isGroup } = msg;
        if (!isGroup || isAdmin || isOwner || fromMe) return;
        const settings = getGroupSettings(from);
        if (!settings?.antibadword) return;
        const lower = (body || '').toLowerCase();
        const found = badWords.find(w => lower.includes(w.toLowerCase()));
        if (!found) return;
        await sock.sendMessage(from, { delete: msg.key }).catch(() => {});
        const senderNum = sender.split('@')[0];
        const text = gmdBanner('🤬 Bad Word Detected', [
            `👤 User   : @${senderNum}`,
            `🚫 Action : Message Deleted`,
        ], config.BOT_NAME);
        await sendWithChannel(sock, from, { text, mentions: [sender] });
    } catch (err) {
        logger.error('ANTIBAD', err.message);
    }
}

// ═══════════════════════════════════════════════════════════════
//  📞  ANTI CALL
// ═══════════════════════════════════════════════════════════════

async function PantherAntiCall(calls, sock) {
    try {
        if (!getSetting('ANTI_CALL') || getSetting('ANTI_CALL') !== 'true') return;
        for (const call of (calls || [])) {
            if (call.isGroup) continue;
            await sock.rejectCall(call.id, call.from).catch(() => {});
            await sendWithChannel(sock, call.from, {
                text: `❌ *Calls are not allowed!*\n\n_${config.BOT_NAME} does not accept calls._`,
            }).catch(() => {});
        }
    } catch (err) {
        logger.error('ANTICALL', err.message);
    }
}

// ═══════════════════════════════════════════════════════════════
//  🗄️  MESSAGE STORE (ANTI-DELETE / ANTI-EDIT)
// ═══════════════════════════════════════════════════════════════

const msgStore = new Map();
const antiDeleteCache = new Set();
const antiEditCache = new Set();
const MESSAGE_TTL = 10 * 60 * 1000;
const MAX_STORED_MESSAGES = 2000;

function cleanMessageStore() {
    const now = Date.now();
    for (const [id, item] of msgStore) {
        if (!item?.timestamp || now - item.timestamp > MESSAGE_TTL) msgStore.delete(id);
    }
}

function storeMessage(msg) {
    try {
        if (!msg?.key?.id || !msg?.message) return;
        msgStore.set(msg.key.id, {
            msg,
            key: msg.key,
            from: msg.key.remoteJid || '',
            sender: msg.key.participant || msg.key.remoteJid || '',
            timestamp: Date.now(),
        });
        if (msgStore.size > MAX_STORED_MESSAGES) {
            const oldest = msgStore.keys().next().value;
            msgStore.delete(oldest);
        }
    } catch (err) {
        logger.error('MSGSTORE', err.message);
    }
}

function getStoredMessage(id) {
    const item = msgStore.get(id);
    if (!item) return undefined;
    if (Date.now() - item.timestamp > MESSAGE_TTL) {
        msgStore.delete(id);
        return undefined;
    }
    return item.msg?.message;
}

function getMessageText(message) {
    return message?.conversation ||
        message?.extendedTextMessage?.text ||
        message?.imageMessage?.caption ||
        message?.videoMessage?.caption ||
        message?.documentMessage?.caption ||
        message?.buttonsResponseMessage?.selectedDisplayText ||
        message?.listResponseMessage?.title ||
        '[Media / Non-text message]';
}

function getOwnerJid(sock) {
    const number = String(config.OWNER_NUMBER || '').replace(/\D/g, '');
    if (number) return `${number}@s.whatsapp.net`;
    const self = sock.user?.id || '';
    return self ? `${self.split(':')[0].split('@')[0]}@s.whatsapp.net` : null;
}

function isFeatureEnabled(feature, from) {
    const globalEnabled = Boolean(config[feature]);
    if (globalEnabled) return true;
    if (from?.endsWith('@g.us')) {
        const key = feature === 'ANTIDELETE' ? 'antidelete' : 'antiedit';
        return Boolean(getGroupSettings(from)?.[key]);
    }
    return false;
}

function trimCache(cache, key) {
    cache.add(key);
    setTimeout(() => cache.delete(key), 5000);
}

// ═══════════════════════════════════════════════════════════════
//  🗑️  ANTI-DELETE — sends recovered message to owner DM
// ═══════════════════════════════════════════════════════════════

async function PantherAntiDelete(sock, key) {
    try {
        if (!key?.id || !key?.remoteJid) return;
        if (!isFeatureEnabled('ANTIDELETE', key.remoteJid)) return;

        const cacheKey = `${key.remoteJid}_${key.id}_delete`;
        if (antiDeleteCache.has(cacheKey)) return;

        const stored = msgStore.get(key.id);
        if (!stored?.msg?.message) return;

        if (Date.now() - stored.timestamp > MESSAGE_TTL) {
            msgStore.delete(key.id);
            return;
        }

        const ownerJid = getOwnerJid(sock);

        if (!ownerJid) {
            logger.warn('ANTIDELETE', 'Owner JID unavailable. Check OWNER_NUMBER.');
            return;
        }

        trimCache(antiDeleteCache, cacheKey);

        const original = stored.msg;
        const from = stored.from || key.remoteJid || 'Unknown';
        const senderJid = stored.sender || from;
        const senderNumber = String(senderJid)
            .split('@')[0]
            .split(':')[0];

        const groupName = from.endsWith('@g.us')
            ? 'Group'
            : 'Private Chat';

        const messageType = Object.keys(original.message || {})[0]
            ?.replace('Message', '') || 'Unknown';

        const recoveredTime = new Date(stored.timestamp)
            .toLocaleString('en-GB', {
                timeZone: config.TIME_ZONE || 'Africa/Nairobi'
            });

        const deletedText = getMessageText(original.message);

        const text = `🗑️ *Deleted Message Recovered*

💬 Chat: ${groupName}
👤 Sender: @${senderNumber}
📂 Type: ${messageType}
🕒 Recovered: ${recoveredTime}
📱 Chat JID: ${from}

📝 *Deleted Message:*
${deletedText}

🐾 ${config.BOT_NAME}`;

        await sock.sendMessage(ownerJid, {
            text,
            mentions: senderJid.includes('@') ? [senderJid] : [],
            contextInfo: channelCtx()
        });

        logger.info(
            'ANTIDELETE',
            `Recovered ${key.id} from ${from} and sent to owner.`
        );

        msgStore.delete(key.id);

    } catch (err) {
        logger.error('ANTIDELETE', err.message);
    }
}

// ═══════════════════════════════════════════════════════════════
//  ✏️  ANTI-EDIT — sends before/after text to owner DM
// ═══════════════════════════════════════════════════════════════

async function PantherAntiEdit(sock, update) {
    try {
        const proto = update?.update?.message?.protocolMessage;
        const edited = proto?.editedMessage;
        const originalId = proto?.key?.id;
        const from = update?.key?.remoteJid;
        if (!edited || !originalId || !from || !isFeatureEnabled('ANTIEDIT', from)) return;

        const cacheKey = `${from}_${originalId}_edit`;
        if (antiEditCache.has(cacheKey)) return;
        const original = msgStore.get(originalId);
        if (!original?.msg?.message) return;
        trimCache(antiEditCache, cacheKey);

        const ownerJid = getOwnerJid(sock);
        if (!ownerJid) {
            logger.warn('ANTIEDIT', 'Owner JID is unavailable; set OWNER_NUMBER in .env.');
            return;
        }

        const editorJid = update.key.participant || original.sender || from;
        const editorNumber = String(editorJid).split('@')[0].split(':')[0];
        const oldText = getMessageText(original.msg.message);
        const newText = getMessageText(edited);
        const chatType = from.endsWith('@g.us') ? 'Group' : from === 'status@broadcast' ? 'Status' : 'Private Chat';
        const now = new Date().toLocaleString('en-GB', { timeZone: config.TIME_ZONE || 'Africa/Nairobi' });

        const text = gmdBanner('✏️ Message Edited', [
            `💬 Chat : ${chatType}`,
            `📱 Chat JID : ${from}`,
            `👤 Edited By : @${editorNumber}`,
            `🕒 Time : ${now}`,
            `📝 Before : ${oldText.slice(0, 1200)}`,
            `✏️ After : ${newText.slice(0, 1200)}`,
        ], config.BOT_NAME);

        await sendWithChannel(sock, ownerJid, {
            text,
            mentions: editorJid.includes('@') ? [editorJid] : [],
        });

        // Keep the latest version in cache in case the same message is edited again.
        original.msg = { ...original.msg, message: edited };
        original.timestamp = Date.now();
        msgStore.set(originalId, original);
        logger.info('ANTIEDIT', `Reported edit ${originalId} from ${from} to owner.`);
    } catch (err) {
        logger.error('ANTIEDIT', err.message);
    }
}

// Periodic cleanup keeps the in-memory store bounded.
setInterval(cleanMessageStore, 60 * 1000).unref?.();

// ═══════════════════════════════════════════════════════════════
//  🟢  PRESENCE
// ═══════════════════════════════════════════════════════════════

async function PantherPresence(sock, from, type = 'composing') {
    try {
        await sock.sendPresenceUpdate(type, from);
        await sleep(1500);
        await sock.sendPresenceUpdate('paused', from);
    } catch {}
}

// ═══════════════════════════════════════════════════════════════
//  🌿  AUTO BIO
// ═══════════════════════════════════════════════════════════════

const BIO_TEMPLATES = [
    () => `🐾 ${config.BOT_NAME} | Online 24/7 🌍`,
    () => `⏰ ${new Date().toLocaleTimeString('en-KE',{ timeZone: config.TIME_ZONE })} | 🤖 ${config.BOT_NAME}`,
    () => `🌟 ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ | ${new Date().toLocaleDateString('en-KE')}`,
    () => `🔥 ${config.BOT_NAME} is live! | +${config.OWNER_NUMBER}`,
    () => `💚 Serving users 24/7 | ${config.BOT_NAME} 🐾`,
    () => `💜 LUKA-XMD | ʟᴜᴋᴀʙʀᴀɴᴅ`,
];

async function PantherAutoBio(sock) {
    try {
        const bio = pickRandom(BIO_TEMPLATES)();
        await sock.updateProfileStatus(bio);
        logger.debug('AUTOBIO', `Bio updated: ${bio}`);
    } catch (err) {
        logger.debug('AUTOBIO', `Bio update skipped: ${err.message}`);
    }
}

// ═══════════════════════════════════════════════════════════════
//  📊  AUTO STATUS (view + like)
// ═══════════════════════════════════════════════════════════════

async function PantherStatusHandler(sock, messages) {
    for (const msg of messages) {
        if (msg.key.remoteJid !== 'status@broadcast') continue;
        try {
            if (config.AUTO_READ_STATUS) {
                await sock.readMessages([msg.key]).catch(() => {});
                logger.debug('STATUS', `Read status from ${msg.key.participant || msg.pushName}`);
            }
            if (config.AUTO_LIKE_STATUS) {
                const emojis = ['❤️','🔥','💛','💚','💙','🥰','😍','👏','🌟'];
                await sock.sendMessage(msg.key.remoteJid, {
                    react: { text: pickRandom(emojis), key: msg.key },
                }).catch(() => {});
            }
        } catch {}
    }
}

// ═══════════════════════════════════════════════════════════════
//  🤖  CHATBOT
// ═══════════════════════════════════════════════════════════════

const chatHistory = new Map();

async function PantherChatBot(sock, msg, settings) {
    try {
        const from   = msg?.from;
        const sender = msg?.sender;
        const body   = msg?.body;
        if (!body || body.startsWith(config.BOT_PREFIX)) return;
        if (getSetting('CHATBOT') !== 'true') return;
        const botNum = sock.user?.id?.split('@')[0].split(':')[0];
        if (msg.isGroup &&
            !body.includes(botNum) &&
            !body.toLowerCase().includes(config.BOT_NAME.toLowerCase())) return;

        await PantherPresence(sock, from, 'composing');

        const systemPrompt =
            `You are ${config.BOT_NAME}, a helpful WhatsApp assistant by GuruTech (+${config.OWNER_NUMBER}). ` +
            `Be friendly, concise and use relevant emojis. Never say you are ChatGPT or any other AI.`;

        const response = await axios.get(
            `https://text.pollinations.ai/${encodeURIComponent(body)}?system=${encodeURIComponent(systemPrompt)}`,
            { timeout: 20000 }
        ).then(r => r.data).catch(() => null);

        if (!response) return;
        const reply = typeof response === 'string' ? response.trim() : JSON.stringify(response);

        const hist = chatHistory.get(sender) || [];
        hist.push({ role: 'user', content: body });
        hist.push({ role: 'assistant', content: reply });
        if (hist.length > 20) hist.splice(0, 2);
        chatHistory.set(sender, hist);

        await sendWithChannel(sock, from, { text: `🤖 ${reply}` }, { quoted: msg.m });
    } catch (err) {
        logger.error('CHATBOT', err.message);
    }
}

// ═══════════════════════════════════════════════════════════════
//  👥  ANTI GROUP MENTION
// ═══════════════════════════════════════════════════════════════

async function PantherAntiGroupMention(sock, msg) {
    try {
        const { from, sender, isGroup, isAdmin, isOwner, fromMe } = msg;
        if (!isGroup || isAdmin || isOwner || fromMe) return;
        const settings = getGroupSettings(from);
        if (!settings?.antispam) return;
        const mentions = msg.m?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (mentions.length < 5) return;
        await sock.sendMessage(from, { delete: msg.m.key }).catch(() => {});
        const text = gmdBanner('🚫 Mass Mention Blocked', [
            `👤 User    : @${sender.split('@')[0]}`,
            `🔢 Mentions: ${mentions.length} users`,
            `📋 Reason  : Spam / Mass mention`,
        ], config.BOT_NAME);
        await sendWithChannel(sock, from, { text, mentions: [sender] });
    } catch (err) {
        logger.error('ANTI_MENTION', err.message);
    }
}

// ═══════════════════════════════════════════════════════════════
//  📋  COPY BUTTON HELPER
// ═══════════════════════════════════════════════════════════════

async function sendCopyButton(sock, jid, opts = {}, msgOpts = {}) {
    const {
        body     = '',
        footer   = config.BOT_NAME,
        copyText = '',
        btnLabel = '📋 Copy',
    } = opts;

    try {
        return await giftedSendButtons(sock, jid, {
            text:    body,
            footer,
            buttons: [
                {
                    name:             'cta_copy',
                    buttonParamsJson: JSON.stringify({
                        display_text: btnLabel,
                        copy_code:    copyText,
                    }),
                },
            ],
        }, msgOpts);
    } catch (err) {
        logger.error('SEND_COPY_BTN', `gifted-btns error: ${err.message} — falling back to plain text`);
        return sock.sendMessage(jid, {
            text:        [body, footer].filter(Boolean).join('\n\n'),
            contextInfo: channelCtx(),
        }, msgOpts).catch(() => {});
    }
}

// ─── sendButtons ─────────────────────────────────────────────────────────────
async function sendButtons(sock, jid, opts = {}, msgOpts = {}) {
    const {
        body    = '',
        text    = '',
        title   = '',
        footer  = config.BOT_NAME,
        image   = null,
        buttons = [],
    } = opts;

    const bodyText = text || body;

    const normalised = buttons.map((btn) => {
        if (btn.name !== undefined || btn.id !== undefined) return btn;
        if (btn.type === 'url') {
            return {
                name:             'cta_url',
                buttonParamsJson: JSON.stringify({
                    display_text: btn.label || '🔗 Open',
                    url:          btn.value || '',
                    merchant_url: btn.value || '',
                }),
            };
        }
        if (btn.type === 'call') {
            return {
                name:             'cta_call',
                buttonParamsJson: JSON.stringify({
                    display_text: btn.label || '📞 Call',
                    phone_number: btn.value || '',
                }),
            };
        }
        if (btn.type === 'copy') {
            return {
                name:             'cta_copy',
                buttonParamsJson: JSON.stringify({
                    display_text: btn.label || '📋 Copy',
                    copy_code:    btn.value || '',
                }),
            };
        }
        return btn;
    });

    let giftedResult = null;
    try {
        giftedResult = await Promise.race([
            giftedSendButtons(sock, jid, {
                title,
                text:    bodyText,
                footer,
                image,
                buttons: normalised,
            }, msgOpts),
            new Promise(resolve => setTimeout(() => resolve(null), 5000)),
        ]);
    } catch (err) {
        logger.warn('SEND_BUTTONS', `gifted-btns threw: ${err.message} — using fallback`);
    }

    if (giftedResult?.key?.id) return giftedResult;

    logger.warn('SEND_BUTTONS', 'gifted-btns did not confirm delivery — sending plain fallback');
    const lines = [title && `*${title}*`, bodyText, footer].filter(Boolean);
    const plainText = lines.join('\n\n');

    if (image) {
        return sock.sendMessage(jid, {
            image,
            caption:     plainText,
            contextInfo: channelCtx(),
        }, msgOpts).catch(() =>
            sock.sendMessage(jid, {
                text:        plainText,
                contextInfo: channelCtx(),
            }, msgOpts).catch(() => {})
        );
    }

    return sock.sendMessage(jid, {
        text:        plainText,
        contextInfo: channelCtx(),
    }, msgOpts).catch(() => {});
}

module.exports = {
    channelCtx,
    sendWithChannel,
    REACT_EMOJIS,
    LINK_REGEX,
    PantherAutoReact,
    PantherAntiLink,
    PantherAntiBad,
    PantherAntiCall,
    storeMessage,
    getStoredMessage,
    cleanMessageStore,
    msgStore,
    PantherAntiDelete,
    PantherAntiEdit,
    PantherPresence,
    PantherAutoBio,
    PantherStatusHandler,
    PantherChatBot,
    PantherAntiGroupMention,
    sendCopyButton,
    sendButtons,
};
