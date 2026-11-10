'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const config = require('../config/settings');
const { getSetting } = require('../db/database');

// Plugin directory
const PLUGINS_DIR = path.join(__dirname, '../../lukah/plugins');

// Command storage
const commands = new Map();
const triggers = [];

// Prevent duplicate plugin loading
const loadedPlugins = new Set();

/**
 * Register command
 */
function addCmd(options = {}) {
    if (!options.name || typeof options.name !== 'string') {
        console.error('[LOADER] Command name is required.');
        return false;
    }

    const name = options.name.toLowerCase().trim();

    if (commands.has(name)) {
        console.warn(`[LOADER] Duplicate command skipped: ${name}`);
        return false;
    }

    const aliases = Array.isArray(options.aliases)
        ? options.aliases
            .filter(alias => typeof alias === 'string')
            .map(alias => alias.toLowerCase().trim())
        : [];

    const command = {
        ...options,
        name,
        aliases
    };

    commands.set(name, command);

    // Register aliases
    for (const alias of aliases) {
        if (!alias || commands.has(alias)) continue;
        commands.set(alias, command);
    }

    return true;
}

/**
 * Register trigger
 */
function addTrigger(trigger, handler) {
    if (!trigger || typeof handler !== 'function') return false;

    triggers.push({
        trigger,
        handler
    });

    return true;
}

/**
 * Build plugin context
 */
function buildPluginCtx(sock, msg, extra = {}) {
    return {
        sock,
        msg,
        config,
        ...extra
    };
}

/**
 * Check current owner
 */
function isCurrentOwner(sender) {
    if (!sender) return false;

    const ownerNumber = String(config.OWNER_NUMBER || '')
        .replace(/[^0-9]/g, '');

    if (!ownerNumber) return false;

    const senderNumber = String(sender)
        .split('@')[0]
        .split(':')[0]
        .replace(/[^0-9]/g, '');

    return senderNumber === ownerNumber;
}

/**
 * Get unique registered commands
 */
function getAllCmds() {
    const unique = new Map();

    for (const command of commands.values()) {
        if (command?.name) {
            unique.set(command.name, command);
        }
    }

    return Array.from(unique.values());
}

/**
 * Find command
 */
function findCmd(name) {
    if (!name) return null;

    return commands.get(
        String(name).toLowerCase().trim()
    ) || null;
}

/**
 * Load flat plugins
 */
function loadFlatPlugins() {
    if (!fs.existsSync(PLUGINS_DIR)) {
        console.error(
            '[LOADER] Plugins directory not found:',
            PLUGINS_DIR
        );
        return 0;
    }

    const files = fs.readdirSync(PLUGINS_DIR)
        .filter(file => file.endsWith('.js'));

    let loaded = 0;

    for (const file of files) {
        const fullPath = path.join(PLUGINS_DIR, file);

        if (loadedPlugins.has(fullPath)) continue;

        try {
            require(fullPath);

            loadedPlugins.add(fullPath);
            loaded++;

        } catch (error) {
            console.error(
                `[LOADER] Failed to load plugin ${file}:`,
                error.stack || error.message
            );
        }
    }

    console.log(
        `[LOADER] ${loaded}/${files.length} flat plugins loaded`
    );

    return loaded;
}

/**
 * Load plugins inside subdirectories
 */
async function loadSubdirPlugins() {
    if (!fs.existsSync(PLUGINS_DIR)) return 0;

    const folders = fs.readdirSync(PLUGINS_DIR, {
        withFileTypes: true
    }).filter(entry => entry.isDirectory());

    let loaded = 0;
    let failed = 0;
    let skipped = 0;

    for (const folder of folders) {
        const folderPath = path.join(PLUGINS_DIR, folder.name);

        let files = [];

        try {
            files = fs.readdirSync(folderPath)
                .filter(file => file.endsWith('.js'));
        } catch (error) {
            console.error(
                `[LOADER] Cannot read ${folder.name}:`,
                error.message
            );
            continue;
        }

        for (const file of files) {
            const fullPath = path.join(folderPath, file);

            if (loadedPlugins.has(fullPath)) {
                skipped++;
                continue;
            }

            try {
                const moduleUrl = pathToFileURL(fullPath).href;
                const imported = await import(moduleUrl);

                const plugin = imported.default || imported;

                if (
                    typeof plugin === 'function'
                ) {
                    await plugin();

                } else if (
                    plugin &&
                    typeof plugin.run === 'function'
                ) {
                    if (plugin.name && !plugin._registered) {
                        addCmd(plugin);
                    }

                    await plugin.run();
                }

                loadedPlugins.add(fullPath);
                loaded++;

            } catch (error) {
                failed++;

                console.error(
                    `[LOADER] Failed loading ${folder.name}/${file}:`,
                    error.stack || error.message
                );
            }
        }
    }

    console.log(
        `[LOADER] Subdirectories: ${loaded} loaded, ${failed} failed, ${skipped} skipped`
    );

    return loaded;
}

/**
 * Load all plugins
 */
async function loadPlugins() {
    const flatLoaded = loadFlatPlugins();

    const subLoaded = await loadSubdirPlugins();

    const totalCommands = getAllCmds().length;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[LOADER] Plugin loading completed');
    console.log(`[LOADER] Flat plugins: ${flatLoaded}`);
    console.log(`[LOADER] Subdirectory plugins: ${subLoaded}`);
    console.log(`[LOADER] Registered commands: ${totalCommands}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return totalCommands;
}

module.exports = {
    addCmd,
    addTrigger,
    loadPlugins,
    loadSubdirPlugins,
    loadFlatPlugins,
    findCmd,
    getAllCmds,
    buildPluginCtx,
    isCurrentOwner,
    commands,
    triggers
};
