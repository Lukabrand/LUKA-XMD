'use strict';

const { addCmd } = require('../../luka/handlers/loader');
const config = require('../../luka/config/settings');
const {
    downloadContentFromMessage,
} = require('@whiskeysockets/baileys');


function getQuotedMessage(ctx) {
    // serialize.js already extracts quotedMessage from all supported
    // contextInfo locations. Prefer that normalized value, then fall back
    // to the raw Baileys message for older/edge-case message shapes.
    if (ctx?.quoted) return ctx.quoted;
    if (ctx?.m?.quoted) return ctx.m.quoted;

    const message = ctx?.m?.message;
    if (!message) return null;

    const wrappers = [
        'ephemeralMessage',
        'viewOnceMessage',
        'viewOnceMessageV2',
        'viewOnceMessageV2Extension',
        'documentWithCaptionMessage',
    ];

    let current = message;
    const visited = new Set();

    while (current && typeof current === 'object' && !visited.has(current)) {
        visited.add(current);

        for (const value of Object.values(current)) {
            if (value?.contextInfo?.quotedMessage) {
                return value.contextInfo.quotedMessage;
            }
        }

        let next = null;
        for (const wrapper of wrappers) {
            if (current[wrapper]?.message) {
                next = current[wrapper].message;
                break;
            }
        }
        if (!next) break;
        current = next;
    }

    return null;
}

function unwrapMessage(message) {
    let msg = message;
    const wrappers = [
        'ephemeralMessage',
        'viewOnceMessage',
        'viewOnceMessageV2',
        'viewOnceMessageV2Extension',
        'documentWithCaptionMessage',
    ];
    const visited = new Set();

    while (msg && typeof msg === 'object' && !visited.has(msg)) {
        visited.add(msg);
        let next = null;

        for (const wrapper of wrappers) {
            if (msg[wrapper]?.message) {
                next = msg[wrapper].message;
                break;
            }
        }

        if (!next) break;
        msg = next;
    }

    return msg;
}

async function downloadMedia(message) {
    const msg = unwrapMessage(message);

    const types = [
        ['imageMessage', 'image'],
        ['videoMessage', 'video'],
        ['audioMessage', 'audio'],
        ['documentMessage', 'document'],
        ['stickerMessage', 'sticker'],
    ];

    for (const [key, type] of types) {
        if (!msg?.[key]) continue;

        const mediaMessage = msg[key];
        const stream = await downloadContentFromMessage(
            mediaMessage,
            type
        );

        const chunks = [];

        for await (const chunk of stream) {
            chunks.push(chunk);
        }

        return {
            buffer: Buffer.concat(chunks),
            type,
            message: mediaMessage,
        };
    }

    return null;
}

function getSessionJid(sock) {
    // The connected WhatsApp account is the owner/destination.
    // Baileys may return an ID such as 2557xxxx:12@s.whatsapp.net.
    const rawId = String(sock?.user?.id || '').trim();
    if (!rawId) return null;

    const [userPart, domainPart] = rawId.split('@');
    if (!userPart || !domainPart) return null;

    const number = userPart.split(':')[0].replace(/\D/g, '');
    if (!number) return null;

    return `${number}@${domainPart}`;
}

async function sendToOwner(ctx, mode = 'all') {
    const quoted = getQuotedMessage(ctx);

    if (!quoted) {
        return ctx.reply(
            '❌ Reply to an image, video, audio, document, or sticker.'
        );
    }

    const ownerJid = getSessionJid(ctx.sock);

    if (!ownerJid) {
        return ctx.reply(
            '❌ WhatsApp session number is unavailable. Make sure the bot is connected.'
        );
    }

    try {
        const media = await downloadMedia(quoted);

        if (!media) {
            return ctx.reply('❌ No supported media found.');
        }

        if (mode === 'sticker' && media.type !== 'sticker') {
            return ctx.reply('❌ Reply to a sticker and try again.');
        }

        const caption =
            `📥 *SAVED MEDIA*\n\n` +
            `🤖 Bot: ${config.BOT_NAME || 'LUKA-XMD'}\n` +
            `👤 Requested by: ${ctx.sender || 'Unknown'}\n` +
            `📂 Type: ${media.type}\n\n` +
            `ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`;

        let content;

        switch (media.type) {
            case 'image':
                content = {
                    image: media.buffer,
                    caption,
                };
                break;

            case 'video':
                content = {
                    video: media.buffer,
                    caption,
                };
                break;

            case 'audio':
                content = {
                    audio: media.buffer,
                    mimetype: media.message.mimetype || 'audio/mpeg',
                    ptt: media.message.ptt || false,
                };
                break;

            case 'document':
                content = {
                    document: media.buffer,
                    mimetype: media.message.mimetype ||
                        'application/octet-stream',
                    fileName: media.message.fileName || 'saved_file',
                    caption,
                };
                break;

            case 'sticker':
                content = {
                    sticker: media.buffer,
                };
                break;
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
    handler: async (ctx) => sendToOwner(ctx),
});

addCmd({
    name: 'vv',
    aliases: ['viewonce', 'retrievemedia'],
    desc: 'Send quoted media to the connected WhatsApp session',
    category: 'general',
    handler: async (ctx) => sendToOwner(ctx),
});

addCmd({
    name: 'steal',
    aliases: ['getsticker', 'savesticker'],
    desc: 'Send a replied sticker to the connected WhatsApp session',
    category: 'general',
    handler: async (ctx) => sendToOwner(ctx, 'sticker'),
});

addCmd({
    name: 'take',
    aliases: ['getmedia', 'reupload'],
    desc: 'Send replied media to the connected WhatsApp session',
    category: 'general',
    handler: async (ctx) => sendToOwner(ctx),
});

addCmd({
    name: 'saveall',
    aliases: ['saveany', 'fetchmedia'],
    desc: 'Send supported replied media to the connected WhatsApp session',
    category: 'general',
    handler: async (ctx) => sendToOwner(ctx),
});
