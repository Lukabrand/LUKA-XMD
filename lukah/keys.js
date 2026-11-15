'use strict';

// GiftedTech API credentials. Set these in Heroku Config Vars.
const LUKA_API_KEY = process.env.LUKA_API_KEY || process.env.GIFTED_API_KEY || '';
const LUKA_API_FALLBACK = process.env.LUKA_API_FALLBACK || process.env.GIFTED_API_FALLBACK || '';

exports.LUKA_API_KEY = LUKA_API_KEY;
exports.LUKA_API_FALLBACK = LUKA_API_FALLBACK;

// Backwards-compatible names for any older plugin importing Panther keys.
exports.PANTHER_API_KEY = LUKA_API_KEY;
exports.PANTHER_API_FALLBACK = LUKA_API_FALLBACK;

exports.GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
exports.OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
exports.GROQ_API_KEY = process.env.GROQ_API_KEY || '';

exports.getGiftedApiKeys = () => [...new Set([LUKA_API_KEY, LUKA_API_FALLBACK].filter(Boolean))];
