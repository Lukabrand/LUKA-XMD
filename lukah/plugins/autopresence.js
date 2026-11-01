'use strict';

const { addCmd } = require('../../luka/handlers/loader');

const state = global.autoPresenceState ||= {
    typing: false,
    recording: false,
    sockets: new WeakSet()
};

function getSocket(ctx) {
    return ctx.sock || ctx.conn || ctx.client ||
        global.sock || global.conn;
}

function attachPresenceListener(sock) {
    if (!sock?.ev || typeof sock.sendPresenceUpdate !== 'function') {
        console.error('[AUTOPRESENCE] Socket or sendPresenceUpdate unavailable');
        return false;
    }

    if (state.sockets.has(sock)) return true;

    state.sockets.add(sock);

    sock.ev.on('messages.upsert', async ({ messages, type: eventType }) => {
        // Process only newly received messages
        if (eventType && eventType !== 'notify') return;

        for (const msg of messages || []) {
            const jid = msg.key?.remoteJid;

            if (!jid || msg.key?.fromMe) continue;
            if (jid === 'status@broadcast') continue;
            if (jid.endsWith('@newsletter')) continue;

            let presence = null;

            if (state.typing) {
                presence = 'composing';
            } else if (state.recording) {
                presence = 'recording';
            }

            if (!presence) continue;

            try {
                await sock.sendPresenceUpdate(presence, jid);

                setTimeout(() => {
                    sock.sendPresenceUpdate('paused', jid).catch(() => {});
                }, 2500);
            } catch (err) {
                console.error('[AUTOPRESENCE]', err?.message || err);
            }
        }
    });

    console.log('[AUTOPRESENCE] Listener attached');
    return true;
}

function registerCommand(pattern, description, type) {
    addCmd({
        pattern,
        alias: [],
        desc: description,
        category: 'owner',
        fromMe: true,

        async handler(ctx) {
            const sock = getSocket(ctx);

            if (!sock) {
                return ctx.reply('WhatsApp connection is unavailable.');
            }

            if (!attachPresenceListener(sock)) {
                return ctx.reply('Presence feature is not supported by this connection.');
            }

            const action = (ctx.args || [])
                .join(' ')
                .trim()
                .toLowerCase();

            if (action === 'on') {
                state[type] = true;
            } else if (action === 'off') {
                state[type] = false;
            } else {
                return ctx.reply(
                    `${description}\n\n` +
                    `Usage: .${pattern} on\n` +
                    `Usage: .${pattern} off\n\n` +
                    `Status: ${state[type] ? 'ON' : 'OFF'}\n\n` +
                    `ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`
                );
            }

            return ctx.reply(
                `${description}\n\n` +
                `Status: ${state[type] ? 'ENABLED' : 'DISABLED'}\n\n` +
                `ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`
            );
        }
    });
}

registerCommand('autotyping', 'Auto Typing Settings', 'typing');
registerCommand('autorecording', 'Auto Recording Settings', 'recording');
