'use strict';

const { addCmd } = require('../../luka/handlers/loader');
const axios = require('axios');
const config = require('../../luka/config/settings');
const { sendButtons } = require('../../luka/utils/gmdFunctions2');

const API_BASE = config.GIFTED_TECH_API || 'https://api.giftedtech.co.ke';
const API_KEY = config.GIFTED_API_KEY || '';

addCmd({
    name: 'bible',
    aliases: ['verse', 'bibleverse', 'scripture'],
    category: 'religion',
    description: 'Get Bible verses',

    handler: async (ctx) => {
        const verse = (ctx.args || []).join(' ').trim();

        if (!verse) {
            return ctx.reply(
                '📖 *BIBLE VERSE*\n\n' +
                'Please provide a Bible verse reference.\n\n' +
                '*Usage:*\n' +
                '.bible John 3:16\n' +
                '.bible John 3:16-20\n' +
                '.bible John 3'
            );
        }

        try {
            if (ctx.react) await ctx.react('⏳');

            const response = await axios.get(
                `${API_BASE}/api/search/bible`,
                {
                    params: {
                        apikey: API_KEY,
                        verse
                    },
                    timeout: 30000
                }
            );

            if (!response.data?.success || !response.data?.result) {
                if (ctx.react) await ctx.react('❌');
                return ctx.reply(
                    '❌ Failed to fetch Bible verse. Please check the reference format.'
                );
            }

            const r = response.data.result;

            let txt = `*${config.BOT_NAME || 'LUKA-XMD'} BIBLE* 📖\n\n`;

            txt += `📖 *Verse:* ${r.verse || verse}\n`;
            txt += `📊 *Verse Count:* ${r.versesCount || 1}\n\n`;

            txt += `*English:*\n${r.data?.trim() || 'N/A'}\n\n`;

            if (r.translations?.swahili) {
                txt += `*Swahili:*\n${r.translations.swahili}\n\n`;
            }

            if (r.translations?.hindi) {
                txt += `*Hindi:*\n${r.translations.hindi}\n\n`;
            }

            txt += `\nᴘᴏᴡᴇʀᴇᴅ ʙʏ ʟᴜᴋᴀʙʀᴀɴᴅ`;

            const copyContent = r.data?.trim() || '';

            if (typeof sendButtons === 'function' && copyContent) {
                await sendButtons(ctx.Gifted || ctx.sock, ctx.from, {
                    title: '',
                    text: txt,
                    footer: config.FOOTER || 'LUKA-XMD',
                    buttons: [
                        {
                            name: 'cta_copy',
                            buttonParamsJson: JSON.stringify({
                                display_text: '📋 Copy Verse',
                                copy_code: copyContent
                            })
                        }
                    ]
                });
            } else {
                await ctx.reply(txt);
            }

            if (ctx.react) await ctx.react('✅');

        } catch (error) {
            console.error('[BIBLE ERROR]:', error);

            if (ctx.react) await ctx.react('❌');

            return ctx.reply(
                '❌ Failed to fetch Bible verse. Please try again later.'
            );
        }
    }
});

module.exports = {};
