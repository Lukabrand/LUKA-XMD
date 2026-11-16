'use strict';

const TTL = 10 * 60 * 1000;
const REQUEST_TIMEOUT = 5000;
const cache = new Map();
const pending = new Map();

function getCached(jid) {
    const entry = cache.get(jid);
    if (!entry) return null;
    if (Date.now() - entry.ts > TTL) { cache.delete(jid); return null; }
    return entry.meta;
}

function setCached(jid, meta) {
    if (jid && meta) cache.set(jid, { meta, ts: Date.now() });
}

function invalidate(jid) {
    if (jid) cache.delete(jid);
    else cache.clear();
}

async function getGroupMeta(sock, jid) {
    const hit = getCached(jid);
    if (hit) return hit;
    if (pending.has(jid)) return pending.get(jid);

    const request = Promise.race([
        sock.groupMetadata(jid),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Group metadata timeout')), REQUEST_TIMEOUT))
    ]).then(meta => {
        setCached(jid, meta);
        return meta;
    }).finally(() => pending.delete(jid));

    pending.set(jid, request);
    return request;
}

module.exports = { getCached, setCached, invalidate, getGroupMeta };
