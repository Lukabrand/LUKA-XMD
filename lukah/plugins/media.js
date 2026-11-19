'use strict';
const { addCmd } = require('../../luka/handlers/loader');
const config = require('../../luka/config/settings');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Jimp = require('jimp');

const BOT_NAME = config.BOT_NAME || 'LUKA-XMD';
const FOOTER = 'ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ';
const TEMP_DIR = path.join(os.tmpdir(), 'luka-media');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

function getContextInfo(ctx) {
    const message = ctx.m?.message || {};
    for (const type of ['extendedTextMessage','imageMessage','videoMessage','documentMessage','stickerMessage','audioMessage']) {
        if (message[type]?.contextInfo) return message[type].contextInfo;
    }
    return null;
}
function getQuotedMessage(ctx) { return getContextInfo(ctx)?.quotedMessage || null; }
function getQuotedType(ctx) {
    const quoted = getQuotedMessage(ctx);
    if (!quoted) return null;
    if (quoted.imageMessage) return 'image';
    if (quoted.videoMessage) return 'video';
    if (quoted.stickerMessage) return 'sticker';
    if (quoted.audioMessage) return 'audio';
    if (quoted.documentMessage) return 'document';
    return null;
}
function getQuotedKey(ctx) {
    const context = getContextInfo(ctx);
    if (!context?.stanzaId) return null;
    return { remoteJid: ctx.from, id: context.stanzaId, participant: context.participant };
}
function getTargetJid(ctx) {
    const context = getContextInfo(ctx);
    if (!context) return null;
    const mentioned = context.mentionedJid || [];
    if (mentioned.length) return mentioned[0];
    if (context.participant) return context.participant;
    if (context.stanzaId && ctx.from && !ctx.from.endsWith('@g.us')) return ctx.from;
    return null;
}
function normalizeTarget(target) {
    if (!target) return null;
    target = String(target).trim();
    if (target.endsWith('@s.whatsapp.net') || target.endsWith('@lid')) return target;
    if (target.includes('@')) return null;
    const number = target.replace(/\D/g, '');
    if (!/^\d{7,15}$/.test(number)) return null;
    return `${number}@s.whatsapp.net`;
}
function getInput(ctx) { return String(ctx.text || '').trim(); }
function isUrl(value) {
    try { return ['http:','https:'].includes(new URL(value).protocol); }
    catch { return false; }
}
function replyText(ctx, text) { return ctx.reply(`${text}\n\n${FOOTER}`); }

async function downloadQuotedMedia(ctx) {
    const quoted = getQuotedMessage(ctx);
    if (!quoted) throw new Error('Reply to a media message first.');
    const baileys = require('@whiskeysockets/baileys');
    if (typeof baileys.downloadContentFromMessage !== 'function') throw new Error('Baileys download utility is unavailable.');
    const mediaEntry = Object.entries(quoted).find(([key]) => ['imageMessage','videoMessage','stickerMessage','audioMessage','documentMessage'].includes(key));
    if (!mediaEntry) throw new Error('Unsupported quoted media.');
    const [key, message] = mediaEntry;
    const type = key.replace('Message', '');
    const stream = await baileys.downloadContentFromMessage(message, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return { buffer: Buffer.concat(chunks), type, message };
}
async function sendFile(ctx, filePath, mimetype, filename, caption) {
    await ctx.sock.sendMessage(ctx.from, { document: fs.readFileSync(filePath), mimetype, fileName: filename, caption }, { quoted: ctx.m });
}

addCmd({
    name: 'effect', aliases: ['jimp','imgeffect'], desc: 'Apply an effect to a quoted image', category: 'media',
    handler: async (ctx) => {
        const effect = (getInput(ctx) || 'grayscale').toLowerCase();
        const allowed = ['grayscale','invert','blur','pixelate','sepia'];
        if (!allowed.includes(effect)) return replyText(ctx, `Available effects: ${allowed.join(', ')}\nUsage: ${ctx.prefix || '.'}effect grayscale`);
        let inputPath, outputPath;
        try {
            await ctx.react('⏳');
            const media = await downloadQuotedMedia(ctx);
            if (media.type !== 'image') throw new Error('Reply to an image, not a video or sticker.');
            const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            inputPath = path.join(TEMP_DIR, `input-${id}.jpg`);
            outputPath = path.join(TEMP_DIR, `effect-${id}.jpg`);
            fs.writeFileSync(inputPath, media.buffer);
            let image = await Jimp.read(inputPath);
            switch (effect) {
                case 'grayscale': image = image.grayscale(); break;
                case 'invert': image = image.invert(); break;
                case 'blur': image = image.blur(5); break;
                case 'pixelate': image = image.pixelate(12); break;
                case 'sepia': image = image.sepia(); break;
            }
            await image.writeAsync(outputPath);
            await ctx.sock.sendMessage(ctx.from, { image: fs.readFileSync(outputPath), caption: `Image effect: ${effect}\n${FOOTER}` }, { quoted: ctx.m });
            await ctx.react('✅');
        } catch (error) {
            console.error('[EFFECT]', error);
            await ctx.react('❌');
            await replyText(ctx, error.message || 'Unable to process the image.');
        } finally {
            for (const file of [inputPath, outputPath]) if (file && fs.existsSync(file)) fs.unlinkSync(file);
        }
    }
});

addCmd({
    name: 'vcf', aliases: ['contact'], desc: 'Create a contact card', category: 'tools',
    handler: async (ctx) => {
        const parts = getInput(ctx).split('|').map(value => value.trim());
        if (parts.length < 2 || !parts[0] || !parts[1]) return replyText(ctx, `Usage: ${ctx.prefix || '.'}vcf Name|PhoneNumber\nExample: ${ctx.prefix || '.'}vcf Luka|255712345678`);
        const name = parts[0].replace(/[\r\n]/g, ' ');
        const phone = parts[1].replace(/[^\d+]/g, '');
        if (!/^\+?\d{7,15}$/.test(phone)) return replyText(ctx, 'Please enter a valid phone number.');
        const safeName = name.replace(/[\\,;]/g, ' ');
        const vcard = ['BEGIN:VCARD','VERSION:3.0',`FN:${safeName}`,`TEL;TYPE=CELL:${phone}`,'END:VCARD'].join('\r\n');
        try {
            await ctx.sock.sendMessage(ctx.from, { contacts: { displayName: name, contacts: [{ vcard }] } }, { quoted: ctx.m });
        } catch (error) {
            console.error('[VCF]', error);
            await replyText(ctx, 'Unable to create the contact card.');
        }
    }
});

addCmd({
    name: 'ban', aliases: ['blockuser'], desc: 'Block a WhatsApp user', category: 'owner', ownerOnly: true,
    handler: async (ctx) => {
        try {
            const target = normalizeTarget(getTargetJid(ctx) || getInput(ctx));
            if (!target) return replyText(ctx, `Reply to a user's message, mention them, or use:\n${ctx.prefix || '.'}ban 255712345678`);
            const botId = ctx.sock.user?.id;
            if (botId && botId.split(':')[0] === target.split('@')[0] && target.endsWith('@s.whatsapp.net')) return replyText(ctx, 'You cannot block the bot itself.');
            await ctx.sock.updateBlockStatus(target, 'block');
            await ctx.react('✅');
            return replyText(ctx, `USER BLOCKED SUCCESSFULLY\n\nTarget: ${target}`);
        } catch (error) {
            console.error('[BAN ERROR]', error);
            return replyText(ctx, `Failed to block user.\nError: ${error.message}`);
        }
    }
});

addCmd({
    name: 'banlist', aliases: ['blocked'], desc: 'Show blocked WhatsApp users', category: 'owner', ownerOnly: true,
    handler: async (ctx) => {
        try {
            const list = await ctx.sock.fetchBlocklist();
            if (!Array.isArray(list) || !list.length) return replyText(ctx, 'Your block list is empty.');
            return replyText(ctx, `BLOCKED USERS (${list.length})\n\n` + list.map((jid, index) => `${index + 1}. ${jid}`).join('\n'));
        } catch (error) {
            console.error('[BANLIST]', error);
            return replyText(ctx, `Unable to retrieve the block list.\n${error.message}`);
        }
    }
});

addCmd({
    name: 'unban', aliases: ['unblock'], desc: 'Unblock a WhatsApp user', category: 'owner', ownerOnly: true,
    handler: async (ctx) => {
        try {
            const target = normalizeTarget(getTargetJid(ctx) || getInput(ctx));
            if (!target) return replyText(ctx, `Reply to a user's message or use:\n${ctx.prefix || '.'}unban 255712345678`);
            await ctx.sock.updateBlockStatus(target, 'unblock');
            await ctx.react('✅');
            return replyText(ctx, `USER UNBLOCKED SUCCESSFULLY\n\nTarget: ${target}`);
        } catch (error) {
            console.error('[UNBAN ERROR]', error);
            return replyText(ctx, `Failed to unblock user.\nError: ${error.message}`);
        }
    }
});


addCmd({
    name: 'tourl', aliases: ['upload'], desc: 'Upload quoted media and return a URL', category: 'media',
    handler: async (ctx) => {
        if (!getQuotedType(ctx)) return replyText(ctx, `Reply to an image, video, or document with ${ctx.prefix || '.'}tourl`);
        return replyText(ctx, 'No media upload provider is configured. Connect a file-hosting API to enable this command.');
    }
});

addCmd({
    name: 'remini', aliases: ['enhance'], desc: 'Enhance an image', category: 'media',
    handler: async (ctx) => {
        if (getQuotedType(ctx) !== 'image') return replyText(ctx, `Reply to an image with ${ctx.prefix || '.'}remini`);
        return replyText(ctx, 'Image enhancement API is not configured yet.');
    }
});

addCmd({
    name: 'take', aliases: ['steal','rename'], desc: 'Rename a sticker pack', category: 'media',
    handler: async (ctx) => {
        if (getQuotedType(ctx) !== 'sticker') return replyText(ctx, `Reply to a sticker with ${ctx.prefix || '.'}take PackName`);
        const packName = getInput(ctx);
        if (!packName) return replyText(ctx, `Usage: ${ctx.prefix || '.'}take PackName`);
        return replyText(ctx, `Requested sticker pack: ${packName}\nSticker metadata utility is not configured yet.`);
    }
});

addCmd({
    name: 'toimg', aliases: ['toimage'], desc: 'Convert a sticker into an image', category: 'media',
    handler: async (ctx) => {
        if (getQuotedType(ctx) !== 'sticker') return replyText(ctx, `Reply to a static sticker with ${ctx.prefix || '.'}toimg`);
        return replyText(ctx, 'Sticker-to-image conversion is not configured yet.');
    }
});
