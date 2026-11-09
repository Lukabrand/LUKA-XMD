'use strict';

const { addCmd } = require('../../luka/handlers/loader');
const axios = require('axios');
const config = require('../../luka/config/settings');

async function queryAI(endpoint, query, ctx) {
    const { reply } = ctx;

    if (!query) {
        return reply('Please provide a question or prompt.');
    }

    try {
        const apiBase = config.GIFTED_TECH_API || config.GiftedTechApi;
        const apiKey = config.GIFTED_API_KEY || config.GiftedApiKey;

        if (!apiBase || !apiKey) {
            return reply('❌ Gifted API configuration is missing.');
        }

        const apiUrl = `${apiBase}/api/ai/${endpoint}`;

        const res = await axios.get(apiUrl, {
            params: {
                apikey: apiKey,
                q: query
            },
            timeout: 100000
        });

        if (!res.data?.success || !res.data?.result) {
            return reply('❌ Failed to get a response. Try again.');
        }

        return reply(res.data.result);

    } catch (err) {
        console.error(`[AI ${endpoint} ERROR]:`, err.message);
        return reply('❌ Error: ' + err.message);
    }
}

const aiCommands = [
    {
        name: 'giftedai',
        aliases: ['ai'],
        endpoint: 'ai',
        description: 'Chat with Gifted AI assistant',
        defaultQuery: "What's your model?"
    },
    {
        name: 'chatai',
        aliases: [],
        endpoint: 'chat',
        description: 'General AI chat assistant'
    },
    {
        name: 'gpt',
        aliases: ['chatgpt'],
        endpoint: 'gpt',
        description: 'Chat with GPT model'
    },
    {
        name: 'gpt4',
        aliases: ['chatgpt4'],
        endpoint: 'gpt4',
        description: 'Chat with GPT-4 model'
    },
    {
        name: 'gpt4o',
        aliases: ['chatgpt4o'],
        endpoint: 'gpt4o',
        description: 'Chat with GPT-4o model'
    },
    {
        name: 'gpt4o-mini',
        aliases: ['chatgpt4o-mini'],
        endpoint: 'gpt4o-mini',
        description: 'Chat with GPT-4o Mini (faster)'
    },
    {
        name: 'openai',
        aliases: [],
        endpoint: 'openai',
        description: 'Chat with OpenAI model'
    },
    {
        name: 'gemini',
        aliases: [],
        endpoint: 'geminiai',
        description: 'Chat with Google Gemini'
    },
    {
        name: 'venice',
        aliases: ['veniceai'],
        endpoint: 'mistral',
        description: 'Chat with Venice AI model'
    },
    {
        name: 'letmegpt',
        aliases: [],
        endpoint: 'letmegpt',
        description: 'Simple GPT-style AI chat'
    }
];

for (const command of aiCommands) {
    addCmd({
        name: command.name,
        aliases: command.aliases,
        category: 'ai',
        description: command.description,

        handler: async (ctx) => {
            const query = (ctx.args || []).join(' ').trim()
                || command.defaultQuery;

            await queryAI(command.endpoint, query, ctx);
        }
    });
}

module.exports = {};
