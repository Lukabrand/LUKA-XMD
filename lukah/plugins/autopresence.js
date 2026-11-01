'use strict';

const { addCmd } = require('../../luka/handlers/loader');

global.autoPresenceFlags ||= {
    typing: null,
    recording: null
};

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

            const flags = global.autoPresenceFlags;

            if (action === 'on') {
                flags[type] = true;
            } else if (action === 'off') {
                flags[type] = false;
            } else {
                const status = flags[type] ?? false;

                return ctx.reply(
                    `*${description}*\n\n` +
                    `Usage: .${name} on\n` +
                    `Usage: .${name} off\n\n` +
                    `Status: ${status ? 'ON' : 'OFF'}\n\n` +
                    `ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`
                );
            }

            return ctx.reply(
                `*${description}*\n\n` +
                `Status: ${flags[type] ? 'ENABLED' : 'DISABLED'}\n\n` +
                `ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`
            );
        }
    });
}

registerCommand('autotyping', 'AUTO TYPING SETTINGS', 'typing');
registerCommand('autorecording', 'AUTO RECORDING SETTINGS', 'recording');
