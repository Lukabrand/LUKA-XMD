'use strict';

const {
    getSetting
} = require('../../luka/db/database');

const config = require('../../luka/config/settings');

function toBoolean(value, fallback = false) {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }

    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;

    return ['true', '1', 'yes', 'on', 'enabled'].includes(
        String(value).toLowerCase().trim()
    );
}

async function getAutoSetting(key) {
    try {
        const value = await getSetting(key);

        return toBoolean(value, Boolean(config[key]));
    } catch (error) {
        console.error(`[AUTOPRESENCE] ${key}:`, error.message);

        return Boolean(config[key]);
    }
}

async function autoPresence(sock, message) {
    try {
        if (!sock || typeof sock.sendPresenceUpdate !== 'function') {
            return false;
        }

        const jid = message?.key?.remoteJid;

        if (!jid) return false;

        // Ignore status broadcasts
        if (jid === 'status@broadcast') return false;

        // Ignore messages sent by the bot
        if (message?.key?.fromMe) return false;

        // Read settings
        const [autoTyping, autoRecording] = await Promise.all([
            getAutoSetting('AUTO_TYPING'),
            getAutoSetting('AUTO_RECORDING')
        ]);

        // Both disabled
        if (!autoTyping && !autoRecording) {
            return false;
        }

        // Recording takes priority when both are enabled
        if (autoRecording) {
            await sock.sendPresenceUpdate('recording', jid);
            return true;
        }

        if (autoTyping) {
            await sock.sendPresenceUpdate('composing', jid);
            return true;
        }

        return false;

    } catch (error) {
        console.error('[AUTOPRESENCE ERROR]:', error.message);
        return false;
    }
}

module.exports = autoPresence;
module.exports.autoPresence = autoPresence;
module.exports.getAutoSetting = getAutoSetting;
