'use strict';

const { addCmd } = require('../../luka/handlers/loader');
const {
    getSetting,
    setSetting
} = require('../../luka/db/database');

const FOOTER = 'ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ';

const PRESENCE_KEYS = {
    dm: 'DM_PRESENCE',
    group: 'GC_PRESENCE'
};

async function getPresence(key) {
    return (await getSetting(key)) || 'offline';
}

async function setPresence(value) {
    await setSetting(PRESENCE_KEYS.dm, value);
    await setSetting(PRESENCE_KEYS.group, value);
}

function registerPresenceCommand(name, description, presence) {
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

            if (!['on', 'off'].includes(action)) {
                const dm = await getPresence(PRESENCE_KEYS.dm);
                const group = await getPresence(PRESENCE_KEYS.group);

                return ctx.reply(
                    `*${description}*\n\n` +
                    `Usage: .${name} on\n` +
                    `Usage: .${name} off\n\n` +
                    `DM Status: ${dm.toUpperCase()}\n` +
                    `Group Status: ${group.toUpperCase()}\n\n` +
                    FOOTER
                );
            }

            try {
                if (action === 'on') {
                    await setPresence(presence);
                } else {
                    const dm = await getPresence(PRESENCE_KEYS.dm);
                    const group = await getPresence(PRESENCE_KEYS.group);

                    if (dm === presence) {
                        await setSetting(PRESENCE_KEYS.dm, 'offline');
                    }

                    if (group === presence) {
                        await setSetting(PRESENCE_KEYS.group, 'offline');
                    }
                }

                const status = await getPresence(PRESENCE_KEYS.dm);

                return ctx.reply(
                    `*${description}*\n\n` +
                    `Status: ${action === 'on' ? 'ENABLED' : 'DISABLED'}\n` +
                    `Presence: ${status.toUpperCase()}\n\n` +
                    FOOTER
                );

            } catch (error) {
                console.error(`${name} error:`, error);

                return ctx.reply(
                    `❌ Failed to update ${name} settings.\n\n${FOOTER}`
                );
            }
        }
    });
}

registerPresenceCommand(
    'autotyping',
    'AUTO TYPING SETTINGS',
    'typing'
);

registerPresenceCommand(
    'autorecording',
    'AUTO RECORDING SETTINGS',
    'recording'
);

module.exports = {
    getPresence,
    PRESENCE_KEYS
};
