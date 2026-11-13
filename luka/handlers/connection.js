
'use strict';

const {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');

const path = require('path');
const fs = require('fs');
const pino = require('pino');
const NodeCache = require('node-cache');

const config = require('../config/settings');
const logger = require('../utils/logger');
const { resolveSession, SESSION_DIR } = require('../utils/session');
const { seedDefaults } = require('../db/database');
const { loadPlugins, getAllCmds } = require('./loader');
const { handleMessage } = require('./message');
const { handleGroupUpdate, handleGroupSettingsUpdate } = require('./group');
const { autoUpdate } = require('../utils/autoUpdate');

const {
    PantherAntiCall,
    PantherAutoBio,
    PantherAntiDelete,
    PantherAntiEdit,
    storeMessage,
    getStoredMessage,
    channelCtx,
} = require('../utils/gmdFunctions2');

const { initStatusEngine, enqueueAll } = require('../utils/statusEngine');
const { getCached, invalidate: invalidateGroupCache } = require('../utils/groupCache');
const { handleStatusBroadcast } = require('./statusManager');

seedDefaults({
    BOT_NAME: config.BOT_NAME,
    OWNER_NAME: config.OWNER_NAME,
    OWNER_NUMBER: config.OWNER_NUMBER,
    BOT_PREFIX: config.BOT_PREFIX,
    MODE: config.MODE,
    AUTO_REACT: String(config.AUTO_REACT),
    AUTO_BIO: String(config.AUTO_BIO),
    AUTO_READ_STATUS: String(config.AUTO_READ_STATUS),
    AUTO_LIKE_STATUS: String(config.AUTO_LIKE_STATUS),
});

let sock = null;
let reconnectCount = 0;
let startPromise = null;
let reconnectTimer = null;
let autoBioInterval = null;
let pluginsLoaded = false;
let updateCompleted = false;

const MAX_RECONNECT_DELAY = 30000;
const CONNECTION_MESSAGE_EXPIRATION = 180;

if (!global._followedNewsletters) global._followedNewsletters = new Set();

const silentLogger = pino({ level: 'silent', enabled: false });
let _cachedVersion = null;

async function getBaileysVersion() {
    if (_cachedVersion) return _cachedVersion;
    try {
        const { version } = await fetchLatestBaileysVersion();
        _cachedVersion = version;
    } catch {
        _cachedVersion = [2, 3000, 1015901307];
    }
    setTimeout(() => { _cachedVersion = null; }, 3600000);
    return _cachedVersion;
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function autoFollowChannel(socket) {
    if (!config.AUTO_FOLLOW_CHANNEL) return;
    const jid = config.CHANNEL_JID;
    if (!jid?.endsWith('@newsletter') || global._followedNewsletters.has(jid)) return;
    try {
        await socket.newsletterFollow(jid);
        global._followedNewsletters.add(jid);
        logger.success('CHANNEL', `Following channel: ${config.CHANNEL_NEWSLETTER_NAME}`);
    } catch (e) {
        if (/already|409|subscribed|unexpected response/i.test(e.message || '')) {
            global._followedNewsletters.add(jid);
        } else logger.warn('CHANNEL', e.message);
    }
}

async function autoFollowInbound(socket, jid) {
    if (!jid?.endsWith('@newsletter') || global._followedNewsletters.has(jid)) return;
    try {
        await socket.newsletterFollow(jid);
        global._followedNewsletters.add(jid);
    } catch (e) {
        if (/already|409|subscribed|unexpected response/i.test(e.message || '')) {
            global._followedNewsletters.add(jid);
        }
    }
}

async function autoJoinGroups(socket) {
    const raw = config.AUTO_JOIN_GROUPS || '';
    if (!raw.trim()) return;
    for (const code of raw.split(',').map(c => c.trim()).filter(Boolean)) {
        try {
            await socket.groupAcceptInvite(code);
            logger.success('AUTOJOIN', `Joined group: ${code}`);
        } catch (e) {
            logger.warn('AUTOJOIN', e.message);
        }
    }
}

async function startBotInternal() {
    if (!updateCompleted && config.AUTO_UPDATE) {
        updateCompleted = true;
        try {
            await autoUpdate();
        } catch (e) {
            logger.warn('UPDATE', e.message);
        }
    }

    if (!pluginsLoaded) {
        logger.banner(config.BOT_NAME, config.OWNER_NAME, config.OWNER_NUMBER, config.BOT_PREFIX, config.MODE, config.BOT_VERSION);
        await resolveSession();
        await loadPlugins();
        pluginsLoaded = true;
    }

    ensureDir(SESSION_DIR);
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const version = await getBaileysVersion();
    const userDevicesCache = new NodeCache({ stdTTL: 600, useClones: false });

    let hasHandledOpen = false;
    let socketClosed = false;

    const socket = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, silentLogger),
        },
        logger: silentLogger,
        printQRInTerminal: false,
        browser: ['LUKA-XMD', 'Chrome', '121.0.0'],
        markOnlineOnConnect: true,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        generateHighQualityLinkPreview: false,
        retryRequestDelayMs: 50,
        maxMsgRetryCount: 3,
        keepAliveIntervalMs: 15000,
        connectTimeoutMs: 20000,
        defaultQueryTimeoutMs: 15000,
        qrTimeout: 0,
        emitOwnEvents: true,
        getMessage: async key => getStoredMessage(key?.id),
        cachedGroupMetadata: async jid => getCached(jid) ?? undefined,
        userDevicesCache,
        patchMessageBeforeSending: message => {
            if (message.buttonsMessage || message.templateMessage || message.listMessage) {
                message = {
                    viewOnceMessage: {
                        message: {
                            messageContextInfo: {
                                deviceListMetadataVersion: 2,
                                deviceListMetadata: {},
                            },
                            ...message,
                        },
                    },
                };
            }
            return message;
        },
    });

    sock = socket;
    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (qr) {
            if (logger.IS_HEROKU) {
                logger.error('QR', 'Invalid session. Set a valid SESSION_ID.');
                process.exit(1);
            }
            logger.warn('QR', 'Scan QR code to connect.');
            try {
                require('qrcode-terminal').generate(qr, { small: true });
            } catch {}
        }

        if (connection === 'close') {
            if (socketClosed) return;
            socketClosed = true;
            if (sock === socket) sock = null;

            const code = lastDisconnect?.error?.output?.statusCode;
            const reason = Object.keys(DisconnectReason).find(k => DisconnectReason[k] === code) || code;

            if (autoBioInterval) {
                clearInterval(autoBioInterval);
                autoBioInterval = null;
            }

            if (code === DisconnectReason.loggedOut) {
                logger.error('CONNECTION', 'Logged out. Use a fresh session.');
                process.exit(1);
            }
            if (code === DisconnectReason.connectionReplaced) {
                logger.warn('CONNECTION', 'Session replaced.');
                process.exit(1);
            }
            if (reconnectTimer) return;

            reconnectCount++;
            const delay = Math.min(1000 * Math.pow(2, Math.min(reconnectCount - 1, 5)), MAX_RECONNECT_DELAY);
            logger.warn('CONNECTION', `Closed (${reason}). Reconnecting in ${delay / 1000}s`);

            reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                startBot().catch(e => logger.error('START', e.message));
            }, delay);
        }

        if (connection === 'open') {
            if (hasHandledOpen) return;
            hasHandledOpen = true;
            reconnectCount = 0;
            initStatusEngine(socket);

            const botJid = socket.user?.id || '';
            const sessionNumber = botJid.split(':')[0].split('@')[0];
            const ownerNumber = String(config.OWNER_NUMBER || '').replace(/\D/g, '') || sessionNumber;
            const ownerJid = ownerNumber ? `${ownerNumber}@s.whatsapp.net` : null;
            const totalCommands = getAllCmds().length;

            logger.success('CONNECTION', `Connected as ${botJid}`);

            const now = new Date().toLocaleTimeString('en-KE', { timeZone: config.TIME_ZONE });
            const today = new Date().toLocaleDateString('en-KE', { timeZone: config.TIME_ZONE });

            const startText =
`╭══〘 *LUKA-XMD* 〙═⊷
┃ 🟢 Status  : *ONLINE*
┃ 👑 Owner   : *${config.OWNER_NAME}*
┃ 📦 Plugins : *${totalCommands}*
┃ ⚡ Prefix  : *${config.BOT_PREFIX}*
┃ 🌐 Mode    : *${config.MODE.toUpperCase()}*
╰══✦ ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ ✦══⊷`;

            if (ownerJid) {
                socket.sendMessage(ownerJid, {
                    text: startText,
                    contextInfo: channelCtx(),
                }, {
                    disappearingMessagesInChat: true,
                    ephemeralExpiration: CONNECTION_MESSAGE_EXPIRATION,
                }).catch(() => {});
            }

            if (config.AUTO_BIO) {
                if (autoBioInterval) clearInterval(autoBioInterval);
                PantherAutoBio(socket).catch(() => {});
                autoBioInterval = setInterval(() => {
                    if (sock === socket) PantherAutoBio(socket).catch(() => {});
                }, 600000);
            }

            setTimeout(() => {
                if (sock === socket) autoFollowChannel(socket).catch(() => {});
            }, 5000);

            setTimeout(() => {
                if (sock === socket) autoJoinGroups(socket).catch(() => {});
            }, 8000);
        }
    });

    socket.ev.on('messages.upsert', async upsert => {
        if (!upsert?.messages) return;
        if (upsert.type === 'notify') {
            const nonStatus = upsert.messages.filter(m => m?.key?.remoteJid !== 'status@broadcast');
            if (nonStatus.length) enqueueAll(nonStatus);
        }
        for (const msg of upsert.messages) storeMessage(msg);
        for (const msg of upsert.messages) {
            const revoke = msg?.message?.protocolMessage;
            if (revoke?.type === 0 && revoke?.key?.id) {
                PantherAntiDelete(socket, {
                    ...revoke.key,
                    remoteJid: revoke.key.remoteJid || msg.key?.remoteJid,
                }).catch(() => {});
            }
        }
        for (const msg of upsert.messages) {
            const jid = msg?.key?.remoteJid || '';
            if (jid === 'status@broadcast' && msg?.key?.participant) {
                handleStatusBroadcast(socket, msg).catch(e => logger.warn('StatusMgr', e.message));
                continue;
            }
            if (jid.endsWith('@newsletter') && msg?.key?.id) {
                autoFollowInbound(socket, jid).catch(() => {});
                if (process.uptime() > 25) {
                    const serverId = msg.key.server_id || msg.key.id;
                    const isOwnChannel = jid === config.CHANNEL_JID;
                    const emoji = isOwnChannel ? '❤️‍🔥' : ['❤️‍🔥', '🦨', '🦇', '🦅', '🦕', '🦖', '🦎', '🐲', '🐺', '🦊'][Math.floor(Math.random() * 10)];
                    if (serverId) {
                        socket.newsletterReactMessage(jid, serverId, emoji).catch(() => {});
                    } else {
                        socket.sendMessage(jid, { react: { text: emoji, key: msg.key } }).catch(() => {});
                    }
                }
            }
        }
        handleMessage(upsert, socket);
    });

    socket.ev.on('messages.delete', item => {
        if (!item?.keys) return;
        for (const key of item.keys) PantherAntiDelete(socket, key).catch(() => {});
    });

    socket.ev.on('messages.update', async updates => {
        for (const update of updates) {
            if (update?.update?.message?.protocolMessage?.editedMessage) {
                PantherAntiEdit(socket, update).catch(() => {});
            }
        }
    });

    socket.ev.on('group-participants.update', event => {
        invalidateGroupCache(event?.id);
        handleGroupUpdate(event, socket);
    });

    socket.ev.on('groups.update', events => {
        for (const event of events || []) invalidateGroupCache(event?.id);
        handleGroupSettingsUpdate(events, socket);
    });

    socket.ev.on('call', calls => PantherAntiCall(calls, socket));

    return socket;
}

function startBot() {
    if (startPromise) return startPromise;
    startPromise = startBotInternal().finally(() => {
        startPromise = null;
    });
    return startPromise;
}

function getSocket() {
    return sock;
}

module.exports = { startBot, getSocket };
                        
