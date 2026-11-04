'use strict';

const fs = require('fs');
const path = require('path');

const config = require('../config/settings');
const { getSetting } = require('../db/database');

const PLUGINS_DIR = path.join(__dirname, '../../lukah/plugins');

const commands = new Map();
const triggers = [];

// ═══════════════════════════════════════════════════════════
// OWNER HELPERS
// ═══════════════════════════════════════════════════════════

function normalizeNumber(value) {
    return String(value || '')
        .split('@')[0]
        .split(':')[0]
        .replace(/[^0-9]/g, '');
}

function isCurrentOwner(ctx) {
    try {
        const savedOwner = getSetting(
            'OWNER_NUMBER',
            config.OWNER_NUMBER || ''
        );

        const ownerNumbers = String(savedOwner || '')
            .split(',')
            .map(normalizeNumber)
            .filter(Boolean);

        const sender = normalizeNumber(
            ctx.sender ||
            ctx.m?.sender ||
            ctx.m?.key?.participant ||
            ctx.m?.key?.remoteJid ||
            ctx.from
        );

        return Boolean(
            ctx.m?.fromMe ||
            (sender && ownerNumbers.includes(sender))
        );
    } catch (error) {
        console.error('[LOADER] Owner check error:', error.message);

        return Boolean(ctx.m?.isOwner || ctx.m?.fromMe);
    }
}

// ═══════════════════════════════════════════════════════════
// COMMAND REGISTRATION
// ═══════════════════════════════════════════════════════════

function addCmd({
    name,
    aliases = [],
    handler,
    desc = '',
    usage = '',
    category = 'misc',
    ownerOnly = false,
    groupOnly = false,
    adminOnly = false
}) {
    if (!name || typeof handler !== 'function') {
        console.error('[LOADER] Invalid command registration:', name);
        return;
    }

    const entry = {
        name,
        aliases,
        handler,
        desc,
        usage,
        category,
        ownerOnly,
        groupOnly,
        adminOnly
    };

    if (!commands.has(name.toLowerCase())) {
        commands.set(name.toLowerCase(), entry);
    }

    for (const alias of aliases) {
        if (!commands.has(alias.toLowerCase())) {
            commands.set(alias.toLowerCase(), entry);
        }
    }
}

function addTrigger({ pattern, handler }) {
    if (!pattern || typeof handler !== 'function') return;

    triggers.push({ pattern, handler });
}

// ═══════════════════════════════════════════════════════════
// CONTEXT BRIDGE
// ═══════════════════════════════════════════════════════════

function buildPluginCtx(ctx) {
    const m = ctx.m || {};

    const pluginM = new Proxy(m, {
        get(target, prop) {
            if (prop === 'chat') {
                return target.from || target.key?.remoteJid;
            }

            if (prop === 'reactKey') {
                return target.key;
            }

            if (prop === 'isOwner') {
                return isCurrentOwner(ctx);
            }

            return target[prop];
        }
    });

    const ownerStatus = isCurrentOwner(ctx);

    return {
        client: ctx.sock,
        m: pluginM,

        text: ctx.text || '',
        prefix: config.BOT_PREFIX || '.',

        groupMetadata: ctx.groupMeta || null,
        botspeed: 0.0094,

        Owner: ownerStatus,
        isOwner: ownerStatus,

        isBotAdmin: ctx.m?.isBotAdmin || false,
        isAdmin: ctx.m?.isAdmin || false,
        isGroup: ctx.m?.isGroup || false,

        sock: ctx.sock,
        from: ctx.from,
        sender: ctx.sender,
        pushName: ctx.pushName,

        args: ctx.args || [],
        body: ctx.body,
        command: ctx.command,

        quoted: ctx.quoted,
        reply: ctx.reply,
        send: ctx.send,
        react: ctx.react,

        config
    };
}

// ═══════════════════════════════════════════════════════════
// FLAT CJS PLUGIN LOADER
// ═══════════════════════════════════════════════════════════

function loadPlugins() {
    if (!fs.existsSync(PLUGINS_DIR)) {
        console.error('[LOADER] Plugins directory not found:', PLUGINS_DIR);
        return;
    }

    const files = fs.readdirSync(PLUGINS_DIR)
        .filter(file => file.endsWith('.js'));

    let loaded = 0;

    for (const file of files) {
        try {
            require(path.join(PLUGINS_DIR, file));
            loaded++;
        } catch (error) {
            console.error(
                `[LOADER] Failed to load plugin ${file}:`,
                error.message
            );
        }
    }

    console.log(
        `[LOADER] ${loaded}/${files.length} flat plugins loaded`
    );

    loadSubdirPlugins().catch(error => {
        console.error(
            '[LOADER] Subdirectory loading error:',
            error.message
        );
    });
}

// ═══════════════════════════════════════════════════════════
// SUBDIRECTORY ESM PLUGIN LOADER
// ═══════════════════════════════════════════════════════════

async function loadSubdirPlugins() {
    if (!fs.existsSync(PLUGINS_DIR)) return;

    const subdirs = fs.readdirSync(PLUGINS_DIR, {
        withFileTypes: true
    })
        .filter(dir => dir.isDirectory())
        .map(dir => dir.name);

    let loaded = 0;
    let failed = 0;
    let skipped = 0;

    for (const dir of subdirs) {
        const dirPath = path.join(PLUGINS_DIR, dir);

        const files = fs.readdirSync(dirPath)
            .filter(file => file.endsWith('.js'));

        for (const file of files) {
            const filePath = path.join(dirPath, file);

            const cmdName = path.basename(file, '.js')
                .toLowerCase()
                .trim();

            if (!cmdName) {
                skipped++;
                continue;
            }

            try {
                const mod = await import(
                    `file://${filePath.replace(/\\/g, '/')}`
                );

                const exported = mod.default;

                if (!exported) {
                    skipped++;
                    continue;
                }

                // Pattern A:
                // export default { name, aliases, run, description }

                if (
                    typeof exported === 'object' &&
                    typeof exported.run === 'function'
                ) {
                    const name = (
                        exported.name || cmdName
                    ).toLowerCase().trim();

                    const aliases = Array.isArray(exported.aliases)
                        ? exported.aliases.map(alias =>
                            String(alias).toLowerCase().trim()
                        )
                        : [];

                    addCmd({
                        name,
                        aliases,

                        desc: exported.description || exported.desc || '',
                        category: dir.toLowerCase(),

                        handler: ctx => {
                            return exported.run(buildPluginCtx(ctx));
                        }
                    });

                    loaded++;
                    continue;
                }

                // Pattern B:
                // export default async (context) => {}

                if (typeof exported === 'function') {
                    addCmd({
                        name: cmdName,
                        aliases: [],
                        category: dir.toLowerCase(),

                        handler: ctx => {
                            return exported(buildPluginCtx(ctx));
                        }
                    });

                    loaded++;
                    continue;
                }

                skipped++;

            } catch (error) {
                if (process.env.DEBUG === 'true') {
                    console.error(
                        `[LOADER] ${dir}/${file}:`,
                        error.message
                    );
                    console.error(error.stack);
                }

                failed++;
            }
        }
    }

    console.log(
        `[LOADER] Subdir plugins: ${loaded} loaded, ` +
        `${failed} failed, ${skipped} skipped`
    );
}

// ═══════════════════════════════════════════════════════════
// COMMAND HELPERS
// ═══════════════════════════════════════════════════════════

function findCmd(name) {
    if (!name) return null;

    return commands.get(String(name).toLowerCase()) || null;
}

function getAllCmds() {
    const seen = new Set();

    return [...commands.values()].filter(command => {
        const name = command.name.toLowerCase();

        if (seen.has(name)) return false;

        seen.add(name);
        return true;
    });
}

// ═══════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════

module.exports = {
    addCmd,
    addTrigger,
    loadPlugins,
    loadSubdirPlugins,
    findCmd,
    getAllCmds,

    buildPluginCtx,
    isCurrentOwner,

    commands,
    triggers
};

// ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ
