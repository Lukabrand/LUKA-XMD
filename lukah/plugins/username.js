'use strict';

const { addCmd } = require('../../luka/handlers/loader');

function cleanUsername(value = '') {
    return String(value)
        .trim()
        .replace(/^@/, '')
        .toLowerCase();
}

function getInput(ctx) {
    if (Array.isArray(ctx.args)) {
        return ctx.args.join(' ').trim();
    }

    return String(ctx.q || '').trim();
}

function getUsernameValue(result) {
    if (!result) return null;

    if (typeof result === 'string') return result;

    return (
        result.username ||
        result.name ||
        result.handle ||
        result.user?.username ||
        null
    );
}

// SET USERNAME
addCmd({
    name: 'setusername',
    aliases: ['claimusername'],
    desc: 'Set your WhatsApp username',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        const sock = ctx.sock;
        const username = cleanUsername(getInput(ctx));

        if (!sock) {
            return ctx.reply('❌ WhatsApp connection is unavailable.');
        }

        if (!username) {
            return ctx.reply(
                '❌ Please provide a username.\n\n' +
                'Example: .setusername lukabrand'
            );
        }

        try {
            if (typeof sock.checkUsername !== 'function') {
                return ctx.reply('❌ Username API is not available.');
            }

            const check = await sock.checkUsername(username);

            if (!check?.available) {
                let message = `❌ Username @${username} is not available.`;

                if (check?.suggestions?.length) {
                    message += '\n\nSuggestions:\n' +
                        check.suggestions.map(x => `• ${x}`).join('\n');
                }

                return ctx.reply(message);
            }

            await sock.setUsername(username);

            return ctx.reply(
                `✅ WhatsApp username successfully set!\n\n` +
                `👤 Username: @${username}\n\n` +
                `ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`
            );

        } catch (error) {
            console.error('[SET USERNAME]', error);

            return ctx.reply(
                `❌ Failed to set username.\n\n` +
                `${error.message || 'Unknown error'}`
            );
        }
    }
});

// GET MY USERNAME
addCmd({
    name: 'username',
    aliases: ['myusername', 'getusername'],
    desc: 'Get your WhatsApp username',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        const sock = ctx.sock;

        try {
            if (typeof sock.getMyUsername !== 'function') {
                return ctx.reply('❌ Username API is not available.');
            }

            const result = await sock.getMyUsername();
            const username = getUsernameValue(result);

            return ctx.reply(
                username
                    ? `👤 Your WhatsApp username: @${username}`
                    : 'ℹ️ No username is currently set on this account.'
            );

        } catch (error) {
            console.error('[GET USERNAME]', error);
            return ctx.reply(`❌ ${error.message}`);
        }
    }
});

// CHECK USERNAME AVAILABILITY
addCmd({
    name: 'checkusername',
    aliases: ['usernamecheck'],
    desc: 'Check username availability',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        const sock = ctx.sock;
        const username = cleanUsername(getInput(ctx));

        if (!username) {
            return ctx.reply(
                '❌ Please provide a username.\n\n' +
                'Example: .checkusername lukabrand'
            );
        }

        try {
            const result = await sock.checkUsername(username);

            let message = result?.available
                ? `✅ Username @${username} is available.`
                : `❌ Username @${username} is unavailable.`;

            if (result?.suggestions?.length) {
                message += '\n\nSuggestions:\n' +
                    result.suggestions.map(x => `• ${x}`).join('\n');
            }

            return ctx.reply(message);

        } catch (error) {
            console.error('[CHECK USERNAME]', error);
            return ctx.reply(`❌ ${error.message}`);
        }
    }
});

// DELETE USERNAME
addCmd({
    name: 'delusername',
    aliases: ['deleteusername', 'removeusername'],
    desc: 'Delete your WhatsApp username',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        const sock = ctx.sock;

        try {
            if (typeof sock.deleteUsername !== 'function') {
                return ctx.reply('❌ Username deletion API is unavailable.');
            }

            await sock.deleteUsername();

            return ctx.reply(
                '✅ Your WhatsApp username has been deleted.'
            );

        } catch (error) {
            console.error('[DELETE USERNAME]', error);
            return ctx.reply(`❌ ${error.message}`);
        }
    }
});

// FIND USER BY USERNAME
addCmd({
    name: 'finduser',
    aliases: ['findusername', 'userbyname'],
    desc: 'Find a WhatsApp user by username',
    category: 'search',

    handler: async (ctx) => {
        const sock = ctx.sock;
        const username = cleanUsername(getInput(ctx));

        if (!username) {
            return ctx.reply(
                '❌ Please provide a username.\n\n' +
                'Example: .finduser lukabrand'
            );
        }

        try {
            if (typeof sock.findUserByUsername !== 'function') {
                return ctx.reply('❌ Username search API is unavailable.');
            }

            const result = await sock.findUserByUsername(username);

            if (!result) {
                return ctx.reply(
                    `❌ No WhatsApp user found with username @${username}.`
                );
            }

            return ctx.reply(
                `✅ USER FOUND\n\n` +
                `👤 Username: @${username}\n` +
                `🆔 JID: ${result.jid || 'Not available'}\n\n` +
                `ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`
            );

        } catch (error) {
            console.error('[FIND USER]', error);
            return ctx.reply(`❌ ${error.message}`);
        }
    }
});

// SET USERNAME PIN
addCmd({
    name: 'setusernamepin',
    aliases: ['usernamepin'],
    desc: 'Protect your username with a PIN',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        const sock = ctx.sock;
        const pin = getInput(ctx);

        if (!/^\d{4}$/.test(pin)) {
            return ctx.reply(
                '❌ The PIN must contain exactly 4 digits.\n\n' +
                'Example: .setusernamepin 1234'
            );
        }

        try {
            await sock.setUsernamePin(pin);

            return ctx.reply('✅ Username PIN successfully set.');

        } catch (error) {
            console.error('[SET USERNAME PIN]', error);
            return ctx.reply(`❌ ${error.message}`);
        }
    }
});

// REMOVE USERNAME PIN
addCmd({
    name: 'delusernamepin',
    aliases: ['removeusernamepin'],
    desc: 'Remove your username PIN',
    category: 'owner',
    ownerOnly: true,

    handler: async (ctx) => {
        const sock = ctx.sock;

        try {
            await sock.setUsernamePin(null);

            return ctx.reply('✅ Username PIN successfully removed.');

        } catch (error) {
            console.error('[REMOVE USERNAME PIN]', error);
            return ctx.reply(`❌ ${error.message}`);
        }
    }
});
