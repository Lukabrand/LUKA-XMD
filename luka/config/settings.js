'use strict';
require('dotenv').config();

const env = (key, def = '') => process.env[key] === undefined || process.env[key] === '' ? def : process.env[key];

const parseBoolean = (value, fallback = false) => {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    return ['true', 'on', '1', 'yes'].includes(String(value).trim().toLowerCase());
};

const parsePrefixes = (value) => !value || value.trim() === '' || value.toLowerCase() === 'none' ? [] : value.split(',').map(p => p.trim()).filter(Boolean);

const parseLids = (value) => !value || value.trim() === '' ? [] : value.split(',').map(l => l.trim()).filter(Boolean).map(l => l.includes('@') ? l : `${l}@lid`);

const parseMenuImages = (value, fallback) => !value || value.trim() === '' ? (fallback ? [fallback] : []) : value.split(',').map(i => i.trim()).filter(Boolean);

function normalizeSession(raw) {
    const session = raw?.trim();
    if (!session) return null;
    let json;
    if (session.startsWith('LUKA~')) {
        try {
            json = require('zlib').gunzipSync(Buffer.from(session.slice(5), 'base64')).toString('utf8');
        } catch {
            throw new Error('SESSION_ID has invalid LUKA~ gzip/base64 data.');
        }
    } else {
        json = Buffer.from(session, 'base64').toString('utf8');
    }
    try {
        JSON.parse(json);
    } catch {
        throw new Error('WhatsApp session decoded, but credentials JSON is invalid.');
    }
    return Buffer.from(json, 'utf8').toString('base64');
}

const DEFAULT_BOT_PIC = 'https://files.catbox.moe/pj9a34.png';
const DEFAULT_CHANNEL_JID = '120363427012090993@newsletter';
const DEFAULT_CHANNEL_URL = 'https://whatsapp.com/channel/0029Vb9cTL57z4kh6oBTcr3h';
const sessionInput = env('SESSION').trim() || env('SESSION_ID').trim();
const botPic = env('BOT_PIC', DEFAULT_BOT_PIC);

const config = {
    BOT_NAME: env('BOT_NAME', 'LUKA-XMD'),
    OWNER_NAME: env('OWNER_NAME', 'ʟᴜᴋᴀʙʀᴀɴᴅ'),
    OWNER_NUMBER: env('OWNER_NUMBER', '').replace(/\D/g, ''),
    BOT_PREFIX: env('BOT_PREFIX', '.'),
    PREFIXES: parsePrefixes(env('PREFIXES', env('BOT_PREFIX', '.'))),
    BOT_VERSION: env('BOT_VERSION', '1.0.0'),
    PACK_NAME: env('PACK_NAME', env('BOT_NAME', 'LUKA-XMD')),
    PACK_AUTHOR: env('PACK_AUTHOR', env('OWNER_NAME', 'ʟᴜᴋᴀʙʀᴀɴᴅ')),
    BOT_PIC: botPic,
    MENU_IMAGES: parseMenuImages(env('MENU_IMAGES'), botPic),

    CHANNEL_URL: env('CHANNEL_URL', DEFAULT_CHANNEL_URL),
    CHANNEL_NAME: env('CHANNEL_NAME', 'LUKA-XMD Channel'),
    CHANNEL_JID: env('CHANNEL_JID', DEFAULT_CHANNEL_JID),
    CHANNEL_NEWSLETTER_NAME: env('CHANNEL_NEWSLETTER_NAME', '『 LUKA-XMD 』'),

    SESSION_ID: env('SESSION_ID'),
    SESSION: normalizeSession(sessionInput),
    SESSION_FORMAT: !sessionInput ? null : sessionInput.startsWith('LUKA~') ? 'LUKA~ gzip/base64' : 'base64 creds.json',

    MODE: env('MODE', 'public').trim().toLowerCase(),
    TIME_ZONE: env('TIME_ZONE', 'Africa/Nairobi'),
    TZ: env('TZ', env('TIME_ZONE', 'Africa/Nairobi')),

    AUTO_READ_STATUS: parseBoolean(env('AUTO_READ_STATUS'), true),
    AUTO_LIKE_STATUS: parseBoolean(env('AUTO_LIKE_STATUS'), true),
    AUTO_REACT: parseBoolean(env('AUTO_REACT'), false),
    AUTO_BIO: parseBoolean(env('AUTO_BIO'), true),
    AUTO_TYPING: parseBoolean(env('AUTO_TYPING'), false),
    AUTO_RECORDING: parseBoolean(env('AUTO_RECORDING'), false),
    AUTO_READ: parseBoolean(env('AUTO_READ'), false),
    AUTO_VIEW: parseBoolean(env('AUTO_VIEW', env('AUTO_READ_STATUS', 'true')), true),
    AUTO_LIKE: parseBoolean(env('AUTO_LIKE', env('AUTO_LIKE_STATUS', 'true')), true),

    DM_PRESENCE: env('DM_PRESENCE'),
    GRP_PRESENCE: env('GRP_PRESENCE'),
    USER_LID: parseLids(env('USER_LID')),

    GHOST_MODE: parseBoolean(env('GHOST_MODE'), false),
    FREEZE_LAST_SEEN: parseBoolean(env('FREEZE_LAST_SEEN'), false),
    ANTICALL: parseBoolean(env('ANTICALL'), false),
    ANTIDELETE: parseBoolean(env('ANTIDELETE'), true),
    ANTIEDIT: parseBoolean(env('ANTIEDIT'), true),

    AUTO_STATUS_SEEN: env('AUTO_STATUS_SEEN', String(parseBoolean(env('AUTO_READ_STATUS'), true))),
    AUTO_STATUS_REACT: env('AUTO_STATUS_REACT', String(parseBoolean(env('AUTO_LIKE_STATUS'), true))),
    AUTO_STATUS_MSG: env('AUTO_STATUS_MSG'),

    Status_Saver: env('Status_Saver', 'false'),
    Status_Saver_Owner_Notify: env('Status_Saver_Owner_Notify', 'false'),
    STATUS_REPLY: parseBoolean(env('STATUS_REPLY'), false),
    STATUS_MSG: env('STATUS_MSG'),

    CUSTOM_REACT_EMOJIS: env('CUSTOM_REACT_EMOJIS', '🪾,🌴,🪻,🌿,🌲,🌵,🍂,☄️,🪽,🪶,🚀,🍖'),
    AUTO_STICKER: parseBoolean(env('AUTO_STICKER'), false),

    DATABASE_URL: env('DATABASE_URL', null),
    PORT: parseInt(env('PORT', '5000'), 10) || 5000,

    ANTI_VV: parseBoolean(env('ANTI_VV'), true),
    AUTO_FOLLOW_CHANNEL: parseBoolean(env('AUTO_FOLLOW_CHANNEL'), true),
    AUTO_JOIN_GROUPS: env('AUTO_JOIN_GROUPS'),
    AUTO_JOIN_GROUP_LINK: env('AUTO_JOIN_GROUP_LINK', env('GROUP_INVITE_LINK')),
    AUTO_UPDATE: parseBoolean(env('AUTO_UPDATE'), true),

    GITHUB_REPO: env('GITHUB_REPO'),
    HOSTING_URL: env('HOSTING_URL'),
    HOSTING_PROVIDER: env('HOSTING_PROVIDER'),
    EXPIRY_DATE: env('EXPIRY_DATE')
};

module.exports = config;
module.exports.parseBoolean = parseBoolean;
module.exports.parsePrefixes = parsePrefixes;
module.exports.parseLids = parseLids;
module.exports.parseMenuImages = parseMenuImages;
module.exports.normalizeSession = normalizeSession;
