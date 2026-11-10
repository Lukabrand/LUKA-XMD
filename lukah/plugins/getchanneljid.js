'use strict';

const { addCmd } = require('../../luka/handlers/loader');
const config = require('../../luka/config/settings');
const { sendButtons } = require('../../luka/utils/gmdFunctions2');

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

            const channelUrl = config.CHANNEL_URL;

            if (!channelUrl) {
                return ctx.reply('❌ CHANNEL_URL is not configured.');
            }

            const inviteCode = channelUrl
                .split('/')
                .filter(Boolean)
                .pop()
                .split('?')[0];

            await ctx.react('🔍');

            const metadata = await sock.newsletterMetadata(
                'invite',
                inviteCode
            );

            if (!metadata?.id) {
                return ctx.reply('❌ Failed to retrieve Channel JID.');
            }

            const channelName = metadata.name || 'Unknown';
            const channelJid = metadata.id;

            const card =
                `📡 *WHATSAPP CHANNEL INFORMATION*\n` +
                `🐾 ${config.BOT_NAME || 'LUKA-XMD'}\n` +
                `_Official Channel Details_\n\n` +
                `✦ ───────────── ✦\n\n` +
                `📛 *CHANNEL NAME*\n` +
                `${channelName}\n\n` +
                `🆔 *CHANNEL JID*\n` +
                `${channelJid}\n\n` +
                `🔗 *CHANNEL INVITE LINK*\n` +
                `${channelUrl}\n\n` +
                `✦ ───────────── ✦\n\n` +
                `✅ Channel information retrieved successfully.\n\n` +
                `_${FOOTER}_`;

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

            await ctx.react('❌');

            await ctx.reply(
                `❌ *CHANNEL INFORMATION ERROR*\n\n` +
                `${error.message}\n\n` +
                `${FOOTER}`
            );
        }
    },
});
