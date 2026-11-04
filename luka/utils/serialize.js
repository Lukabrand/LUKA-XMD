'use strict';

const { getContentType } = require('@whiskeysockets/baileys');
const { getBody, cleanJid } = require('./helpers');
const { getGroupMeta } = require('./groupCache');
const { getSetting } = require('../db/database');
const config = require('../config/settings');

/**

* Normalize phone numbers and WhatsApp JIDs.
  */
  function normalizeNumber(value) {
  if (!value) return '';
  
  return String(value)
  .split('@')[0]
  .split(':')[0]
  .replace(/\D/g, '');
  }

/**

* Get the latest owner number from database.
  */
  function getCurrentOwnerNumber() {
  try {
  const saved = getSetting(
  'OWNER_NUMBER',
  config.OWNER_NUMBER || ''
  );
  
   const number = normalizeNumber(saved);

 if (number) {
     config.OWNER_NUMBER = number;
     return number;
 }
  
  } catch (error) {
  // Fall back to config if database is unavailable.
  }
  
  return normalizeNumber(config.OWNER_NUMBER);
  }

/**

* Enriches a raw Baileys message with convenient derived fields.
  */
  async function serialize(msg, sock) {
  if (!msg || !msg.message) return msg;
  
  const m = msg;
  
  const botId = cleanJid(sock.user?.id || '');
  const rawFrom = m.key.remoteJid || '';
  const isGroup = rawFrom.endsWith('@g.us');
  const isStatus = rawFrom === 'status@broadcast';
  const fromMe = Boolean(m.key.fromMe);
  
  // LID → phone-number JID remap
  let from = rawFrom;
  
  if (!isGroup && !isStatus && rawFrom.endsWith('@lid')) {
  const pn = m.key.senderPn || m.key.participantPn;
  
   if (pn) {
     from = cleanJid(pn);
 }
  
  }
  
  // Sender
  const sender = isGroup
  ? cleanJid(
  m.key.participantPn ||
  m.key.participant ||
  m.participant ||
  ''
  )
  : cleanJid(
  m.key.senderPn ||
  from
  );
  
  // Message type & body
  const type = getContentType(m.message);
  const body = getBody(m);
  
  // Command parsing
  const prefix = config.BOT_PREFIX || '.';
  const isCmd = body.startsWith(prefix);
  
  const command = isCmd
  ? body.slice(prefix.length).trim().split(/\s+/)[0].toLowerCase()
  : '';
  
  const args = isCmd
  ? body.slice(prefix.length + command.length)
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  : [];
  
  const text = args.join(' ');
  
  // Quoted message
  const _inner =
  m.message?.ephemeralMessage?.message ||
  m.message?.documentWithCaptionMessage?.message ||
  m.message?.viewOnceMessage?.message ||
  m.message?.viewOnceMessageV2?.message ||
  m.message || {};
  
  const _ctx =
  _inner.extendedTextMessage?.contextInfo ||
  _inner.imageMessage?.contextInfo ||
  _inner.videoMessage?.contextInfo ||
  _inner.audioMessage?.contextInfo ||
  _inner.documentMessage?.contextInfo ||
  _inner.stickerMessage?.contextInfo ||
  _inner.buttonsResponseMessage?.contextInfo ||
  _inner.listResponseMessage?.contextInfo ||
  null;
  
  const quoted = _ctx?.quotedMessage || null;
  
  const quotedKey = _ctx
  ? {
  id: _ctx.stanzaId,
  remoteJid: from,
  participant: _ctx.participant,
  }
  : null;
  
  // Group information
  let groupMeta = null;
  let groupName = '';
  let participants = [];
  let admins = [];
  let isBotAdmin = false;
  let isAdmin = false;
  
  if (isGroup) {
  try {
  groupMeta = await getGroupMeta(sock, from);
  
       groupName = groupMeta.subject || '';
     participants = groupMeta.participants || [];

     admins = participants
         .filter(p => p.admin)
         .map(p => cleanJid(p.id));

     isBotAdmin = admins.includes(botId);
     isAdmin = admins.includes(sender);
 } catch {
     try {
         groupMeta = await sock.groupMetadata(from);

         groupName = groupMeta.subject || '';
         participants = groupMeta.participants || [];

         admins = participants
             .filter(p => p.admin)
             .map(p => cleanJid(p.id));

         isBotAdmin = admins.includes(botId);
         isAdmin = admins.includes(sender);
     } catch {}
 }
  
  }
  
  // Push name
  const pushName = m.pushName || 'User';
  
  // Dynamic ownership check
  const ownerNumber = getCurrentOwnerNumber();
  const senderNumber = normalizeNumber(sender);
  
  const isOwner =
  fromMe ||
  Boolean(
  ownerNumber &&
  senderNumber &&
  senderNumber === ownerNumber
  );
  
  Object.assign(m, {
  from,
  isGroup,
  isStatus,
  fromMe,
  sender,
  botId,
  type,
  body,
  isCmd,
  command,
  args,
  text,
  prefix,
  quoted,
  quotedKey,
  groupMeta,
  groupName,
  participants,
  admins,
  isBotAdmin,
  isAdmin,
  pushName,
  isOwner,
  });
  
  return m;
  }

module.exports = {
serialize,
getCurrentOwnerNumber,
};
