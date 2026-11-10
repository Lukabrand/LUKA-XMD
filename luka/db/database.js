'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('../config/settings');

// ═══════════════════════════════════════════════════════════════
// DATABASE PATH
// ═══════════════════════════════════════════════════════════════

const DB_DIR = path.join(__dirname, '../LukaTech/sessions');
const DB_PATH = path.join(DB_DIR, 'panther.db');

if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// ═══════════════════════════════════════════════════════════════
// DATABASE PRAGMAS
// ═══════════════════════════════════════════════════════════════

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('cache_size = -8000');
db.pragma('temp_store = MEMORY');
db.pragma('mmap_size = 67108864');
db.pragma('busy_timeout = 5000');

// ═══════════════════════════════════════════════════════════════
// CREATE TABLES
// ═══════════════════════════════════════════════════════════════

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sudo (
    jid TEXT PRIMARY KEY,
    added_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS group_settings (
    jid TEXT PRIMARY KEY,
    antilink INTEGER DEFAULT 0,
    antispam INTEGER DEFAULT 0,
    antibadword INTEGER DEFAULT 0,
    anticall INTEGER DEFAULT 0,
    welcome INTEGER DEFAULT 0,
    goodbye INTEGER DEFAULT 0,
    antidelete INTEGER DEFAULT 0,
    mute INTEGER DEFAULT 0,
    antimention INTEGER DEFAULT 0,
    antiviewonce INTEGER DEFAULT 0,
    antiforeign INTEGER DEFAULT 0,
    antisticker INTEGER DEFAULT 0,
    antiflood INTEGER DEFAULT 0,
    antiedit INTEGER DEFAULT 0,
    welcomeMsg TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jid TEXT NOT NULL,
    group_jid TEXT NOT NULL,
    reason TEXT,
    issued_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_jid TEXT NOT NULL,
    name TEXT NOT NULL,
    content TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cmd_stats (
    command TEXT PRIMARY KEY,
    uses INTEGER DEFAULT 0,
    last_used TEXT DEFAULT (datetime('now'))
);
`);

// ═══════════════════════════════════════════════════════════════
// DATABASE MIGRATIONS
// ═══════════════════════════════════════════════════════════════

const columns = [
    ['antimention', 'INTEGER DEFAULT 0'],
    ['antiviewonce', 'INTEGER DEFAULT 0'],
    ['antiforeign', 'INTEGER DEFAULT 0'],
    ['antisticker', 'INTEGER DEFAULT 0'],
    ['antiflood', 'INTEGER DEFAULT 0'],
    ['antiedit', 'INTEGER DEFAULT 0'],
    ['welcomeMsg', "TEXT DEFAULT ''"]
];

for (const [name, type] of columns) {
    const exists = db.prepare('PRAGMA table_info(group_settings)')
        .all()
        .some(column => column.name === name);

    if (!exists) {
        db.exec(`ALTER TABLE group_settings ADD COLUMN ${name} ${type}`);
    }
}

db.exec(`
CREATE INDEX IF NOT EXISTS idx_warnings_jid_group
ON warnings(jid, group_jid);

CREATE INDEX IF NOT EXISTS idx_notes_group
ON notes(group_jid, name);
`);

// ═══════════════════════════════════════════════════════════════
// PREPARED STATEMENTS
// ═══════════════════════════════════════════════════════════════

const stmts = {
    getSetting: db.prepare(
        'SELECT value FROM settings WHERE key = ?'
    ),

    setSetting: db.prepare(
        'INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)'
    ),

    seed: db.prepare(
        'INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)'
    ),

    addSudo: db.prepare(
        'INSERT OR IGNORE INTO sudo (jid) VALUES (?)'
    ),

    removeSudo: db.prepare(
        'DELETE FROM sudo WHERE jid = ?'
    ),

    sudoList: db.prepare(
        'SELECT jid FROM sudo'
    ),

    clearSudo: db.prepare(
        'DELETE FROM sudo'
    ),

    isSudo: db.prepare(
        'SELECT 1 FROM sudo WHERE jid = ?'
    ),

    getGroup: db.prepare(
        'SELECT * FROM group_settings WHERE jid = ?'
    ),

    insertGroup: db.prepare(
        'INSERT OR IGNORE INTO group_settings (jid) VALUES (?)'
    ),

    addWarning: db.prepare(
        'INSERT INTO warnings (jid,group_jid,reason) VALUES (?,?,?)'
    ),

    countWarnings: db.prepare(
        'SELECT COUNT(*) AS c FROM warnings WHERE jid = ? AND group_jid = ?'
    ),

    clearWarnings: db.prepare(
        'DELETE FROM warnings WHERE jid = ? AND group_jid = ?'
    ),

    allWarnings: db.prepare(
        'SELECT jid,reason,issued_at FROM warnings WHERE group_jid = ? ORDER BY issued_at DESC'
    ),

    saveNote: db.prepare(
        'INSERT INTO notes (group_jid,name,content) VALUES (?,?,?)'
    ),

    getNote: db.prepare(
        'SELECT * FROM notes WHERE group_jid = ? AND name = ?'
    ),

    allNotes: db.prepare(
        'SELECT * FROM notes WHERE group_jid = ?'
    ),

    deleteNote: db.prepare(
        'DELETE FROM notes WHERE group_jid = ? AND name = ?'
    ),

    trackCmd: db.prepare(`
        INSERT INTO cmd_stats (command,uses,last_used)
        VALUES (?,1,datetime('now'))
        ON CONFLICT(command)
        DO UPDATE SET uses=uses+1,last_used=datetime('now')
    `),

    topCmds: db.prepare(
        'SELECT command,uses,last_used FROM cmd_stats ORDER BY uses DESC LIMIT ?'
    ),

    cmdStat: db.prepare(
        'SELECT uses,last_used FROM cmd_stats WHERE command = ?'
    ),

    totalUses: db.prepare(
        'SELECT SUM(uses) AS total FROM cmd_stats'
    ),

    resetCmds: db.prepare(
        'DELETE FROM cmd_stats'
    )
};

// ═══════════════════════════════════════════════════════════════
// SEED DEFAULT SETTINGS
// ═══════════════════════════════════════════════════════════════

function seedDefaults(defaults = {}) {
    const tx = db.transaction(rows => {
        for (const [key, value] of rows) {
            stmts.seed.run(key, String(value));
        }
    });

    tx(Object.entries(defaults));
}

seedDefaults({
    AUTO_TYPING: String(config.AUTO_TYPING ?? false),
    AUTO_RECORDING: String(config.AUTO_RECORDING ?? false),
    ANTI_VV: String(config.ANTI_VV ?? true),
    AUTO_READ_STATUS: String(config.AUTO_READ_STATUS ?? true),
    AUTO_LIKE_STATUS: String(config.AUTO_LIKE_STATUS ?? true),
    AUTO_REACT: String(config.AUTO_REACT ?? false),
    AUTO_BIO: String(config.AUTO_BIO ?? true),
    ANTI_CALL: String(config.ANTI_CALL ?? false),
    ANTI_DELETE: String(config.ANTI_DELETE ?? true),
    ANTIDELETE: 'indm'
});

// ═══════════════════════════════════════════════════════════════
// GENERAL SETTINGS
// ═══════════════════════════════════════════════════════════════

function getSetting(key, fallback = null) {
    return stmts.getSetting.get(key)?.value ?? fallback;
}

function setSetting(key, value) {
    stmts.setSetting.run(key, String(value));
    return true;
}

function getAllSettings() {
    return Object.fromEntries(
        db.prepare('SELECT key,value FROM settings')
            .all()
            .map(row => [row.key, row.value])
    );
}

function resetSetting(key) {
    return db.prepare(
        'DELETE FROM settings WHERE key = ?'
    ).run(key).changes > 0;
}

function resetAllSettings() {
    return db.prepare(
        'DELETE FROM settings'
    ).run().changes;
}

// ═══════════════════════════════════════════════════════════════
// SUDO MANAGEMENT
// ═══════════════════════════════════════════════════════════════

function addSudo(jid) {
    stmts.addSudo.run(jid);
    return true;
}

function removeSudo(jid) {
    return stmts.removeSudo.run(jid).changes > 0;
}

function getSudoList() {
    return stmts.sudoList.all().map(row => row.jid);
}

// Returns numbers without WhatsApp JID suffix
function getSudoNumbers() {
    return getSudoList().map(jid => jid.split('@')[0]);
}

function isSudo(jid) {
    return !!stmts.isSudo.get(jid);
}

function clearAllSudo() {
    return stmts.clearSudo.run().changes;
}

// ═══════════════════════════════════════════════════════════════
// GROUP SETTINGS
// ═══════════════════════════════════════════════════════════════

function getGroupSettings(jid) {
    let row = stmts.getGroup.get(jid);

    if (!row) {
        stmts.insertGroup.run(jid);
        row = stmts.getGroup.get(jid);
    }

    return row;
}

const allowedColumns = new Set([
    'antilink',
    'antispam',
    'antibadword',
    'anticall',
    'welcome',
    'goodbye',
    'antidelete',
    'antimention',
    'antiviewonce',
    'antiforeign',
    'antisticker',
    'antiflood',
    'antiedit',
    'mute',
    'welcomeMsg'
]);

const groupCache = new Map();

function setGroupSetting(jid, key, value) {
    if (!allowedColumns.has(key)) {
        throw new Error(`Invalid group setting: ${key}`);
    }

    if (!groupCache.has(key)) {
        groupCache.set(
            key,
            db.prepare(`UPDATE group_settings SET ${key} = ? WHERE jid = ?`)
        );
    }

    const val = key === 'welcomeMsg'
        ? String(value ?? '')
        : (
            [true, 1, '1', 'true', 'on'].includes(
                typeof value === 'string'
                    ? value.toLowerCase()
                    : value
            ) ? 1 : 0
        );

    return groupCache.get(key).run(val, jid);
}

function getAllGroupSettings() {
    return db.prepare(
        'SELECT * FROM group_settings'
    ).all();
}

// Supports both individual keys and the complete settings overview
function getEnabledGroupSettings(key) {
    const mappings = {
        WELCOME_MESSAGE: 'welcome',
        GOODBYE_MESSAGE: 'goodbye',
        ANTILINK: 'antilink',
        ANTIBAD: 'antibadword',
        ANTIGROUPMENTION: 'antimention'
    };

    // Called without a key by the .settings command
    if (!key) {
        const result = {};

        for (const [label, column] of Object.entries(mappings)) {
            result[label] = db.prepare(
                `SELECT jid FROM group_settings WHERE ${column} = 1`
            ).all().map(row => row.jid);
        }

        // GROUP_EVENTS includes groups with welcome or goodbye enabled
        result.GROUP_EVENTS = db.prepare(`
            SELECT jid FROM group_settings
            WHERE welcome = 1 OR goodbye = 1
        `).all().map(row => row.jid);

        return result;
    }

    const column = mappings[key] || key;

    if (!allowedColumns.has(column) || column === 'welcomeMsg') {
        return [];
    }

    return db.prepare(
        `SELECT * FROM group_settings WHERE ${column} = 1`
    ).all();
}

function resetAllGroupSettings(jid) {
    const query = `
        UPDATE group_settings SET
        antilink=0,
        antispam=0,
        antibadword=0,
        anticall=0,
        welcome=0,
        goodbye=0,
        antidelete=0,
        antimention=0,
        antiviewonce=0,
        antiforeign=0,
        antisticker=0,
        antiflood=0,
        antiedit=0,
        mute=0,
        welcomeMsg=''
    `;

    return jid
        ? db.prepare(`${query} WHERE jid = ?`).run(jid).changes
        : db.prepare(query).run().changes;
}

// ═══════════════════════════════════════════════════════════════
// WARNINGS
// ═══════════════════════════════════════════════════════════════

function addWarning(jid, groupJid, reason = 'No reason provided') {
    return stmts.addWarning.run(
        jid,
        groupJid,
        reason
    ).lastInsertRowid;
}

function countWarnings(jid, groupJid) {
    return stmts.countWarnings.get(jid, groupJid).c;
}

function clearWarnings(jid, groupJid) {
    return stmts.clearWarnings.run(
        jid,
        groupJid
    ).changes;
}

function getAllWarnings(groupJid) {
    return stmts.allWarnings.all(groupJid);
}

function getWarnings(jid, groupJid) {
    return db.prepare(`
        SELECT * FROM warnings
        WHERE jid = ? AND group_jid = ?
        ORDER BY issued_at DESC
    `).all(jid, groupJid);
}

// ═══════════════════════════════════════════════════════════════
// NOTES
// ═══════════════════════════════════════════════════════════════

function saveNote(groupJid, name, content) {
    const tx = db.transaction(() => {
        db.prepare(
            'DELETE FROM notes WHERE group_jid=? AND name=?'
        ).run(groupJid, name);

        return stmts.saveNote.run(
            groupJid,
            name,
            content
        );
    });

    return tx();
}

function getNote(groupJid, name) {
    return stmts.getNote.get(groupJid, name) || null;
}

function getAllNotes(groupJid) {
    return stmts.allNotes.all(groupJid);
}

function deleteNote(groupJid, name) {
    return stmts.deleteNote.run(
        groupJid,
        name
    ).changes > 0;
}

// ═══════════════════════════════════════════════════════════════
// COMMAND STATISTICS
// ═══════════════════════════════════════════════════════════════

function trackCommand(command) {
    return stmts.trackCmd.run(command);
}

function getTopCommands(limit = 10) {
    return stmts.topCmds.all(limit);
}

function getCommandStat(command) {
    return stmts.cmdStat.get(command) || null;
}

function getTotalCommandUses() {
    return stmts.totalUses.get().total || 0;
}

function resetCommandStats() {
    return stmts.resetCmds.run().changes;
}

// ═══════════════════════════════════════════════════════════════
// CONFIG HELPERS
// ═══════════════════════════════════════════════════════════════

function getConfigSync(key, fallback = null) {
    return getSetting(key, fallback);
}

function setConfig(key, value) {
    return setSetting(key, value);
}

// ═══════════════════════════════════════════════════════════════
// DATABASE MANAGEMENT
// ═══════════════════════════════════════════════════════════════

function checkpoint() {
    return db.pragma('wal_checkpoint(TRUNCATE)');
}

function closeDatabase() {
    if (db.open) {
        db.close();
    }
}

// ═══════════════════════════════════════════════════════════════
// PROCESS SIGNALS
// ═══════════════════════════════════════════════════════════════

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
        try {
            checkpoint();
            closeDatabase();
        } catch (err) {
            console.error('[DATABASE]', err.message);
        }

        process.exit(0);
    });
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
    db,

    // General settings
    getSetting,
    setSetting,
    getAllSettings,
    resetSetting,
    resetAllSettings,
    seedDefaults,

    // Sudo
    addSudo,
    removeSudo,
    getSudoList,
    getSudoNumbers,
    isSudo,
    clearAllSudo,

    // Group settings
    getGroupSettings,
    setGroupSetting,
    getAllGroupSettings,
    getEnabledGroupSettings,
    resetAllGroupSettings,

    // Warnings
    addWarning,
    countWarnings,
    clearWarnings,
    getAllWarnings,
    getWarnings,

    // Notes
    saveNote,
    getNote,
    getAllNotes,
    deleteNote,

    // Command statistics
    trackCommand,
    getTopCommands,
    getCommandStat,
    getTotalCommandUses,
    resetCommandStats,

    // Config helpers
    getConfigSync,
    setConfig,

    // Database management
    checkpoint,
    closeDatabase
};
