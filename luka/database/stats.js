
const { DATABASE } = require('./database');
const { DataTypes, Op } = require('sequelize');

const CommandStat = DATABASE.define('CommandStat', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    command: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    lastUsed: {
        type: DataTypes.DATE,
        allowNull: true,
    },
}, {
    tableName: 'command_stats',
    timestamps: false,
});

async function initStatsDB() {
    await CommandStat.sync();
}

// Fire-and-forget — never let stats tracking slow down or break a command.
async function recordCommandUsage(command) {
    if (!command) return;
    try {
        await initStatsDB();
        const [row] = await CommandStat.findOrCreate({
            where: { command },
            defaults: { count: 0 },
        });
        row.count += 1;
        row.lastUsed = new Date();
        await row.save();
    } catch (_) {
        // Stats are best-effort — never throw into the command pipeline
    }
}

async function getTopCommands(limit = 10) {
    await initStatsDB();
    return await CommandStat.findAll({
        order: [['count', 'DESC']],
        limit,
    });
}

async function getTotalCommandRuns() {
    await initStatsDB();
    const rows = await CommandStat.findAll();
    return rows.reduce((sum, r) => sum + r.count, 0);
}

async function resetStats() {
    await initStatsDB();
    await CommandStat.destroy({ where: {}, truncate: true });
}

module.exports = {
    initStatsDB,
    recordCommandUsage,
    getTopCommands,
    getTotalCommandRuns,
    resetStats,
    CommandStat,
};
