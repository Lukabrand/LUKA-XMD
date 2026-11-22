'use strict';

const {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    getContentType,
    downloadContentFromMessage,
} = require('@whiskeysockets/baileys');

const path      = require('path');
const fs        = require('fs');
const pino      = require('pino');
const NodeCache = require('node-cache');

const config  = require('../config/settings');
const logger  = require('../utils/logger');
const { resolveSession, SESSION_DIR } = require('../utils/session');
const { seedDefaults }               = require('../db/database');
const { loadPlugins, getAllCmds }    = require('./loader');
const { handleMessage }              = require('./message');
const { handleGroupUpdate, handleGroupSettingsUpdate } = require('./group');
const { autoUpdate }                 = require('../utils/autoUpdate');

const {
    PantherAntiCall,
    PantherAutoBio,
    PantherAntiDelete,
    PantherAntiEdit,
    storeMessage,
    getStoredMessage,
    sendWithChannel,
    channelCtx,
} = require('../utils/gmdFunctions2');
const {
    initStatusEngine,
    enqueueAll,
    enqueue,
} = require('../utils/statusEngine');
const { getCached, setCached, invalidate: invalidateGroupCache } = require('../utils/groupCache');
const { handleStatusBroadcast } = require('./statusManager');

// ── Seed database defaults ─────────────────────────────────────
seedDefaults({
    BOT_NAME:         config.BOT_NAME,
    OWNER_NAME:       config.OWNER_NAME,
    OWNER_NUMBER:     config.OWNER_NUMBER,
    BOT_PREFIX:       config.BOT_PREFIX,
    MODE:             config.MODE,
    AUTO_REACT:       String(config.AUTO_REACT),
    AUTO_BIO:         String(config.AUTO_BIO),
    AUTO_READ_STATUS: String(config.AUTO_READ_STATUS),
    AUTO_LIKE_STATUS: String(config.AUTO_LIKE_STATUS),
});

let sock;
let reconnectCount = 0;
let reconnectTimer = null;
let startupNoticeSent = false;
let startupNoticeInProgress = false;
let autoBioInterval = null;
let autoUpdateChecked = false;
const MAX_RECONNECT_DELAY = 30_000;

// Track newsletters followed this session
if (!global._followedNewsletters) global._followedNewsletters = new Set();

// ── Cache Baileys version ──────────────────────────────────────
let _cachedVersion = null;
async function getBaileysVersion() {
    if (_cachedVersion) return _cachedVersion;
    try {
        const { version } = await fetchLatestBaileysVersion();
        _cachedVersion = version;
    } catch {
        _cachedVersion = [2, 3000, 1015901307];
    }
    setTimeout(() => { _cachedVersion = null; }, 60 * 60 * 1000);
    return _cachedVersion;
}

// ── Fully-silent pino ──────────────────────────────────────────
const silentLogger = pino({ level: 'silent', enabled: false });

// ── Ensure session dir exists ──────────────────────────────────
function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── Auto-follow newsletter (idempotent) ────────────────────────
async function autoFollowChannel(sock) {
    if (!config.AUTO_FOLLOW_CHANNEL) return;
    const jid = config.CHANNEL_JID;
    if (!jid || !jid.endsWith('@newsletter')) return;
    if (global._followedNewsletters.has(jid)) return;
    try {
        await sock.newsletterFollow(jid);
        global._followedNewsletters.add(jid);
        logger.success('CHANNEL', `✅ Following channel: ${config.CHANNEL_NEWSLETTER_NAME}`);
    } catch (e) {
        const msg = e.message || '';
        if (/already|409|subscribed|unexpected response/i.test(msg)) {
            global._followedNewsletters.add(jid);
            logger.info('CHANNEL', `Already following channel: ${config.CHANNEL_NEWSLETTER_NAME}`);
        } else {
            logger.warn('CHANNEL', `Channel follow failed: ${msg}`);
        }
    }
}

// ── Auto-follow any newsletter that messages the bot ──────────
async function autoFollowInbound(sock, newsletterJid) {
    if (!newsletterJid?.endsWith('@newsletter')) return;
    if (global._followedNewsletters.has(newsletterJid)) return;
    try {
        await sock.newsletterFollow(newsletterJid);
        global._followedNewsletters.add(newsletterJid);
        logger.info('CHANNEL', `✅ Auto-followed inbound newsletter: ${newsletterJid}`);
    } catch (e) {
        const msg = e.message || '';
        if (/already|409|subscribed|unexpected response/i.test(msg)) {
            global._followedNewsletters.add(newsletterJid);
        }
    }
}

// ── Auto-join groups from AUTO_JOIN_GROUPS env ─────────────────
async function autoJoinGroups(sock) {
    const raw = config.AUTO_JOIN_GROUPS || '';
    if (!raw.trim()) return;
    const codes = raw.split(',').map(c => c.trim()).filter(Boolean);
    for (const code of codes) {
        try {
            await sock.groupAcceptInvite(code);
            logger.success('AUTOJOIN', `✅ Joined group: ${code}`);
        } catch (e) {
            const msg = e.message || '';
            if (/already|409/i.test(msg)) {
                logger.info('AUTOJOIN', `Already in group: ${code}`);
            } else {
                logger.warn('AUTOJOIN', `Failed to join ${code}: ${msg}`);
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════
//  MAIN BOT START
// ═══════════════════════════════════════════════════════════════

async function startBot() {
    // Run the updater once per process, not on every WhatsApp reconnect.
    if (config.AUTO_UPDATE && !autoUpdateChecked) {
        autoUpdateChecked = true;
        try {
            await autoUpdate();
        } catch (e) {
            logger.warn('UPDATE', `Update check error: ${e.message}`);
        }
    }

    logger.banner(
        config.BOT_NAME,
        config.OWNER_NAME,
        config.OWNER_NUMBER,
        config.BOT_PREFIX,
        config.MODE,
        config.BOT_VERSION
    );

    logger.info('SESSION', 'Checking session...');
    await resolveSession();

    logger.info('LOADER', 'Loading plugins...');
    const pluginLoadResult = await loadPlugins();
    logger.info(
        'LOADER',
        `Plugins ready: ${pluginLoadResult.loaded} loaded, ${pluginLoadResult.failed} failed, ${pluginLoadResult.commands} commands registered.`
    );

    ensureDir(SESSION_DIR);
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const version              = await getBaileysVersion();

    logger.info('WA', `Using WhatsApp Web v${version.join('.')}`);

    const userDevicesCache = new NodeCache({ stdTTL: 600, useClones: false });

    sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys:  makeCacheableSignalKeyStore(state.keys, silentLogger),
        },
        logger:                         silentLogger,
        printQRInTerminal:              false,
        browser:                        ['LUKA-XMD', 'Chrome', '121.0.0'],
        markOnlineOnConnect:            true,
        syncFullHistory:                false,
        shouldSyncHistoryMessage:       () => false,
        generateHighQualityLinkPreview: false,
        retryRequestDelayMs:            50,
        maxMsgRetryCount:               3,
        keepAliveIntervalMs:            15_000,
        connectTimeoutMs:               20_000,
        defaultQueryTimeoutMs:          15_000,
        qrTimeout:                      0,
        emitOwnEvents:                  true,
        getMessage:                     async (key) => getStoredMessage(key?.id),
        cachedGroupMetadata:            async (jid) => getCached(jid) ?? undefined,
        userDevicesCache,
        patchMessageBeforeSending: (message) => {
            const needsPatch = !!(
                message.buttonsMessage  ||
                message.templateMessage ||
                message.listMessage
            );
            if (needsPatch) {
                message = {
                    viewOnceMessage: {
                        message: {
                            messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
                            ...message,
                        },
                    },
                };
            }
            return message;
        },
    });

    // ── Credentials update ─────────────────────────────────────
    sock.ev.on('creds.update', saveCreds);

    // ── Connection state ───────────────────────────────────────
    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (qr) {
            if (logger.IS_HEROKU) {
                logger.error('QR', 'Session invalid on Heroku — set a valid SESSION_ID in Config Vars and restart!');
                process.exit(1);
            }
            logger.warn('QR', 'Scan QR code below to connect:');
            try { require('qrcode-terminal').generate(qr, { small: true }); }
            catch { logger.warn('QR', `QR data: ${qr.slice(0, 60)}...`); }
        }

        if (connection === 'close') {
            const code   = lastDisconnect?.error?.output?.statusCode;
            const reason = Object.keys(DisconnectReason).find(k => DisconnectReason[k] === code) || code;

            if (code === DisconnectReason.loggedOut) {
                logger.error('CONNECTION', 'Logged out! Delete sessions/auth and restart with a fresh SESSION_ID.');
                process.exit(1);
            }

            if (code === DisconnectReason.connectionReplaced) {
                logger.warn('CONNECTION', 'Session replaced by another instance — exiting for clean restart.');
                process.exit(1);
            }

            // Baileys may emit more than one close update for the same socket.
            // Schedule only one reconnect timer to avoid duplicate connections.
            if (reconnectTimer) return;
            reconnectCount++;
            const delay = Math.min(1000 * Math.pow(2, Math.min(reconnectCount - 1, 5)), MAX_RECONNECT_DELAY);
            logger.warn('CONNECTION', `Closed (${reason}) — reconnecting in ${delay / 1000}s [attempt #${reconnectCount}]`);
            reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                startBot().catch(err => logger.error('CONNECTION', `Reconnect failed: ${err.message}`));
            }, delay);
        }

        if (connection === 'open') {
            reconnectCount = 0;
            initStatusEngine(sock);
            const botJid = sock.user?.id || '';
            logger.success('CONNECTION', `Connected as ${botJid}`);
            logger.info('BOT', `Prefix: ${config.BOT_PREFIX}  |  Mode: ${config.MODE}`);
            logger.info('BOT', `AutoBio: ${config.AUTO_BIO}  |  AutoLike: ${config.AUTO_LIKE_STATUS}  |  AutoRead: ${config.AUTO_READ_STATUS}`);
            logger.info('BOT', `AntiVV: ${config.ANTI_VV}  |  AutoFollowChannel: ${config.AUTO_FOLLOW_CHANNEL}`);

            const selfNumber = botJid.split(':')[0].split('@')[0];
            const ownerJid   = `${selfNumber}@s.whatsapp.net`;
            const now        = new Date().toLocaleTimeString('en-KE', { timeZone: config.TIME_ZONE });
            const today      = new Date().toLocaleDateString('en-KE', { timeZone: config.TIME_ZONE });
            const startText = 
`╭══〘〘 *${config.BOT_NAME}* 〙〙═⊷
┃ 🟢 Status  : *ONLINE*
┃ 👑 Owner   : *${config.OWNER_NAME}*
┃ 📦 Plugins : *${getAllCmds().length}*
┃ ⚡ Prefix  : *${config.BOT_PREFIX}*
┃ 🌐 Mode    : *${config.MODE.toUpperCase()}*
╰══✦ ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ ✦══⊷`;

            // Send the online notice only once per deployment/process.
            // A temporary WhatsApp reconnect must not send the same SMS again.
            if (!startupNoticeSent && !startupNoticeInProgress) {
                startupNoticeInProgress = true;
                try {
                    await sock.sendMessage(
                        ownerJid,
                        {
                            text: startText,
                            contextInfo: channelCtx(),
                        },
                        {
                            disappearingMessagesInChat: true,
                            ephemeralExpiration: 120,
                        }
                    );
                    startupNoticeSent = true;
                } catch (err) {
                    logger.warn('CONNECTION', `Startup message failed: ${err.message}`);
                } finally {
                    startupNoticeInProgress = false;
                }
            }

            // Keep one Auto Bio interval across reconnects.
            if (config.AUTO_BIO && !autoBioInterval) {
                PantherAutoBio(sock).catch(() => {});
                autoBioInterval = setInterval(() => PantherAutoBio(sock).catch(() => {}), 10 * 60 * 1000);
                logger.success('AUTOBIO', 'Auto Bio started (every 10 min)');
            }

            // ── Auto-follow own channel (5s after connect) ──────────
            setTimeout(() => autoFollowChannel(sock).catch(() => {}), 5000);

            // ── Auto-join groups (8s after connect) ─────────────────
            setTimeout(() => autoJoinGroups(sock).catch(() => {}), 8000);
        }
    });

    // ── Messages upsert ────────────────────────────────────────
    sock.ev.on('messages.upsert', async (upsert) => {
        if (!upsert?.messages) return;

        // Only enqueue non-status messages for the status engine
        if (upsert.type === 'notify') {
            const nonStatus = upsert.messages.filter(
                m => m?.key?.remoteJid !== 'status@broadcast'
            );
            if (nonStatus.length) enqueueAll(nonStatus);
        }

        // Store original messages before processing revoke notifications.
        // WhatsApp may deliver a revoke as a protocolMessage inside messages.upsert,
        // not only through the messages.delete event.
        for (const msg of upsert.messages) {
            storeMessage(msg);

            const protocol = msg?.message?.protocolMessage;
            const protocolType = String(protocol?.type ?? '').toUpperCase();
            const isRevoke = protocolType === 'REVOKE' || protocol?.type === 0;

            if (isRevoke && protocol?.key?.id) {
                const deletedKey = {
                    ...protocol.key,
                    remoteJid: protocol.key.remoteJid || msg?.key?.remoteJid,
                    participant: protocol.key.participant || msg?.key?.participant,
                };

                PantherAntiDelete(sock, deletedKey).catch(err =>
                    logger.warn('ANTIDELETE', err.message)
                );
            }
        }

        for (const msg of upsert.messages) {
            const jid = msg?.key?.remoteJid || '';

            // ── Status broadcast ──────────────────────────────────
            if (jid === 'status@broadcast' && msg?.key?.participant) {
                handleStatusBroadcast(sock, msg).catch(e =>
                    logger.warn('StatusMgr', e.message)
                );
                continue;
            }

            // ── Newsletter messages: auto-follow + react ──────────
            if (jid.endsWith('@newsletter') && msg?.key?.id) {
                // Auto-follow any newsletter that sends us a message
                autoFollowInbound(sock, jid).catch(() => {});

                // React to newsletter messages (if uptime > 25s to avoid flood on startup)
                if (process.uptime() > 25) {
                    const serverId = msg.key.server_id || msg.key.id;
                    const isOwnChannel = jid === config.CHANNEL_JID;
                    const reactEmoji = isOwnChannel
                        ? '❤️‍🔥'
                        : (['❤️‍🔥','🦨','🦇','🦅','🦕','🦖','🦎','🐲','🐺','🦊'])[Math.floor(Math.random() * 10)];
                    if (serverId) {
                        sock.newsletterReactMessage(jid, serverId, reactEmoji).catch(() => {});
                    } else {
                        sock.sendMessage(jid, { react: { text: reactEmoji, key: msg.key } }).catch(() => {});
                    }
                }
                continue;
            }

        }

        handleMessage(upsert, sock);
    });

    // ── Anti-delete ────────────────────────────────────────────
    // Baileys normally emits { keys }, but tolerate a single key too.
    const handleDeletedMessageKeys = (item) => {
        // Baileys versions generally emit { keys: [...] }; tolerate the
        // alternate single-key shape as well.
        const rawKeys = Array.isArray(item?.keys)
            ? item.keys
            : (item?.key ? [item.key] : (item?.id ? [item] : []));

        const keys = rawKeys.map(key => ({
            ...key,
            remoteJid: key?.remoteJid || item?.jid || item?.remoteJid,
        }));

        for (const key of keys) {
            if (!key?.id || !key?.remoteJid) continue;
            PantherAntiDelete(sock, key).catch(err =>
                logger.warn('ANTIDELETE', err.message)
            );
        }
    };

    sock.ev.on('messages.delete', handleDeletedMessageKeys);

    // Some Baileys builds report revoke events through messages.update.
    // Keep edit recovery separate so a revoke is not mistaken for an edit.
    sock.ev.on('messages.update', async (updates = []) => {
        for (const update of updates) {
            const proto = update?.update?.message?.protocolMessage;
            if (!proto) continue;

            const protoType = String(proto.type ?? '').toUpperCase();
            const isRevoke = protoType === 'REVOKE' || proto.type === 0;

            if (isRevoke && proto.key?.id) {
                const deletedKey = {
                    ...proto.key,
                    remoteJid: proto.key.remoteJid || update?.key?.remoteJid,
                    participant: proto.key.participant || update?.key?.participant,
                };
                handleDeletedMessageKeys(deletedKey);
                continue;
            }

            if (proto.editedMessage) {
                PantherAntiEdit(sock, update).catch(err =>
                    logger.warn('ANTIEDIT', err.message)
                );
            }
        }
    });

    // ── Group events ───────────────────────────────────────────
    sock.ev.on('group-participants.update', (event) => {
        invalidateGroupCache(event?.id);
        handleGroupUpdate(event, sock);
    });
    sock.ev.on('groups.update', (events) => {
        for (const e of (events || [])) invalidateGroupCache(e?.id);
        handleGroupSettingsUpdate(events, sock);
    });

    // ── Call rejection ─────────────────────────────────────────
    sock.ev.on('call', (calls) => PantherAntiCall(calls, sock));

    return sock;
}

function getSocket() { return sock; }

module.exports = { startBot, getSocket };
