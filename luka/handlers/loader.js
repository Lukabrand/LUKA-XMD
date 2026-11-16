'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const config = require('../config/settings');

const PLUGINS_DIR = path.resolve(__dirname, '../../lukah/plugins');
const commands = new Map();
const triggers = [];
const loadedFiles = new Set();

function normaliseName(value) {
    return String(value || '').trim().replace(/^\./, '').toLowerCase();
}

function addCmd(options = {}) {
    const {
        name, aliases = [], handler, desc = '', description = '', usage = '',
        category = 'misc', ownerOnly = false, groupOnly = false, adminOnly = false,
    } = options;

    const commandName = normaliseName(name);
    if (!commandName || typeof handler !== 'function') {
        console.warn('[LOADER] Ignored invalid command:', commandName || '(missing name)');
        return false;
    }

    const entry = {
        name: commandName,
        aliases: [...new Set((Array.isArray(aliases) ? aliases : [aliases]).map(normaliseName).filter(Boolean))],
        handler,
        desc: desc || description || '',
        usage,
        category,
        ownerOnly: Boolean(ownerOnly),
        groupOnly: Boolean(groupOnly),
        adminOnly: Boolean(adminOnly),
    };

    // Re-registering a command replaces its old entry instead of leaving stale aliases.
    for (const [key, value] of commands) {
        if (value.name === commandName || value.aliases.includes(commandName)) commands.delete(key);
    }
    commands.set(commandName, entry);
    for (const alias of entry.aliases) {
        const existing = commands.get(alias);
        if (existing && existing !== entry) {
            console.warn(`[LOADER] Alias "${alias}" for "${commandName}" already belongs to "${existing.name}"; skipped.`);
            continue;
        }
        commands.set(alias, entry);
    }
    return true;
}

function addTrigger({ pattern, handler } = {}) {
    if (!(pattern instanceof RegExp) || typeof handler !== 'function') return false;
    triggers.push({ pattern, handler });
    return true;
}

function buildPluginCtx(ctx) {
    const m = ctx.m || {};
    const pluginM = new Proxy(m, {
        get(target, prop) {
            if (prop === 'chat') return target.from || target.key?.remoteJid;
            if (prop === 'reactKey') return target.key;
            return target[prop];
        },
    });

    const isOwner = Boolean(ctx.isOwner || m.isOwner || m.fromMe);
    return {
        ...ctx,
        client: ctx.sock,
        m: pluginM,
        text: ctx.text || '',
        prefix: config.BOT_PREFIX || '.',
        groupMetadata: ctx.groupMeta || null,
        botspeed: 0.0094,
        Owner: isOwner,
        isOwner,
        isBotAdmin: ctx.isBotAdmin || m.isBotAdmin || false,
        isAdmin: ctx.isAdmin || m.isAdmin || false,
        isGroup: ctx.isGroup || m.isGroup || false,
        config,
    };
}

function getJsFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    const files = [];
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        if (item.name.startsWith('.') || item.name === 'node_modules') continue;
        const full = path.join(dir, item.name);
        if (item.isDirectory()) files.push(...getJsFiles(full));
        else if (/\.(?:cjs|mjs|js)$/i.test(item.name)) files.push(full);
    }
    return files.sort();
}

async function registerModule(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    let exported;

    if (ext === '.mjs') {
        const mod = await import(pathToFileURL(filePath).href);
        exported = mod.default ?? mod;
    } else {
        // Require once; clear cache only when explicitly reloading the loader process.
        const mod = require(filePath);
        exported = mod.default ?? mod;
    }

    // Most LUKA-XMD plugins register themselves through addCmd() on require().
    if (typeof exported === 'function') {
        // Support exported command modules without breaking self-registering plugins.
        if (exported.command && typeof exported.handler === 'function') {
            addCmd({ ...exported, name: exported.command });
        }
        return;
    }

    if (exported && typeof exported === 'object' && typeof exported.run === 'function') {
        const relative = path.relative(PLUGINS_DIR, filePath);
        const folder = path.dirname(relative).split(path.sep).filter(Boolean).pop();
        addCmd({
            name: exported.name || path.basename(filePath, ext),
            aliases: exported.aliases || [],
            desc: exported.description || exported.desc || '',
            category: exported.category || (folder && folder !== '.' ? folder : 'misc'),
            usage: exported.usage || '',
            ownerOnly: exported.ownerOnly,
            groupOnly: exported.groupOnly,
            adminOnly: exported.adminOnly,
            handler: ctx => exported.run(buildPluginCtx(ctx)),
        });
    }
}

async function loadPlugins({ force = false } = {}) {
    if (!fs.existsSync(PLUGINS_DIR)) {
        console.error(`[LOADER] Plugins directory not found: ${PLUGINS_DIR}`);
        return { loaded: 0, failed: 0, commands: commands.size };
    }

    const files = getJsFiles(PLUGINS_DIR);
    let loaded = 0;
    let failed = 0;

    for (const file of files) {
        if (loadedFiles.has(file) && !force) continue;
        try {
            await registerModule(file);
            loadedFiles.add(file);
            loaded++;
        } catch (error) {
            failed++;
            console.error(`[LOADER] Failed: ${path.relative(PLUGINS_DIR, file)}: ${error.stack || error.message}`);
        }
    }

    console.log(`[LOADER] ${loaded} plugin files loaded, ${failed} failed, ${getAllCmds().length} commands registered.`);
    return { loaded, failed, commands: getAllCmds().length };
}

function findCmd(name) {
    return commands.get(normaliseName(name)) || null;
}

function getAllCmds() {
    return [...new Set(commands.values())];
}

module.exports = {
    addCmd, addTrigger, loadPlugins, findCmd, getAllCmds,
    commands, triggers, buildPluginCtx, PLUGINS_DIR,
};
