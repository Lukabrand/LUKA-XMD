'use strict';
require('dotenv').config();

const onOff = (key, def = 'off') => {
    const v = process.env[key];
    return v == null || v === '' ? def : ['true', 'on', '1', 'yes'].includes(String(v).toLowerCase().trim()) ? 'on' : 'off';
};
const env = (key, def = '') => process.env[key] || def;

const config = {
    // 🤖 BOT IDENTITY
    BOT_NAME: env('BOT_NAME', 'LUKA-XMD'),
    OWNER_NAME: env('OWNER_NAME', 'ʟᴜᴋᴀʙʀᴀɴᴅ'),
    OWNER_NUMBER: env('OWNER_NUMBER', ''),
    WHATSAPP_USERNAME: env('WHATSAPP_USERNAME', ''),
    BOT_PREFIX: env('BOT_PREFIX', '.'),
    BOT_VERSION: '5.0.0',
    PACK_NAME: env('BOT_NAME', 'LUKA-XMD'),
    PACK_AUTHOR: env('OWNER_NAME', 'ʟᴜᴋᴀʙʀᴀɴᴅ'),

    // 🎨 MENU
    MENU_THEME: env('MENU_THEME', 'ʟᴜᴋᴀʙʀᴀɴᴅ'),
    MENU_THEMES: ['ʟᴜᴋᴀʙʀᴀɴᴅ', 'ULTRA', 'PANTHER', 'NEON', 'GALAXY'],

    // 📡 CHANNEL
    CHANNEL_URL: env('CHANNEL_URL', 'https://whatsapp.com/channel/0029Vb9cTL57z4kh6oBTcr3h'),
    CHANNEL_NAME: env('CHANNEL_NAME', 'LUKA-XMD Channel'),
    CHANNEL_JID: env('CHANNEL_JID', '120363432546073321@newsletter'),
    CHANNEL_NEWSLETTER_NAME: env('CHANNEL_NEWSLETTER_NAME', '『 LUKA-XMD 』'),

    // 🔐 CONNECTION
    SESSION_ID: env('SESSION_ID'),
    MODE: env('MODE', 'public'),
    TIME_ZONE: env('TIME_ZONE', 'Africa/Nairobi'),

    // ⚙️ AUTO FEATURES
    AUTO_READ_STATUS: onOff('AUTO_READ_STATUS', 'on'),
    AUTO_LIKE_STATUS: onOff('AUTO_LIKE_STATUS', 'on'),
    AUTO_REACT: onOff('AUTO_REACT', 'off'),
    AUTO_BIO: onOff('AUTO_BIO', 'on'),
    AUTO_TYPING: onOff('AUTO_TYPING', 'off'),
    AUTO_RECORDING: onOff('AUTO_RECORDING', 'off'),
    GHOST_MODE: onOff('GHOST_MODE', 'off'),
    FREEZE_LAST_SEEN: onOff('FREEZE_LAST_SEEN', 'off'),
    STATUS_REPLY: onOff('STATUS_REPLY', 'off'),
    AUTO_STICKER: onOff('AUTO_STICKER', 'off'),

    // 🤖 CHATBOT
    CHATBOT: onOff('CHATBOT', 'off'),
    CHATBOT_MODE: onOff('CHATBOT_MODE', 'off'),

    // 👁️ STATUS
    AUTO_STATUS_SEEN: onOff('AUTO_STATUS_SEEN', 'on'),
    AUTO_STATUS_REACT: onOff('AUTO_STATUS_REACT', 'on'),
    AUTO_STATUS_MSG: env('AUTO_STATUS_MSG'),
    Status_Saver: onOff('Status_Saver', 'off'),
    Status_Saver_Owner_Notify: onOff('Status_Saver_Owner_Notify', 'off'),
    STATUS_MSG: env('STATUS_MSG'),
    STATUS_LIKE_EMOJIS: env('STATUS_LIKE_EMOJIS', '💜,💚,💙'),
    CUSTOM_REACT_EMOJIS: env('CUSTOM_REACT_EMOJIS', '🪾,🌴,🪻,🌿,🌲,🌵,🍂,☄️,🪽,🪶,🚀,🍖'),

    // 🗄️ DATABASE & SERVER
    DATABASE_URL: process.env.DATABASE_URL || null,
    PORT: parseInt(process.env.PORT, 10) || 5000,

    // 🛡️ SECURITY
    ANTI_VV: onOff('ANTI_VV', 'on'),
    ANTI_DELETE: onOff('ANTI_DELETE', 'on'),
    AUTO_FOLLOW_CHANNEL: onOff('AUTO_FOLLOW_CHANNEL', 'on'),
    AUTO_JOIN_GROUPS: env('AUTO_JOIN_GROUPS'),
    AUTO_UPDATE: onOff('AUTO_UPDATE', 'on'),

    // 📅 LICENSE
    EXPIRY_DATE: env('EXPIRY_DATE')
};

module.exports = config;

// ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ
