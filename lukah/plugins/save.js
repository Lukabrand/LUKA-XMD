
'use strict';

const { addCmd } = require('../../luka/handlers/loader');
const config = require('../../luka/config/settings');
const {
    downloadMediaMessage,
    downloadContentFromMessage
} = require('@whiskeysockets/baileys');

function getQuotedMessage(ctx) {
    const quoted = ctx?.quoted || ctx?.m?.quoted;

    if (quoted) {
        return {
            message: quoted.message || quoted,
            key: ctx?.quotedKey || ctx?.m?.quotedKey || quoted.key || null
        };
    }

    const visited = new Set();

    function find(obj, depth = 0) {
        if (!obj || typeof obj !== 'object' || depth > 15 || visited.has(obj)) return null;
        visited.add(obj);

        if (obj.contextInfo?.quotedMessage) {
            return {
                message: obj.contextInfo.quotedMessage,
                key: {
                    remoteJid: ctx?.from || ctx?.m?.key?.remoteJid,
                    id: obj.contextInfo.stanzaId,
                    participant: obj.contextInfo.participant,
                    fromMe: false
                }
            };
        }

        for (const value of Object.values(obj)) {
            if (value && typeof value === 'object') {
                const result = find(value, depth + 1);
                if (result) return result;
            }
        }

        return null;
    }

    return find(ctx?.m?.message);
}

function unwrapMessage(message) {
    let msg = message;
    const wrappers = [
        'ephemeralMessage',
        'viewOnceMessage',
        'viewOnceMessageV2',
        'viewOnceMessageV2Extension',
        'documentWithCaptionMessage'
    ];

    const visited = new Set();

    while (msg && typeof msg === 'object' && !visited.has(msg)) {
        visited.add(msg);

        const wrapper = wrappers.find(key => msg[key]?.message);
        if (!wrapper) break;

        msg = msg[wrapper].message;
    }

    return msg;
}

async function downloadMedia(quoted, ctx) {
    const original = quoted.message;
    const msg = unwrapMessage(original);

    const types = [
        ['imageMessage', 'image'],
        ['videoMessage', 'video'],
        ['audioMessage', 'audio'],
        ['documentMessage', 'document'],
        ['stickerMessage', 'sticker']
    ];

    for (const [key, type] of types) {
        const mediaMessage = msg?.[key];
        if (!mediaMessage) continue;

        const wamessage = {
            key: quoted.key || {
                remoteJid: ctx?.from || ctx?.m?.key?.remoteJid,
                id: '',
                fromMe: false
            },
            message: original
        };

        try {
            const buffer = await downloadMediaMessage(
                wamessage,
                'buffer',
                {},
                {
                    logger: console,
                    reuploadRequest: async message =>
                        ctx.sock.updateMediaMessage(message)
                }
            );

            if (buffer?.length) {
                return { buffer, type, message: mediaMessage };
            }
        } catch (error) {
            console.error('[BAILEYS DOWNLOAD]', error.message);
        }

        // Fallback: direct media download
        if (mediaMessage.url || mediaMessage.directPath) {
            const stream = await downloadContentFromMessage(mediaMessage, type);
            const chunks = [];

            for await (const chunk of stream) {
                chunks.push(chunk);
            }

            const buffer = Buffer.concat(chunks);

            if (buffer.length) {
                return { buffer, type, message: mediaMessage };
            }
        }

        throw new Error(
            `WhatsApp haikuweza kurejesha ${type}. Huenda media haipo tena kwenye server.`
        );
    }

    return null;
}

function getSessionJid(sock) {
    const rawId = String(sock?.user?.id || '').trim();
    if (!rawId) return null;

    const [user, domain] = rawId.split('@');
    const number = user?.split(':')[0].replace(/\D/g, '');

    return number && domain ? `${number}@${domain}` : null;
}

async function sendToOwner(ctx, mode = 'all') {
    try {
        const quoted = getQuotedMessage(ctx);

        if (!quoted) {
            return ctx.reply('❌ Reply to an image, video, audio, document, or sticker.');
        }

        const ownerJid = getSessionJid(ctx.sock);

        if (!ownerJid) {
            return ctx.reply('❌ WhatsApp session number is unavailable.');
        }

        const media = await downloadMedia(quoted, ctx);

        if (!media) {
            return ctx.reply('❌ No supported media found.');
        }

        if (mode === 'sticker' && media.type !== 'sticker') {
            return ctx.reply('❌ Reply to a sticker.');
        }

        const caption =
            `📥 *SAVED MEDIA*\n\n` +
            `🤖 Bot: ${config.BOT_NAME || 'LUKA-XMD'}\n` +
            `👤 Requested by: ${ctx.sender || 'Unknown'}\n` +
            `📂 Type: ${media.type}\n\n` +
            `ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`;

        const m = media.message;
        let content;

        switch (media.type) {
            case 'image':
                content = { image: media.buffer, caption };
                break;

            case 'video':
                content = { video: media.buffer, caption };
                break;

            case 'audio':
                content = {
                    audio: media.buffer,
                    mimetype: m.mimetype || 'audio/mpeg',
                    ptt: m.ptt || false
                };
                break;

            case 'document':
                content = {
                    document: media.buffer,
                    mimetype: m.mimetype || 'application/octet-stream',
                    fileName: m.fileName || 'saved_file',
                    caption
                };
                break;

            case 'sticker':
                content = { sticker: media.buffer };
                break;

            default:
                return ctx.reply('❌ Unsupported media type.');
        }

        await ctx.sock.sendMessage(ownerJid, content);
        await ctx.reply('✅ Media sent to the bot owner successfully.');
        await ctx.react('✅');

    } catch (error) {
        console.error('[SAVE TO OWNER]', error);
        await ctx.reply(`❌ Failed: ${error.message}`);
    }
}

addCmd({
    name: 'save',
    aliases: ['saver', 'savefile'],
    desc: 'Send replied media to the connected WhatsApp session',
    category: 'general',
    handler: async ctx => sendToOwner(ctx)
});

addCmd({
    name: 'vv',
    aliases: ['viewonce', 'retrievemedia'],
    desc: 'Send quoted media to the connected WhatsApp session',
    category: 'general',
    handler: async ctx => sendToOwner(ctx)
});

addCmd({
    name: 'steal',
    aliases: ['getsticker', 'savesticker'],
    desc: 'Send a replied sticker to the connected WhatsApp session',
    category: 'general',
    handler: async ctx => sendToOwner(ctx, 'sticker')
});

addCmd({
    name: 'take',
    aliases: ['getmedia', 'reupload'],
    desc: 'Send replied media to the connected WhatsApp session',
    category: 'general',
    handler: async ctx => sendToOwner(ctx)
});

addCmd({
    name: 'saveall',
    aliases: ['saveany', 'fetchmedia'],
    desc: 'Send supported replied media to the connected WhatsApp session',
    category: 'general',
    handler: async ctx => sendToOwner(ctx)
});
