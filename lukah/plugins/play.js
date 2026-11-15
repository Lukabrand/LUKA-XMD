
'use strict';

const { addCmd } = require('../../luka/handlers/loader');
const config = require('../../luka/config/settings');
const axios = require('axios');
const { channelCtx } = require('../../luka/utils/gmdFunctions2');
const { getGiftedApiKeys } = require('../keys');

const API_TIMEOUT = 60000;
const DOWNLOAD_TIMEOUT = 90000;
const MAX_VIDEO_SIZE = 64 * 1024 * 1024;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';
const FOOTER = 'ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ';

function extractYtId(value) {
    try {
        const input = String(value || '').trim();
        if (/^[\w-]{11}$/.test(input)) return input;
        const url = new URL(input);
        const host = url.hostname.replace(/^www\./, '').toLowerCase();
        if (host === 'youtu.be') {
            const id = url.pathname.split('/').filter(Boolean)[0];
            return /^[\w-]{11}$/.test(id || '') ? id : null;
        }
        if (['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
            const id = url.searchParams.get('v');
            if (id && /^[\w-]{11}$/.test(id)) return id;
            const match = url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/);
            return match ? match[1] : null;
        }
    } catch (_) {}
    return null;
}

const isYtUrl = value => Boolean(extractYtId(value));
const canonicalYtUrl = value => {
    const id = extractYtId(value);
    return id ? `https://www.youtube.com/watch?v=${id}` : null;
};

function cleanTitle(title) {
    return String(title || 'media').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 150);
}

function formatDuration(value) {
    if (typeof value === 'string' && value.includes(':')) return value;
    const seconds = Number(value) || 0;
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function getArray(data) {
    const candidates = [
        data, data?.results, data?.items, data?.videos, data?.data,
        data?.data?.results, data?.data?.items, data?.result,
        data?.result?.results, data?.result?.videos
    ];
    return candidates.find(Array.isArray) || [];
}

function extractDownloadUrl(data) {
    const result = data?.result;
    const candidates = [
        typeof result === 'string' ? result : null,
        data?.download_url, data?.downloadUrl, data?.url, data?.link, data?.cdn,
        result?.url, result?.download_url, result?.downloadUrl,
        result?.videoUrl, result?.video_url, result?.link, result?.cdn,
        result?.download?.url, result?.video?.url, result?.data?.url,
        data?.data?.url, data?.data?.download_url, data?.data?.downloadUrl,
        data?.data?.videoUrl, data?.data?.video_url, data?.data?.link,
        data?.download?.url, data?.video?.url
    ];
    return candidates.find(v => typeof v === 'string' && /^https?:\/\//i.test(v)) || null;
}

async function getJson(url, timeout = API_TIMEOUT) {
    const response = await axios.get(url, {
        timeout,
        headers: { 'User-Agent': UA, Accept: 'application/json, */*' },
        maxRedirects: 5
    });
    return response.data;
}

async function getGiftedDownload(endpoint, videoUrl, timeout = API_TIMEOUT) {
    const base = (config.GIFTED_TECH_API || 'https://api.giftedtech.web.id').replace(/\/$/, '');
    const keys = getGiftedApiKeys();
    if (!keys.length) throw new Error('Missing LUKA_API_KEY / LUKA_API_FALLBACK');

    let lastError;
    for (const apikey of keys) {
        try {
            const data = await getJson(
                `${base}/api/download/${endpoint}?apikey=${encodeURIComponent(apikey)}&url=${encodeURIComponent(videoUrl)}`,
                timeout
            );
            const url = extractDownloadUrl(data);
            if (!data?.success || !url) {
                throw new Error(data?.message || data?.error || `GiftedTech ${endpoint} returned no URL`);
            }
            return {
                url,
                title: data.result?.title || data.title || 'Media',
                thumbnail: data.result?.thumbnail || '',
                duration: data.result?.duration || 0
            };
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error(`GiftedTech ${endpoint} failed`);
}

async function downloadBuffer(url, type = 'audio') {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
        throw new Error('Invalid download URL');
    }

    const isVideo = type === 'video';
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: DOWNLOAD_TIMEOUT,
        maxContentLength: isVideo ? MAX_VIDEO_SIZE : Infinity,
        maxBodyLength: isVideo ? MAX_VIDEO_SIZE : Infinity,
        maxRedirects: 5,
        headers: {
            'User-Agent': UA,
            Accept: isVideo
                ? 'video/mp4,video/webm,video/*,application/octet-stream,*/*'
                : 'audio/mpeg,audio/*,application/octet-stream,*/*'
        }
    });

    const contentType = String(response.headers['content-type'] || '').toLowerCase();
    if (contentType.includes('text/html') || contentType.includes('application/json')) {
        throw new Error('Provider returned webpage/JSON instead of media');
    }

    const buffer = Buffer.from(response.data);
    if (buffer.length < 4096) throw new Error('Downloaded media is empty or invalid');

    if (isVideo) {
        if (buffer.length > MAX_VIDEO_SIZE) throw new Error('Video exceeds 64MB WhatsApp limit');
        if (contentType.startsWith('audio/')) throw new Error('Provider returned audio instead of video');

        const isMp4 = buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp';
        const isWebm = buffer.length >= 4 && buffer.toString('hex', 0, 4) === '1a45dfa3';

        if (!isMp4 && !isWebm) {
            throw new Error(`Invalid video file. Content-Type: ${contentType || 'unknown'}`);
        }
    }
    return buffer;
}

// YOUTUBE SEARCH
async function searchYouTube(query) {
    try {
        const data = await getJson(
            `https://apiziaul.vercel.app/api/downloader/ytplaymp3?query=${encodeURIComponent(query)}`
        );
        const result = data?.result || {};
        const videoUrl = result.videoUrl || result.url || result.link;

        if (data?.status && isYtUrl(videoUrl)) {
            return [{
                title: result.title || query,
                url: canonicalYtUrl(videoUrl),
                thumbnail: result.thumbnail || '',
                duration: result.duration || ''
            }];
        }

        return getArray(data).map(item => {
            const url = item.url || item.link || item.videoUrl || item.video_url;
            if (!isYtUrl(url)) return null;
            return {
                title: item.title || query,
                url: canonicalYtUrl(url),
                thumbnail: item.thumbnail || item.image || '',
                duration: item.duration || item.timestamp || ''
            };
        }).filter(Boolean);
    } catch (error) {
        console.error('[YT SEARCH FAILED]', error.response?.status || error.message);
        return [];
    }
}

// AUDIO
async function resolveAudio(query, isUrl) {
    const videoUrl = isUrl ? canonicalYtUrl(query) : null;
    const encoded = encodeURIComponent(videoUrl || query);
    const endpoints = [];

    if (isUrl && videoUrl) {
        endpoints.push(async () => {
            const data = await getJson(`https://api.sidycoders.xyz/api/ytdl?url=${encoded}&format=mp3&apikey=memberdycoders`);
            const url = extractDownloadUrl(data);
            if (!url) throw new Error('Sidycoders returned no audio URL');
            return { url, title: data.title || data.result?.title || 'Track' };
        });

        endpoints.push(async () => {
            const data = await getJson(`https://api.nexray.web.id/downloader/ytmp3?url=${encoded}`);
            const url = extractDownloadUrl(data);
            if (!url) throw new Error('Nexray returned no audio URL');
            return { url, title: data.result?.title || 'Track', thumbnail: data.result?.thumbnail || '' };
        });

        for (const name of ['ytmp3v2', 'ytaudio', 'yta', 'ytmp3', 'savetubemp3', 'savemp3']) {
            endpoints.push(() => getGiftedDownload(name, videoUrl, DOWNLOAD_TIMEOUT));
        }

        for (const endpoint of [
            `https://api.ryzendesu.vip/api/downloader/ytmp3?url=${encoded}`,
            `https://api.siputzx.my.id/api/d/ytmp3?url=${encoded}`,
            `https://apiskeith.top/download/audio?url=${encoded}`
        ]) {
            endpoints.push(async () => {
                const data = await getJson(endpoint);
                const url = extractDownloadUrl(data);
                if (!url) throw new Error('Audio URL missing');
                return { url, title: data.title || data.result?.title || 'Track' };
            });
        }
    } else {
        endpoints.push(async () => {
            const data = await getJson(`https://apiziaul.vercel.app/api/downloader/ytplaymp3?query=${encoded}`);
            const url = extractDownloadUrl(data);
            if (!url) throw new Error('Apiziaul returned no audio URL');
            return { url, title: data.result?.title || query, thumbnail: data.result?.thumbnail || '' };
        });
    }

    for (const endpoint of endpoints) {
        try {
            const result = await endpoint();
            if (!result?.url) continue;
            const buffer = await downloadBuffer(result.url, 'audio');
            return { ...result, buffer };
        } catch (error) {
            console.error('[AUDIO PROVIDER FAILED]', error.response?.status || error.message);
        }
    }
    return null;
}

// VIDEO
async function resolveVideo(query) {
    const videoUrl = canonicalYtUrl(query);
    if (!videoUrl) throw new Error('A valid YouTube video URL is required');

    const encoded = encodeURIComponent(videoUrl);
    const endpoints = [
        async () => {
            const data = await getJson(`https://apis.davidcyril.name.ng/download/ytmp4?url=${encoded}`, DOWNLOAD_TIMEOUT);
            const url = extractDownloadUrl(data);
            if (!url) throw new Error(data?.message || data?.error || 'David Cyril returned no video URL');
            return { url, title: data.result?.title || data.title || 'Video', duration: data.result?.duration || data.duration || 0 };
        },
        async () => {
            const data = await getJson(`https://api.nexray.web.id/downloader/ytmp4?url=${encoded}&resolusi=720`, DOWNLOAD_TIMEOUT);
            const url = extractDownloadUrl(data);
            if (!url) throw new Error('Nexray returned no video URL');
            return { url, title: data.result?.title || data.title || 'Video', duration: data.result?.duration || data.duration || 0 };
        },
        async () => {
            const data = await getJson(`https://api.sidycoders.xyz/api/ytdl?url=${encoded}&format=mp4&apikey=memberdycoders`, DOWNLOAD_TIMEOUT);
            const url = extractDownloadUrl(data);
            if (!url) throw new Error('Sidycoders returned no video URL');
            return { url, title: data.title || data.result?.title || 'Video', duration: data.duration || 0 };
        },
        ...['ytmp4v2', 'ytvideo', 'ytv', 'ytmp4', 'savetubemp4', 'savemp4']
            .map(name => () => getGiftedDownload(name, videoUrl, DOWNLOAD_TIMEOUT)),
        async () => {
            const data = await getJson(`https://api.ryzendesu.vip/api/downloader/ytmp4?url=${encoded}`, DOWNLOAD_TIMEOUT);
            const url = extractDownloadUrl(data);
            if (!url) throw new Error('Ryzendesu returned no video URL');
            return { url, title: data.title || data.result?.title || 'Video' };
        },
        async () => {
            const data = await getJson(`https://api.siputzx.my.id/api/d/ytmp4?url=${encoded}`, DOWNLOAD_TIMEOUT);
            const url = extractDownloadUrl(data);
            if (!url) throw new Error('Siputzx returned no video URL');
            return { url, title: data.title || data.result?.title || 'Video' };
        },
        async () => {
            const data = await getJson(`https://apiskeith.top/download/video?url=${encoded}`, DOWNLOAD_TIMEOUT);
            const url = extractDownloadUrl(data);
            if (!url) throw new Error('Apiskeith returned no video URL');
            return { url, title: data.title || data.result?.title || 'Video' };
        }
    ];

    for (const endpoint of endpoints) {
        try {
            const result = await endpoint();
            if (!result?.url) continue;
            const buffer = await downloadBuffer(result.url, 'video');
            console.log('[VIDEO PROVIDER] Valid video received');
            return { ...result, buffer };
        } catch (error) {
            console.error('[VIDEO PROVIDER FAILED]', error.response?.status || error.message);
        }
    }
    return null;
}

// SEND AUDIO
async function sendAudio(ctx, query, directOnly = false) {
    const isUrl = isYtUrl(query);
    await ctx.react('🔍');
    let resolved = null;

    if (isUrl || directOnly) {
        resolved = await resolveAudio(query, true);
    } else {
        const results = await searchYouTube(query);
        if (results[0]?.url && isYtUrl(results[0].url)) {
            resolved = await resolveAudio(results[0].url, true);
        }
        if (!resolved) resolved = await resolveAudio(query, false);
    }

    if (!resolved?.buffer) {
        await ctx.react('❌');
        return ctx.reply(`❌ Audio download failed for: ${query}\n\nAll available audio providers failed.\n\n${FOOTER}`);
    }

    await ctx.react('⬇️');
    await ctx.sock.sendMessage(ctx.from, {
        audio: resolved.buffer,
        mimetype: 'audio/mpeg',
        ptt: false,
        fileName: `${cleanTitle(resolved.title || query)}.mp3`,
        contextInfo: channelCtx()
    }, { quoted: ctx.m });
    await ctx.react('✅');
}

// SEND VIDEO
async function sendVideo(ctx, query) {
    await ctx.react('🔍');
    let target = query;

    if (!isYtUrl(query)) {
        const results = await searchYouTube(query);
        const first = results.find(item => item.url && isYtUrl(item.url));
        if (!first) {
            await ctx.react('❌');
            return ctx.reply(`❌ No valid YouTube video found for: ${query}\n\nTry a direct YouTube URL.\n\n${FOOTER}`);
        }
        target = first.url;
    }

    target = canonicalYtUrl(target);
    const resolved = await resolveVideo(target);

    if (!resolved?.buffer) {
        await ctx.react('❌');
        return ctx.reply(`❌ Video download failed for: ${query}\n\nAll video providers failed to return a valid video file. Check Heroku logs.\n\n${FOOTER}`);
    }

    const isWebm = resolved.buffer.toString('hex', 0, 4) === '1a45dfa3';
    const mime = isWebm ? 'video/webm' : 'video/mp4';
    const ext = isWebm ? 'webm' : 'mp4';

    await ctx.react('⬇️');
    await ctx.sock.sendMessage(ctx.from, {
        video: resolved.buffer,
        mimetype: mime,
        fileName: `${cleanTitle(resolved.title || query)}.${ext}`,
        caption:
            `🎬 *${resolved.title || query}*\n` +
            (resolved.duration ? `⏱️ ${formatDuration(resolved.duration)}\n` : '') +
            `\n${config.BOT_NAME || 'LUKA-XMD'}\n${FOOTER}`,
        contextInfo: channelCtx()
    }, { quoted: ctx.m });
    await ctx.react('✅');
}

// PLAY
addCmd({
    name: 'play',
    aliases: ['music', 'song', 'yta', 'audio', 'ply', 'ytmp3', 'ytaudio'],
    desc: 'Search and download a YouTube song',
    usage: 'play <song name or YouTube URL>',
    category: 'downloader',
    handler: async ctx => {
        const query = (ctx.text || '').trim();
        if (!query) return ctx.reply(`🎵 *PLAY*\n\nUsage: ${ctx.prefix}play diamond komasava\nOr: ${ctx.prefix}play https://youtu.be/VIDEO_ID\n\n${FOOTER}`);
        try {
            await sendAudio(ctx, query);
        } catch (error) {
            console.error('[PLAY ERROR]', error.response?.data || error.message);
            await ctx.react('❌');
            await ctx.reply(`❌ Audio failed: ${error.message}\n\n${FOOTER}`);
        }
    }
});

// YTMP3
addCmd({
    name: 'ytmp3',
    aliases: ['ymp3', 'yt3'],
    desc: 'Download MP3 from a YouTube URL',
    usage: 'ytmp3 <YouTube URL>',
    category: 'downloader',
    handler: async ctx => {
        const query = (ctx.text || '').trim();
        if (!query || !isYtUrl(query)) return ctx.reply(`❌ Provide a valid YouTube URL.\n\n${FOOTER}`);
        try {
            await sendAudio(ctx, query, true);
        } catch (error) {
            console.error('[YTMP3 ERROR]', error.response?.data || error.message);
            await ctx.react('❌');
            await ctx.reply(`❌ MP3 failed: ${error.message}\n\n${FOOTER}`);
        }
    }
});

// VIDEO
addCmd({
    name: 'video',
    aliases: ['ytmp4', 'mp4', 'dlmp4', 'ytv', 'ytvideo'],
    desc: 'Download a YouTube video',
    usage: 'video <title or YouTube URL>',
    category: 'downloader',
    handler: async ctx => {
        const query = (ctx.text || '').trim();
        if (!query) return ctx.reply(`🎬 *VIDEO*\n\nUsage: ${ctx.prefix}video diamond komasava\nOr: ${ctx.prefix}video https://youtu.be/VIDEO_ID\n\n${FOOTER}`);
        try {
            await sendVideo(ctx, query);
        } catch (error) {
            console.error('[VIDEO ERROR]', error.response?.data || error.message);
            await ctx.react('❌');
            await ctx.reply(`❌ Video failed: ${error.message}\n\n${FOOTER}`);
        }
    }
});
            
