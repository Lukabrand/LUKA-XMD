
'use strict';

const axios = require('axios');
const { addCmd } = require('../../luka/handlers/loader');
const config = require('../../luka/config/settings');
const { guruApi } = require('../../luka/utils/guruApi');

const API_KEY = config.LUKA_API_KEY || config.GIFTED_API_KEY || '';
const API_BASE = (config.GIFTED_TECH_API || 'https://api.giftedtech.web.id').replace(/\/$/, '');

async function downloadApi(endpoint, params = {}) {
    const { data } = await axios.get(`${API_BASE}/api/${endpoint}`, {
        params: { apikey: API_KEY, ...params },
        timeout: 60000
    });
    return data;
}

function getResult(data) {
    return data?.result || data?.data || data;
}

function getDownloadUrl(data) {
    const result = getResult(data);
    return result?.download_url || result?.downloadUrl ||
        result?.url || result?.link || result?.dl || null;
}

async function getBuffer(url) {
    const { data } = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 120000,
        maxContentLength: 100 * 1024 * 1024
    });
    return Buffer.from(data);
}

async function sendDocument(ctx, url, filename, mimetype = 'application/octet-stream') {
    const buffer = await getBuffer(url);
    if (!buffer.length) throw new Error('File haijapatikana.');

    return ctx.sendMessage(ctx.chat, {
        document: buffer,
        fileName: filename,
        mimetype
    }, { quoted: ctx });
}

// SPOTIFY
addCmd({
    pattern: 'spotify',
    aliases: ['spotifydl', 'spotidl', 'spoti'],
    desc: 'Download Spotify music',
    category: 'downloader'
}, async (ctx, text) => {
    try {
        if (!text) return ctx.reply('Tumia: .spotify song name au Spotify URL');

        const data = await downloadApi('download/spotify', { url: text });
        const url = getDownloadUrl(data);
        if (!url) throw new Error('Spotify download link haijapatikana.');

        const buffer = await getBuffer(url);
        await ctx.sendMessage(ctx.chat, {
            audio: buffer,
            mimetype: 'audio/mpeg',
            fileName: 'spotify.mp3'
        }, { quoted: ctx });
    } catch (e) {
        await ctx.reply(`Spotify error: ${e.message}`);
    }
});

// GOOGLE DRIVE
addCmd({
    pattern: 'gdrive',
    aliases: ['googledrive', 'drive', 'gdrivedl'],
    desc: 'Download Google Drive files',
    category: 'downloader'
}, async (ctx, text) => {
    try {
        if (!text) return ctx.reply('Tumia: .gdrive Google Drive URL');

        const data = await downloadApi('download/gdrive', { url: text });
        const url = getDownloadUrl(data);
        if (!url) throw new Error('Google Drive download link haijapatikana.');

        await sendDocument(ctx, url, 'gdrive-file');
    } catch (e) {
        await ctx.reply(`Google Drive error: ${e.message}`);
    }
});

// APK
addCmd({
    pattern: 'apk',
    aliases: ['app', 'apkdl', 'appdownload'],
    desc: 'Download APK applications',
    category: 'downloader'
}, async (ctx, text) => {
    try {
        if (!text) return ctx.reply('Tumia: .apk app name');

        const data = await downloadApi('download/apk', { q: text });
        const url = getDownloadUrl(data);
        if (!url) throw new Error('APK download link haijapatikana.');

        await sendDocument(url, url, 'application.apk', 'application/vnd.android.package-archive');
    } catch (e) {
        await ctx.reply(`APK error: ${e.message}`);
    }
});

// PASTEBIN
addCmd({
    pattern: 'pastebin',
    aliases: ['getpaste', 'getpastebin', 'pastedl', 'pastebindl', 'paste'],
    desc: 'Get Pastebin content',
    category: 'downloader'
}, async (ctx, text) => {
    try {
        if (!text) return ctx.reply('Tumia: .pastebin Pastebin URL');

        const data = await downloadApi('tools/pastebin', { url: text });
        const result = getResult(data);
        const content = result?.content || result?.text || result?.paste || result;

        if (!content || typeof content !== 'string') {
            throw new Error('Pastebin content haijapatikana.');
        }

        await ctx.reply(content.slice(0, 60000));
    } catch (e) {
        await ctx.reply(`Pastebin error: ${e.message}`);
    }
});
      
