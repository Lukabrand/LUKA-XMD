'use strict';

const axios = require('axios');
const config = require('../config/settings');
const { getGiftedApiKeys } = require('../../lukah/keys');

const BASE_URL = (config.GIFTED_TECH_API || 'https://api.giftedtech.web.id').replace(/\/$/, '');

/**
 * GiftedTech request helper.
 * `action` must be a documented GiftedTech API path, for example `ai/gpt`.
 * Payload fields are sent as query parameters alongside `apikey`.
 * This replaces the old Supabase POST proxy; it does not invent API actions.
 */
async function guruApi(action, payload = {}) {
    const endpoint = String(action || '').replace(/^\/+|\/+$/g, '');
    if (!endpoint) throw new Error('GiftedTech API action/endpoint is required');

    const keys = getGiftedApiKeys();
    if (!keys.length) throw new Error('Missing LUKA_API_KEY / LUKA_API_FALLBACK');

    let lastError;
    for (const apikey of keys) {
        try {
            const response = await axios.get(`${BASE_URL}/api/${endpoint}`, {
                params: { ...payload, apikey },
                timeout: 30000,
                headers: { 'User-Agent': 'LukaXMD/2.0', Accept: 'application/json' }
            });
            return response.data;
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error('GiftedTech API request failed');
}

module.exports = { guruApi, BASE_URL };
