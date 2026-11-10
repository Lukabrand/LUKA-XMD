'use strict';

const { addCmd } = require('../../luka/handlers/loader');
const config = require('../../luka/config/settings');
const { sendButtons } = require('../../luka/utils/gmdFunctions2');

const FOOTER = 'ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ';

addCmd({
    name: 'getchanneljid',
    aliases: ['channeljid', 'getjid'],
    category: 'owner',
    ownerOnly: true,
    desc: 'Get WhatsApp Channel JID',

    async handler(ctx) {
        try {
            const sock = ctx.sock;

            if (!sock) {
                return ctx.reply('❌ WhatsApp connection is unavailable.');
            }

            const channelUrl = String(config.CHANNEL_URL || '').trim();

            if (!channelUrl) {
                return ctx.reply('❌ CHANNEL_URL is not configured.');
            }

            let inviteCode;

            try {
                const url = new URL(channelUrl);
                inviteCode = url.pathname.split('/').filter(Boolean).pop();
            } catch {
                return ctx.reply('❌ Invalid CHANNEL_URL. Please check your channel link.');
            }

            if (!inviteCode) {
                return ctx.reply('❌ Channel invite code was not found.');
            }

            await ctx.react('🔍');

            const metadata = await sock.newsletterMetadata(
                'invite',
                inviteCode
            );

            if (!metadata?.id) {
                await ctx.react('❌');
                return ctx.reply('❌ Failed to retrieve Channel JID.');
            }

            const channelName = metadata.name || 'Unknown';
            const channelJid = metadata.id;

            const card =
                `📡 *WHATSAPP CHANNEL INFORMATION*\n` +
                `⚡ ${config.BOT_NAME || 'LUKA-XMD'}\n` +
                `_Official Channel Details_\n\n` +
                `✦ ───────────── ✦\n\n` +
                `📛 *CHANNEL NAME*\n` +
                `${channelName}\n\n` +
                `🆔 *CHANNEL JID*\n` +
                `${channelJid}\n\n` +
                `🔗 *CHANNEL INVITE LINK*\n` +
                `${channelUrl}\n\n` +
                `✦ ───────────── ✦\n\n` +
                `✅ Channel information retrieved successfully.`;

            await sendButtons(sock, ctx.from, {
                title: `📡 ${channelName} — Channel Information`,
                text: card,
                footer: FOOTER,
                buttons: [
                    {
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: '📡 Open WhatsApp Channel',
                            url: channelUrl,
                            merchant_url: channelUrl,
                        }),
                    },
                    {
                        name: 'cta_copy',
                        buttonParamsJson: JSON.stringify({
                            display_text: '📋 Copy Channel JID',
                            copy_code: channelJid,
                        }),
                    },
                ],
            }, { quoted: ctx.m });

            await ctx.react('✅');

            console.log('[CHANNEL JID]', channelJid);

        } catch (error) {
            console.error('[GET CHANNEL JID]', error);

            try {
                await ctx.react('❌');
            } catch {}

            await ctx.reply(
                `❌ *CHANNEL INFORMATION ERROR*\n\n` +
                `${error.message || 'Unknown error'}`
            );
        }
    },
});
