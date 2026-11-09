'use strict';

const { addCmd } = require('../../handlers/loader');

const {
    getSetting,
    setSetting,
} = require('../../db/database');

const config = require('../../config/settings');

const FOOTER = 'ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ';

const PRESENCE_SETTINGS = {
    autotyping: {
        key: 'AUTO_TYPING',
        title: 'AUTO TYPING',
    },

    autorecording: {
        key: 'AUTO_RECORDING',
        title: 'AUTO RECORDING',
    },
};

async function getStatus(key) {
    const value = await getSetting(key);

    if (value === undefined || value === null || value === '') {
        return Boolean(config[key]);
    }

    return value === true ||
        value === 1 ||
        String(value).toLowerCase() === 'true';
}

function registerPresenceCommand(name, setting) {
    addCmd({
        name,
        aliases: [],
        desc: `${setting.title} SETTINGS`,
        category: 'owner',
        ownerOnly: true,

        async handler(ctx) {
            const action = (ctx.args || [])
                .join(' ')
                .trim()
                .toLowerCase();

            try {
                const currentStatus = await getStatus(setting.key);

                if (!['on', 'off'].includes(action)) {
                    return ctx.reply(
                        `*${setting.title} SETTINGS*\n\n` +
                        `Usage: .${name} on\n` +
                        `Usage: .${name} off\n\n` +
                        `Status: ${currentStatus ? 'ON 🟢' : 'OFF 🔴'}\n\n` +
                        FOOTER
                    );
                }

                const enabled = action === 'on';

                await setSetting(
                    setting.key,
                    String(enabled)
                );

                config[setting.key] = enabled;

                return ctx.reply(
                    `*${setting.title} SETTINGS*\n\n` +
                    `Status: ${enabled ? 'ENABLED 🟢' : 'DISABLED 🔴'}\n\n` +
                    FOOTER
                );

            } catch (error) {
                console.error(`${name} error:`, error);

                return ctx.reply(
                    `❌ Failed to update ${setting.title} settings.\n\n` +
                    FOOTER
                );
            }
        }
    });
}

for (const [name, setting] of Object.entries(PRESENCE_SETTINGS)) {
    registerPresenceCommand(name, setting);
}
