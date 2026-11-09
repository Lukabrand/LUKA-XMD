'use strict';

const {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');

const fs = require('fs');
const pino = require('pino');
const NodeCache = require('node-cache');

const config = require('../config/settings');
const logger = require('../utils/logger');

const {
    resolveSession,
    SESSION_DIR
} = require('../utils/session');

// ==========================================
// DATABASE
// ==========================================

const {
    seedDefaults,
    getSetting,
} = require('../db/database');

// ==========================================
// HANDLERS
// ==========================================

const { loadPlugins } = require('./loader');
const { handleMessage } = require('./message');

const {
    handleGroupUpdate,
    handleGroupSettingsUpdate,
} = require('./group');

const { autoUpdate } = require('../utils/autoUpdate');

// ==========================================
// PANTHER FEATURES
// ==========================================

const {
    PantherAntiCall,
    PantherAutoBio,
    PantherAntiDelete,
    PantherAntiEdit,
    storeMessage,
    getStoredMessage,
    channelCtx,
} = require('../utils/gmdFunctions2');

// ==========================================
// ANTI DELETE DM
// ==========================================

const {
    attachAntiDelete,
} = require('../utils/antiDelete');

// ==========================================
// STATUS ENGINE
// ==========================================

const {
    initStatusEngine,
    enqueueAll,
} = require('../utils/statusEngine');

// ==========================================
// GROUP CACHE
// ==========================================

const {
    getCached,
    invalidate: invalidateGroupCache,
} = require('../utils/groupCache');

// ==========================================
// STATUS MANAGER
// ==========================================

const {
    handleStatusBroadcast,
} = require('./statusManager');

// ==========================================
// DEFAULT SETTINGS
// ==========================================

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

    AUTO_TYPING: String(config.AUTO_TYPING ?? false),
    AUTO_RECORDING: String(config.AUTO_RECORDING ?? false),
});

// ==========================================
// GLOBAL VARIABLES
// ==========================================

let sock;
let reconnectCount = 0;
let reconnectTimer = null;

const MAX_RECONNECT_DELAY = 30_000;
const CONNECTION_MESSAGE_EXPIRATION = 180;

let connectionMessageSent = false;
let antiDeleteAttached = false;

let cachedVersion = null;

const autoPresenceTimers = new Map();

if (!global._followedNewsletters) {
    global._followedNewsletters = new Set();
}

// ==========================================
// AUTO TYPING & AUTO RECORDING
// ==========================================

function parseBoolean(value, fallback = false) {
    if (value === undefined || value === null || value === '') {
        return Boolean(fallback);
    }

    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'number') {
        return value === 1;
    }

    return [
        'true',
        '1',
        'yes',
        'on',
        'enabled'
    ].includes(
        String(value).trim().toLowerCase()
    );
}

async function isPresenceEnabled(key, fallback = false) {
    try {
        const value = await getSetting(key);

        return parseBoolean(value, fallback);

    } catch (error) {
        logger.warn(
            'AUTO-PRESENCE',
            `${key}: ${error.message}`
        );

        return parseBoolean(fallback);
    }
}

async function applyAutoPresence(socket, message) {
    try {
        if (!socket || !message?.key) {
            return;
        }

        const jid = message.key.remoteJid;

        if (
            !jid ||
            typeof jid !== 'string' ||
            message.key.fromMe ||
            jid === 'status@broadcast' ||
            jid.endsWith('@newsletter')
        ) {
            return;
        }

        // Read current settings
        const [
            typingEnabled,
            recordingEnabled
        ] = await Promise.all([
            isPresenceEnabled(
                'AUTO_TYPING',
                config.AUTO_TYPING
            ),

            isPresenceEnabled(
                'AUTO_RECORDING',
                config.AUTO_RECORDING
            )
        ]);

        let presence = null;

        // Recording has priority
        if (recordingEnabled) {
            presence = 'recording';

        } else if (typingEnabled) {
            presence = 'composing';
        }

        if (!presence) {
            return;
        }

        // Clear previous timer
        const oldTimer = autoPresenceTimers.get(jid);

        if (oldTimer) {
            clearTimeout(oldTimer);
        }

        // Show typing or recording
        await socket.sendPresenceUpdate(
            presence,
            jid
        );

        logger.info(
            'AUTO-PRESENCE',
            `${presence} -> ${jid}`
        );

        // Stop presence after 5 seconds
        const timer = setTimeout(async () => {
            try {
                await socket.sendPresenceUpdate(
                    'paused',
                    jid
                );
            } catch (error) {
                logger.warn(
                    'AUTO-PRESENCE',
                    error.message
                );
            }

            autoPresenceTimers.delete(jid);

        }, 5000);

        autoPresenceTimers.set(jid, timer);

    } catch (error) {
        logger.warn(
            'AUTO-PRESENCE',
            error.message
        );
    }
}

// ==========================================
// CLEAR PRESENCE TIMERS
// ==========================================

function clearAutoPresenceTimers() {
    for (const timer of autoPresenceTimers.values()) {
        clearTimeout(timer);
    }

    autoPresenceTimers.clear();
}

// ==========================================
// BAILEYS VERSION
// ==========================================

async function getBaileysVersion() {
    if (cachedVersion) {
        return cachedVersion;
    }

    try {
        const result = await fetchLatestBaileysVersion();

        cachedVersion = result.version;

    } catch {
        cachedVersion = [2, 3000, 1015901307];
    }

    setTimeout(() => {
        cachedVersion = null;
    }, 60 * 60 * 1000);

    return cachedVersion;
}

// ==========================================
// LOGGER
// ==========================================

const silentLogger = pino({
    level: 'silent',
    enabled: false,
});

// ==========================================
// DIRECTORY
// ==========================================

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {
            recursive: true
        });
    }
}

// ==========================================
// AUTO FOLLOW CHANNEL
// ==========================================

async function autoFollowChannel(socket) {
    if (!config.AUTO_FOLLOW_CHANNEL) {
        return;
    }

    const jid = config.CHANNEL_JID;

    if (!jid || !jid.endsWith('@newsletter')) {
        return;
    }

    if (global._followedNewsletters.has(jid)) {
        return;
    }

    try {
        await socket.newsletterFollow(jid);

        global._followedNewsletters.add(jid);

        logger.success(
            'CHANNEL',
            `Following channel: ${config.CHANNEL_NEWSLETTER_NAME || jid}`
        );

    } catch (error) {
        const message = error.message || '';

        if (/already|409|subscribed|unexpected response/i.test(message)) {
            global._followedNewsletters.add(jid);

            logger.info(
                'CHANNEL',
                `Already following channel: ${config.CHANNEL_NEWSLETTER_NAME || jid}`
            );

        } else {
            logger.warn(
                'CHANNEL',
                `Channel follow failed: ${message}`
            );
        }
    }
}

// ==========================================
// AUTO FOLLOW INBOUND
// ==========================================

async function autoFollowInbound(socket, newsletterJid) {
    if (!newsletterJid?.endsWith('@newsletter')) {
        return;
    }

    if (global._followedNewsletters.has(newsletterJid)) {
        return;
    }

    try {
        await socket.newsletterFollow(newsletterJid);

        global._followedNewsletters.add(newsletterJid);

        logger.info(
            'CHANNEL',
            `Auto-followed inbound newsletter: ${newsletterJid}`
        );

    } catch (error) {
        const message = error.message || '';

        if (/already|409|subscribed|unexpected response/i.test(message)) {
            global._followedNewsletters.add(newsletterJid);
        }
    }
}

// ==========================================
// AUTO JOIN GROUPS
// ==========================================

async function autoJoinGroups(socket) {
    const raw = config.AUTO_JOIN_GROUPS || '';

    if (!raw.trim()) {
        return;
    }

    const codes = raw
        .split(',')
        .map(code => code.trim())
        .filter(Boolean);

    for (const code of codes) {
        try {
            await socket.groupAcceptInvite(code);

            logger.success(
                'AUTOJOIN',
                `Joined group: ${code}`
            );

        } catch (error) {
            const message = error.message || '';

            if (/already|409/i.test(message)) {
                logger.info(
                    'AUTOJOIN',
                    `Already in group: ${code}`
                );

            } else {
                logger.warn(
                    'AUTOJOIN',
                    `Failed to join ${code}: ${message}`
                );
            }
        }
    }
}

// ==========================================
// CONNECTION MESSAGE
// ==========================================

async function sendConnectionMessage(socket) {
    if (connectionMessageSent) {
        return;
    }

    connectionMessageSent = true;

    const botJid = socket.user?.id || '';

    const selfNumber = botJid
        .split(':')[0]
        .split('@')[0];

    if (!selfNumber) {
        connectionMessageSent = false;

        logger.warn(
            'CONNECTION',
            'Could not determine the bot WhatsApp number.'
        );

        return;
    }

    const ownerJid = `${selfNumber}@s.whatsapp.net`;

    const botName = config.BOT_NAME || 'LUKA-XMD';
    const ownerName = config.OWNER_NAME || 'LUKABRAND';
    const prefix = config.BOT_PREFIX || '.';

    const mode = String(
        config.MODE || 'public'
    ).toUpperCase();

    const totalCommands = require('./loader')
        .getAllCmds()
        .length;

    const startText =
`╭══〘〘 *${botName}* 〙〙═⊷
┃ 🟢 *Status:* ✅ ONLINE
┃ 👑 *Owner:* ${ownerName}
┃ 📊 *Plugins:* ${totalCommands}
┃ 📌 *Prefix:* [ ${prefix} ]
┃ 🌐 *Mode:* ${mode}
╰══✦ *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ* ✦══⊷`;

    try {
        await socket.sendMessage(
            ownerJid,
            {
                text: startText,
                contextInfo: channelCtx(),
            },
            {
                disappearingMessagesInChat: true,
                ephemeralExpiration: CONNECTION_MESSAGE_EXPIRATION,
            }
        );

        logger.success(
            'CONNECTION',
            'Connection message sent successfully.'
        );

    } catch (error) {
        connectionMessageSent = false;

        logger.warn(
            'CONNECTION',
            `Failed to send connection message: ${error.message}`
        );
    }
}

// ==========================================
// START BOT
// ==========================================

async function startBot() {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }

    // Auto update
    if (config.AUTO_UPDATE) {
        try {
            await autoUpdate();

        } catch (error) {
            logger.warn(
                'UPDATE',
                `Update check error: ${error.message}`
            );
        }
    }

    // Banner
    logger.banner(
        config.BOT_NAME,
        config.OWNER_NAME,
        config.OWNER_NUMBER,
        config.BOT_PREFIX,
        config.MODE,
        config.BOT_VERSION
    );

    // Session
    logger.info(
        'SESSION',
        'Checking session...'
    );

    await resolveSession();

    // Load plugins
    logger.info(
        'LOADER',
        'Loading plugins...'
    );

    loadPlugins();

    ensureDir(SESSION_DIR);

    const {
        state,
        saveCreds
    } = await useMultiFileAuthState(SESSION_DIR);

    const version = await getBaileysVersion();

    logger.info(
        'WA',
        `Using WhatsApp Web v${version.join('.')}`
    );

    // Device cache
    const userDevicesCache = new NodeCache({
        stdTTL: 600,
        useClones: false,
    });

    // ======================================
    // CREATE SOCKET
    // ======================================

    sock = makeWASocket({
        version,

        auth: {
            creds: state.creds,

            keys: makeCacheableSignalKeyStore(
                state.keys,
                silentLogger
            ),
        },

        logger: silentLogger,

        printQRInTerminal: false,

        browser: [
            'LUKA-XMD',
            'Chrome',
            '121.0.0',
        ],

        markOnlineOnConnect: true,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        generateHighQualityLinkPreview: false,
        retryRequestDelayMs: 50,
        maxMsgRetryCount: 3,
        keepAliveIntervalMs: 15_000,
        connectTimeoutMs: 20_000,
        defaultQueryTimeoutMs: 15_000,
        qrTimeout: 0,
        emitOwnEvents: true,

        getMessage: async key =>
            getStoredMessage(key?.id),

        cachedGroupMetadata: async jid =>
            getCached(jid) ?? undefined,

        userDevicesCache,

        patchMessageBeforeSending: message => {
            const needsPatch = Boolean(
                message.buttonsMessage ||
                message.templateMessage ||
                message.listMessage
            );

            if (!needsPatch) {
                return message;
            }

            return {
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
        },
    });

    // Save credentials
    sock.ev.on(
        'creds.update',
        saveCreds
    );

    // ======================================
    // ANTI DELETE DM
    // ======================================

    if (!antiDeleteAttached) {
        try {
            attachAntiDelete(
                sock,
                config,
                getSetting
            );

            antiDeleteAttached = true;

            logger.success(
                'ANTIDELETE',
                'Anti-Delete DM listener initialized.'
            );

        } catch (error) {
            logger.warn(
                'ANTIDELETE',
                `Could not initialize Anti-Delete DM: ${error.message}`
            );
        }
    }

    // ======================================
    // CONNECTION UPDATE
    // ======================================

    sock.ev.on(
        'connection.update',
        async ({
            connection,
            lastDisconnect,
            qr
        }) => {

            // QR
            if (qr) {
                if (logger.IS_HEROKU) {
                    logger.error(
                        'QR',
                        'Session invalid on Heroku. Set a valid SESSION_ID in Config Vars and restart.'
                    );

                    process.exit(1);
                }

                logger.warn(
                    'QR',
                    'Scan the QR code below to connect:'
                );

                try {
                    require('qrcode-terminal').generate(
                        qr,
                        { small: true }
                    );

                } catch {
                    logger.warn(
                        'QR',
                        `QR data: ${qr.slice(0, 60)}...`
                    );
                }
            }

            // CLOSED
            if (connection === 'close') {
                clearAutoPresenceTimers();

                const code =
                    lastDisconnect?.error?.output?.statusCode;

                const reason = Object.keys(DisconnectReason).find(
                    key => DisconnectReason[key] === code
                ) || code;

                if (code === DisconnectReason.loggedOut) {
                    logger.error(
                        'CONNECTION',
                        'Logged out! Delete sessions/auth and restart with a fresh SESSION_ID.'
                    );

                    process.exit(1);
                }

                if (code === DisconnectReason.connectionReplaced) {
                    logger.warn(
                        'CONNECTION',
                        'Session replaced by another instance. Exiting for a clean restart.'
                    );

                    process.exit(1);
                }

                reconnectCount++;

                const delay = Math.min(
                    1000 * Math.pow(
                        2,
                        Math.min(reconnectCount - 1, 5)
                    ),
                    MAX_RECONNECT_DELAY
                );

                logger.warn(
                    'CONNECTION',
                    `Closed (${reason}). Reconnecting in ${delay / 1000}s [attempt #${reconnectCount}]`
                );

                if (reconnectTimer) {
                    clearTimeout(reconnectTimer);
                }

                reconnectTimer = setTimeout(() => {
                    reconnectTimer = null;

                    startBot().catch(error => {
                        logger.error(
                            'CONNECTION',
                            `Restart error: ${error.message}`
                        );
                    });

                }, delay);
            }

            // OPEN
            if (connection === 'open') {
                reconnectCount = 0;

                initStatusEngine(sock);

                const botJid = sock.user?.id || '';

                logger.success(
                    'CONNECTION',
                    `Connected as ${botJid}`
                );

                logger.info(
                    'BOT',
                    `Prefix: ${config.BOT_PREFIX} | Mode: ${config.MODE}`
                );

                logger.info(
                    'BOT',
                    `AutoBio: ${config.AUTO_BIO} | AutoLike: ${config.AUTO_LIKE_STATUS} | AutoRead: ${config.AUTO_READ_STATUS}`
                );

                logger.info(
                    'BOT',
                    `AntiVV: ${config.ANTI_VV} | AutoFollowChannel: ${config.AUTO_FOLLOW_CHANNEL}`
                );

                // Presence settings
                const [
                    typingEnabled,
                    recordingEnabled
                ] = await Promise.all([
                    isPresenceEnabled(
                        'AUTO_TYPING',
                        config.AUTO_TYPING
                    ),

                    isPresenceEnabled(
                        'AUTO_RECORDING',
                        config.AUTO_RECORDING
                    )
                ]);

                logger.info(
                    'AUTO-PRESENCE',
                    `Typing: ${typingEnabled} | Recording: ${recordingEnabled}`
                );

                // Connection message
                if (config.STARTING_MESSAGE !== false) {
                    await sendConnectionMessage(sock);
                }

                // Auto Bio
                if (config.AUTO_BIO) {
                    PantherAutoBio(sock).catch(() => {});

                    setInterval(() => {
                        PantherAutoBio(sock).catch(() => {});
                    }, 10 * 60 * 1000);

                    logger.success(
                        'AUTOBIO',
                        'Auto Bio started (every 10 minutes).'
                    );
                }

                // Follow channel
                setTimeout(() => {
                    autoFollowChannel(sock).catch(() => {});
                }, 5000);

                // Join groups
                setTimeout(() => {
                    autoJoinGroups(sock).catch(() => {});
                }, 8000);
            }
        }
    );

    // ======================================
    // INCOMING MESSAGES
    // ======================================

    sock.ev.on(
        'messages.upsert',
        async upsert => {

            if (!upsert?.messages) {
                return;
            }

            // Notify messages
            if (upsert.type === 'notify') {
                const nonStatus = upsert.messages.filter(
                    message =>
                        message?.key?.remoteJid !== 'status@broadcast'
                );

                if (nonStatus.length) {
                    enqueueAll(nonStatus);
                }
            }

            // Store messages
            for (const message of upsert.messages) {
                storeMessage(message);
            }

            // Statuses and newsletters
            for (const message of upsert.messages) {
                const jid = message?.key?.remoteJid || '';

                if (
                    jid === 'status@broadcast' &&
                    message?.key?.participant
                ) {
                    handleStatusBroadcast(
                        sock,
                        message
                    ).catch(error => {
                        logger.warn(
                            'StatusMgr',
                            error.message
                        );
                    });

                    continue;
                }

                if (
                    jid.endsWith('@newsletter') &&
                    message?.key?.id
                ) {
                    autoFollowInbound(
                        sock,
                        jid
                    ).catch(() => {});

                    if (process.uptime() > 25) {
                        const serverId =
                            message.key.server_id ||
                            message.key.id;

                        const isOwnChannel =
                            jid === config.CHANNEL_JID;

                        const emojis = [
                            '❤️‍🔥',
                            '🦨',
                            '🦇',
                            '🦅',
                            '🦕',
                            '🦖',
                            '🦎',
                            '🐲',
                            '🐺',
                            '🦊',
                        ];

                        const reaction = isOwnChannel
                            ? '❤️‍🔥'
                            : emojis[
                                Math.floor(
                                    Math.random() * emojis.length
                                )
                            ];

                        if (serverId) {
                            sock.newsletterReactMessage(
                                jid,
                                serverId,
                                reaction
                            ).catch(() => {});

                        } else {
                            sock.sendMessage(jid, {
                                react: {
                                    text: reaction,
                                    key: message.key,
                                },
                            }).catch(() => {});
                        }
                    }

                    continue;
                }
            }

            // ==================================
            // AUTO TYPING & RECORDING
            // ==================================

            if (upsert.type === 'notify') {
                for (const message of upsert.messages) {
                    if (
                        message?.key &&
                        !message.key.fromMe &&
                        message.key.remoteJid !== 'status@broadcast'
                    ) {
                        await applyAutoPresence(
                            sock,
                            message
                        );
                    }
                }
            }

            // ==================================
            // MESSAGE HANDLER
            // ==================================

            handleMessage(
                upsert,
                sock
            );
        }
    );

    // ======================================
    // DELETED MESSAGES
    // ======================================

    sock.ev.on(
        'messages.delete',
        item => {
            if (!item?.keys) {
                return;
            }

            for (const key of item.keys) {
                PantherAntiDelete(
                    sock,
                    key
                ).catch(() => {});
            }
        }
    );

    // ======================================
    // EDITED MESSAGES
    // ======================================

    sock.ev.on(
        'messages.update',
        async updates => {
            for (const update of updates) {
                if (
                    update?.update?.message?.protocolMessage?.editedMessage
                ) {
                    PantherAntiEdit(
                        sock,
                        update
                    ).catch(() => {});
                }
            }
        }
    );

    // ======================================
    // GROUP PARTICIPANTS
    // ======================================

    sock.ev.on(
        'group-participants.update',
        event => {
            invalidateGroupCache(event?.id);

            handleGroupUpdate(
                event,
                sock
            );
        }
    );

    // ======================================
    // GROUP SETTINGS
    // ======================================

    sock.ev.on(
        'groups.update',
        events => {
            for (const event of events || []) {
                invalidateGroupCache(event?.id);
            }

            handleGroupSettingsUpdate(
                events,
                sock
            );
        }
    );

    // ======================================
    // INCOMING CALLS
    // ======================================

    sock.ev.on(
        'call',
        calls => {
            PantherAntiCall(
                calls,
                sock
            );
        }
    );

    return sock;
}

// ==========================================
// GET SOCKET
// ==========================================

function getSocket() {
    return sock;
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
    startBot,
    getSocket,
};
