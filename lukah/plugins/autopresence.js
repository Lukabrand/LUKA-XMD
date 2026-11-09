'use strict';

const { addCmd } = require('../../luka/handlers/loader');
const { getSetting, setSetting } = require('../../luka/db/database');
const config = require('../../luka/config/settings');

global.autoPresenceFlags ||= {
    typing: String(getSetting('AUTO_TYPING', config.AUTO_TYPING ?? false)) === 'true',
    recording: String(getSetting('AUTO_RECORDING', config.AUTO_RECORDING ?? false)) === 'true'
};

function registerCommand(name, type, key) {
    addCmd({
        name,
        aliases: [],
        desc: `${name.toUpperCase()} SETTINGS`,
        category: 'owner',
        ownerOnly: true,

        async handler(ctx) {
            const action = (ctx.args || []).join(' ').trim().toLowerCase();
            const flags = global.autoPresenceFlags;

            if (action === 'on' || action === 'off') {
                flags[type] = action === 'on';
                setSetting(key, String(flags[type]));
                config[key] = flags[type];
            }

            return ctx.reply(
                `*${name.toUpperCase()}*\nStatus: ${flags[type] ? 'ON' : 'OFF'}\n\nᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`
            );
        }
    });
}

registerCommand('autotyping', 'typing', 'AUTO_TYPING');
registerCommand('autorecording', 'recording', 'AUTO_RECORDING');
