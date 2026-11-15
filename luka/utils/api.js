'use strict';

const axios = require('axios');
const config = require('../config/settings');
const { getGiftedApiKeys } = require('../../lukah/keys');

const BASE = (config.GIFTED_TECH_API || 'https://api.giftedtech.web.id').replace(/\/$/, '');

async function giftedRequest(path, params = {}, options = {}) {
    const endpoint = String(path || '').replace(/^\/+/, '');
    if (!endpoint) throw new Error('GiftedTech endpoint is required');
    const keys = getGiftedApiKeys();
    if (!keys.length) throw new Error('Missing LUKA_API_KEY / LUKA_API_FALLBACK');

    let lastError;
    for (const apikey of keys) {
        try {
            const response = await axios.get(`${BASE}/api/${endpoint}`, {
                ...options,
                params: { ...params, apikey },
                timeout: options.timeout || 30000,
                headers: { 'User-Agent': 'LukaXMD/2.0', Accept: 'application/json', ...(options.headers || {}) }
            });
            return response.data;
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error('GiftedTech API request failed');
}

module.exports = { giftedRequest, BASE, getGiftedApiKeys };
