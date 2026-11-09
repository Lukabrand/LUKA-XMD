'use strict';

const { addCmd } = require('../../luka/handlers/loader');
const config = require('../../luka/config/settings');

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
                return ctx.reply('❌ WhatsApp connection haipatikani.');
            }

            const channelUrl = config.CHANNEL_URL;

            if (!channelUrl) {
                return ctx.reply('❌ CHANNEL_URL haijawekwa.');
            }

            const inviteCode = channelUrl
                .split('/')
                .filter(Boolean)
                .pop()
                .split('?')[0];

            await ctx.reply('🔍 Inatafuta Channel JID, subiri...');

            const metadata = await sock.newsletterMetadata(
                'invite',
                inviteCode
            );

            if (!metadata?.id) {
                return ctx.reply('❌ Imeshindwa kupata Channel JID.');
            }

            const result =
`📡 *WHATSAPP CHANNEL INFORMATION*

📛 Channel Name: ${metadata.name || 'Unknown'}

🆔 Channel JID:
${metadata.id}

🔗 Channel URL:
${channelUrl}

━━━━━━━━━━━━━━━━━━
ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`;

            await ctx.reply(result);

            console.log('[CHANNEL JID]', metadata.id);

        } catch (error) {
            console.error('[GET CHANNEL JID]', error);

            await ctx.reply(
                `❌ Error kupata Channel JID:\n${error.message}`
            );
        }
    }
});
