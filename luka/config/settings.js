'use strict';
require('dotenv').config({ path: '.env' });
const { gunzipSync } = require('node:zlib');

const DEFAULT_BOT_PIC = 'https://files.catbox.moe/pj9a34.png';
const DEFAULT_CHANNEL_JID = '120363431857319034@newsletter';
const DEFAULT_CHANNEL_URL = 'https://whatsapp.com/channel/0029VbDh88NCMY0Fartkxm1g';

function parsePrefixes(prefixStr) {
    if (!prefixStr || prefixStr.trim() === '' || prefixStr.toLowerCase() === 'none') return [];
    return prefixStr.split(',').map(p => p.trim()).filter(Boolean);
}

function parseBoolean(value) {
    if (typeof value === 'string') return ['on', 'true', '1', 'yes'].includes(value.toLowerCase());
    return Boolean(value);
}

function parseLids(lidStr) {
    if (!lidStr || lidStr.trim() === '') return [];
    return lidStr.split(',').map(l => l.trim()).filter(Boolean).map(l => l.includes('@') ? l : `${l}@lid`);
}

function parseMenuImages(menuImagesStr, fallbackImage) {
    if (!menuImagesStr || menuImagesStr.trim() === '') return fallbackImage ? [fallbackImage] : [];
    return menuImagesStr.split(',').map(img => img.trim()).filter(Boolean);
}

function normalizeSession(rawSession) {
    const session = rawSession?.trim();
    if (!session) return null;
    let jsonText;
    if (session.startsWith('LUKA~')) {
        try {
            jsonText = gunzipSync(Buffer.from(session.slice('LUKA~'.length), 'base64')).toString('utf8');
        } catch {
            throw new Error('SESSION_ID has the LUKA~ prefix but is not valid gzip/base64 data.');
        }
    } else {
        try {
            jsonText = Buffer.from(session, 'base64').toString('utf8');
        } catch {
            throw new Error('SESSION must be base64-encoded credentials, or SESSION_ID must use the LUKA~ format.');
        }
    }
    try {
        JSON.parse(jsonText);
    } catch {
        throw new Error('The supplied WhatsApp session decoded, but was not valid credentials JSON.');
    }
    return Buffer.from(jsonText, 'utf8').toString('base64');
}

const botPic = process.env.BOT_PIC || DEFAULT_BOT_PIC;
const sessionInput = process.env.SESSION?.trim() || process.env.SESSION_ID?.trim() || '';

const CONFIG = {
    MODE: (process.env.MODE || 'public').trim().toLowerCase(),
    BOT_PREFIX: parsePrefixes(process.env.BOT_PREFIX || '.'),
    PORT: parseInt(process.env.PORT, 10) || 3000,
    SESSION: normalizeSession(sessionInput),
    SESSION_FORMAT: !sessionInput ? null : sessionInput.startsWith('LUKA~') ? 'LUKA~ gzip/base64' : 'base64 creds.json',
    TZ: process.env.TZ || process.env.TIME_ZONE || 'Africa/Nairobi',

    ANTI_CALL: parseBoolean(process.env.ANTI_CALL ?? process.env.ANTICALL ?? 'off'),
    ANTI_VV: parseBoolean(process.env.ANTI_VV || 'on'),
    ANTIDELETE: parseBoolean(process.env.ANTIDELETE || 'on'),
    ANTIEDIT: parseBoolean(process.env.ANTIEDIT || 'on'),
    AUTO_READ: parseBoolean(process.env.AUTO_READ || 'off'),
    AUTO_READ_STATUS: parseBoolean(process.env.AUTO_READ_STATUS || 'on'),
    AUTO_LIKE_STATUS: parseBoolean(process.env.AUTO_LIKE_STATUS || 'on'),
    AUTO_REACT: parseBoolean(process.env.AUTO_REACT || 'off'),
    AUTO_BIO: parseBoolean(process.env.AUTO_BIO || 'on'),
    STATUS_LIKE_EMOJIS: process.env.STATUS_LIKE_EMOJIS || '💚,💜',
    DM_PRESENCE: process.env.DM_PRESENCE || '',
    GRP_PRESENCE: process.env.GRP_PRESENCE || '',
    USER_LID: parseLids(process.env.USER_LID || ''),
    OWNER_NUMBER: (process.env.OWNER_NUMBER || '').replace(/\D/g, ''),
    OWNER_NAME: process.env.OWNER_NAME || 'ʟᴜᴋᴀʙʀᴀɴᴅ',
    BOT_NAME: process.env.BOT_NAME || 'LUKA-XMD',
    BOT_PIC: botPic,
    BOT_VERSION: process.env.BOT_VERSION || '5.0.0',
    MENU_IMAGES: parseMenuImages(process.env.MENU_IMAGES || '', botPic),
    MENU_THEME: process.env.MENU_THEME || 'ʟᴜᴋᴀʙʀᴀɴᴅ',
    CHATBOT: parseBoolean(process.env.CHATBOT || 'off'),
    CHAT_MODE: process.env.CHAT_MODE || 'private',
    WHATSAPP_USERNAME: process.env.WHATSAPP_USERNAME || '',
    CHANNEL_JID: process.env.CHANNEL_JID || process.env.NEWSLETTER_JID || DEFAULT_CHANNEL_JID,
    CHANNEL_URL: process.env.CHANNEL_URL || process.env.NEWSLETTER_URL || DEFAULT_CHANNEL_URL,
    HOSTING_URL: process.env.HOSTING_URL || '',
    HOSTING_PROVIDER: process.env.HOSTING_PROVIDER || '',
    GITHUB_REPO: process.env.GITHUB_REPO || 'Lukabrand/LUKA-XMD',
    AUTO_JOIN_GROUP_LINK: process.env.AUTO_JOIN_GROUP_LINK || process.env.GROUP_INVITE_LINK || 'https://chat.whatsapp.com/LvzOybevMoU3zyhk29bweM?s=cl&p=a&iam=2'
};

module.exports = CONFIG;
module.exports.normalizeSession = normalizeSession;
