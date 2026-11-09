'use strict';

const {
    addCmd,
    addTrigger
} = require('../../luka/handlers/loader');

const {
    getSetting,
    setSetting,
    getGroupSettings,
    setGroupSetting
} = require('../../luka/db/database');

const config = require('../../luka/config/settings');
const moment = require('moment-timezone');

const {
    channelCtx,
    sendButtons
} = require('../../luka/utils/gmdFunctions2');

// ═══════════════════════════════════════════════════════════════
// AUTO PRESENCE
// ═══════════════════════════════════════════════════════════════

global.autoPresenceFlags ||= {
    typing: null,
    recording: null
};

const SETTINGS = {
    typing: 'AUTO_TYPING',
    recording: 'AUTO_RECORDING'
};

// ═══════════════════════════════════════════════════════════════
// GET STATUS
// ═══════════════════════════════════════════════════════════════

async function getPresenceStatus(type) {
    try {
        const saved = await getSetting(SETTINGS[type]);

        if (saved !== undefined && saved !== null) {
            return saved === true || String(saved).toLowerCase() === 'true';
        }

        return config[SETTINGS[type]] === true;
    } catch (error) {
        return config[SETTINGS[type]] === true;
    }
}

// ═══════════════════════════════════════════════════════════════
// SAVE STATUS
// ═══════════════════════════════════════════════════════════════

async function savePresenceStatus(type, value) {
    await setSetting(SETTINGS[type], value);
    global.autoPresenceFlags[type] = value;
}

// ═══════════════════════════════════════════════════════════════
// REGISTER COMMAND
// ═══════════════════════════════════════════════════════════════

function registerCommand(name, description, type) {
    addCmd({
        name,
        aliases: [],
        desc: description,
        category: 'owner',
        ownerOnly: true,

        async handler(ctx) {
            const action = (ctx.args || [])
                .join(' ')
                .trim()
                .toLowerCase();

            if (action === 'on' || action === 'off') {
                const status = action === 'on';

                try {
                    await savePresenceStatus(type, status);

                    return ctx.reply(
                        `*${description}*\nStatus: ${status ? 'ON ✅' : 'OFF ❌'}\n\nᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`
                    );
                } catch (error) {
                    console.error(`[${name}]`, error);

                    return ctx.reply(
                        `❌ Settings save failed!\n${error.message}`
                    );
                }
            }

            const currentStatus = await getPresenceStatus(type);
            global.autoPresenceFlags[type] = currentStatus;

            return ctx.reply(
                `*${description}*\nStatus: ${currentStatus ? 'ON ✅' : 'OFF ❌'}\n\nᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`
            );
        }
    });
}

// ═══════════════════════════════════════════════════════════════
// COMMANDS
// ═══════════════════════════════════════════════════════════════

registerCommand('autotyping', 'AUTO TYPING SETTINGS', 'typing');

registerCommand('autorecording', 'AUTO RECORDING SETTINGS', 'recording');

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
    getPresenceStatus,
    savePresenceStatus
};

// ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ
