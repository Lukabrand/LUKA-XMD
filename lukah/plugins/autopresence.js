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

function parseBoolean(value, fallback = false) {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }

    if (typeof value === 'boolean') return value;

    if (typeof value === 'number') return value === 1;

    return ['true', '1', 'yes', 'on', 'enabled'].includes(
        String(value).toLowerCase().trim()
    );
}

async function getStatus(key) {
    const dbValue = await getSetting(key);

    return parseBoolean(dbValue, Boolean(config[key]));
}

function registerPresenceCommand(name, setting) {
    addCmd({
        name,
        aliases: [],
        desc: `${setting.title} SETTINGS`,
        category: 'owner',
        ownerOnly: true,

        async handler(ctx) {
            try {
                const args = ctx.args || [];

                const action = args
                    .join(' ')
                    .trim()
                    .toLowerCase();

                const currentStatus = await getStatus(setting.key);

                if (action !== 'on' && action !== 'off') {
                    return await ctx.reply(
                        `*${setting.title} SETTINGS*\n\n` +
                        `Command: .${name} on\n` +
                        `Command: .${name} off\n\n` +
                        `Current Status: ${currentStatus ? 'ON 🟢' : 'OFF 🔴'}\n\n` +
                        FOOTER
                    );
                }

                const enabled = action === 'on';

                // Save to database
                await setSetting(setting.key, String(enabled));

                // Update runtime config
                config[setting.key] = enabled;

                // Verify saved value
                const savedValue = await getSetting(setting.key);

                console.log(
                    `[PRESENCE SETTINGS] ${setting.key}:`,
                    savedValue
                );

                return await ctx.reply(
                    `*${setting.title} SETTINGS*\n\n` +
                    `Status: ${enabled ? 'ENABLED 🟢' : 'DISABLED 🔴'}\n\n` +
                    `Database: SAVED ✅\n\n` +
                    FOOTER
                );

            } catch (error) {
                console.error(`[${name.toUpperCase()} ERROR]`, error);

                return await ctx.reply(
                    `❌ Failed to update ${setting.title}.\n\n` +
                    `Error: ${error.message}\n\n` +
                    FOOTER
                );
            }
        }
    });
}

// Register commands
for (const [name, setting] of Object.entries(PRESENCE_SETTINGS)) {
    registerPresenceCommand(name, setting);
}

console.log('[PRESENCE SETTINGS] Commands registered successfully.');
