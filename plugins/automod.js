const NSFW_PATTERNS = [
  /\b(nudes?|nudez?|porn|xxx|sexcam|onlyfans|nsfw)\b/i,
  /\b(s3x|sexting|horny|boobs?|pussy|dick|cock)\b/i,
];

const SCAM_PATTERNS = [
  /\b(free money|easy money|guaranteed profit|double your money)\b/i,
  /\b(binance support|wallet recovery|seed phrase|private key)\b/i,
  /\b(bitcoin giveaway|crypto giveaway|investment plan|forex signal)\b/i,
  /\b(win iphone|claim prize|gift card code|click this offer)\b/i,
];

const GROUP_INVITE_PATTERN = /https:\/\/chat\.whatsapp\.com\/([A-Za-z0-9]{20,24})/gi;
const CHANNEL_PATTERN = /https:\/\/whatsapp\.com\/channel\/[A-Za-z0-9?=._-]+/gi;
const URL_PATTERN = /https?:\/\/[^\s]+/gi;
const WRAP_DURATION_MS = 10 * 60 * 1000;
const DISABLED_NOTICE_INTERVAL_MS = 6 * 60 * 60 * 1000;

function ensureAutomod(chat) {
  if (!chat.automod || typeof chat.automod !== "object") {
    chat.automod = {};
  }

  const cfg = chat.automod;
  if (typeof cfg.enabled !== "boolean") cfg.enabled = false;
  if (typeof cfg.floodThreshold !== "number") cfg.floodThreshold = 5;
  if (typeof cfg.floodWindowMs !== "number") cfg.floodWindowMs = 10_000;
  if (typeof cfg.repeatThreshold !== "number") cfg.repeatThreshold = 3;
  if (typeof cfg.repeatWindowMs !== "number") cfg.repeatWindowMs = 120_000;
  if (typeof cfg.mentionThreshold !== "number") cfg.mentionThreshold = 5;
  if (typeof cfg.warnLimit !== "number") cfg.warnLimit = 1;
  if (typeof cfg.muteLimit !== "number") cfg.muteLimit = 2;
  if (typeof cfg.kickLimit !== "number") cfg.kickLimit = 3;
  if (typeof cfg.muteDurationMs !== "number") cfg.muteDurationMs = WRAP_DURATION_MS;
  if (typeof cfg.allowChannelLinks !== "boolean") cfg.allowChannelLinks = false;
  if (typeof cfg.allowCurrentGroupInvite !== "boolean") cfg.allowCurrentGroupInvite = true;
  if (typeof cfg.lastDisabledNoticeAt !== "number") cfg.lastDisabledNoticeAt = 0;
  if (!Array.isArray(cfg.trustedUsers)) cfg.trustedUsers = [];
  if (!cfg.members || typeof cfg.members !== "object") cfg.members = {};

  return cfg;
}

function ensureMemberState(cfg, jid) {
  if (!cfg.members[jid] || typeof cfg.members[jid] !== "object") {
    cfg.members[jid] = {
      strikes: 0,
      warns: 0,
      muteUntil: 0,
      lastReason: "",
      lastAction: "",
      lastAt: 0,
      recentMessages: [],
      recentNormalized: [],
    };
  }
  return cfg.members[jid];
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(URL_PATTERN, " ")
    .replace(/[^\p{L}\p{N}\s@]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDuration(ms) {
  const totalSec = Math.max(1, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  if (minutes <= 0) return `${seconds}s`;
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

function mentionCount(m) {
  const direct = Array.isArray(m.mentionedJid) ? m.mentionedJid.length : 0;
  const textCount = (m.text || "").match(/@\d{5,16}/g)?.length || 0;
  return Math.max(direct, textCount);
}

function hasPattern(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function collectInviteLinks(text) {
  return [...String(text || "").matchAll(GROUP_INVITE_PATTERN)].map((match) => match[1]);
}

async function isTrustedInvite(conn, chatId, text, cfg) {
  const inviteCodes = collectInviteLinks(text);
  const hasChannel = CHANNEL_PATTERN.test(text);
  CHANNEL_PATTERN.lastIndex = 0;

  if (hasChannel && !cfg.allowChannelLinks) return false;
  if (!inviteCodes.length) return !hasChannel;

  if (!cfg.allowCurrentGroupInvite) return false;

  try {
    const currentCode = await conn.groupInviteCode(chatId);
    return inviteCodes.every((code) => code === currentCode);
  } catch {
    return false;
  }
}

function pruneMessages(state, now, cfg) {
  state.recentMessages = state.recentMessages.filter((item) => now - item.at <= cfg.floodWindowMs);
  state.recentNormalized = state.recentNormalized.filter((item) => now - item.at <= cfg.repeatWindowMs);
}

function pushMessageState(state, normalized, now) {
  state.recentMessages.push({ at: now });
  if (normalized) {
    state.recentNormalized.push({ text: normalized, at: now });
  }
}

function getRepeatCount(state, normalized) {
  if (!normalized) return 0;
  return state.recentNormalized.filter((item) => item.text === normalized).length;
}

function resolveViolation(text, normalized, m, state, cfg) {
  if (!text) return null;

  if (state.recentMessages.length >= cfg.floodThreshold) {
    return { type: "flood", detail: `sent ${state.recentMessages.length} messages too quickly` };
  }

  const repeats = getRepeatCount(state, normalized);
  if (repeats >= cfg.repeatThreshold) {
    return { type: "repeat", detail: `repeated the same message ${repeats} times` };
  }

  const mentions = mentionCount(m);
  if (mentions >= cfg.mentionThreshold) {
    return { type: "mention-spam", detail: `mentioned ${mentions} users` };
  }

  if (hasPattern(text, NSFW_PATTERNS)) {
    return { type: "nsfw", detail: "used NSFW phrases" };
  }

  if (hasPattern(text, SCAM_PATTERNS)) {
    return { type: "scam", detail: "used scam keywords" };
  }

  if (GROUP_INVITE_PATTERN.test(text) || CHANNEL_PATTERN.test(text)) {
    GROUP_INVITE_PATTERN.lastIndex = 0;
    CHANNEL_PATTERN.lastIndex = 0;
    return { type: "invite-link", detail: "posted an invite or channel link" };
  }

  GROUP_INVITE_PATTERN.lastIndex = 0;
  CHANNEL_PATTERN.lastIndex = 0;
  return null;
}

function getActionForStrikes(strikes, cfg) {
  if (strikes >= cfg.kickLimit) return "kick";
  if (strikes >= cfg.muteLimit) return "mute";
  return "warn";
}

async function deleteMessage(conn, m) {
  try {
    await conn.sendMessage(m.chat, { delete: m.key });
  } catch {}
}

async function punish(conn, m, cfg, state, violation, canKick, canDelete) {
  state.strikes += 1;
  state.lastReason = violation.type;
  state.lastAt = Date.now();

  const action = getActionForStrikes(state.strikes, cfg);
  state.lastAction = action;

  if (canDelete) {
    await deleteMessage(conn, m);
  }

  if (action === "warn") {
    state.warns += 1;
    await conn.sendMessage(
      m.chat,
      {
        text: `⚠️ @${m.sender.split("@")[0]} warned for *${violation.type}*.\nReason: ${violation.detail}\nProgress: ${state.strikes}/${cfg.kickLimit}`,
        mentions: [m.sender],
      },
      { quoted: m }
    );
    return true;
  }

  if (action === "mute") {
    state.muteUntil = Date.now() + cfg.muteDurationMs;
    await conn.sendMessage(
      m.chat,
      {
        text: `🔇 @${m.sender.split("@")[0]} muted for *${violation.type}*.\nDuration: ${formatDuration(cfg.muteDurationMs)}\nReason: ${violation.detail}`,
        mentions: [m.sender],
      },
      { quoted: m }
    );
    return true;
  }

  if (canKick) {
    await conn.sendMessage(
      m.chat,
      {
        text: `🚫 @${m.sender.split("@")[0]} removed for repeated moderation violations.\nLast reason: ${violation.type}`,
        mentions: [m.sender],
      },
      { quoted: m }
    );
    await conn.groupParticipantsUpdate(m.chat, [m.sender], "remove").catch(() => {});
    delete cfg.members[m.sender];
    return true;
  }

  state.muteUntil = Date.now() + cfg.muteDurationMs;
  await conn.sendMessage(
    m.chat,
    {
      text: `🚫 Kick threshold reached for @${m.sender.split("@")[0]}, but the bot is not admin.\nFallback action: mute for ${formatDuration(cfg.muteDurationMs)}.`,
      mentions: [m.sender],
    },
    { quoted: m }
  );
  return true;
}

function formatStatus(chat) {
  const cfg = ensureAutomod(chat);
  const muted = Object.entries(cfg.members).filter(([, state]) => state.muteUntil > Date.now()).length;
  const trusted = cfg.trustedUsers.length;

  return [
    "*AutoMod*",
    "",
    `Enabled: ${cfg.enabled ? "Yes" : "No"}`,
    !cfg.enabled ? "Security protection is currently disabled in this group." : null,
    `Flood threshold: ${cfg.floodThreshold} msgs / ${Math.round(cfg.floodWindowMs / 1000)}s`,
    `Repeat threshold: ${cfg.repeatThreshold}`,
    `Mention threshold: ${cfg.mentionThreshold}`,
    `Escalation: warn(${cfg.warnLimit}) -> mute(${cfg.muteLimit}) -> kick(${cfg.kickLimit})`,
    `Mute duration: ${formatDuration(cfg.muteDurationMs)}`,
    `Allow current group invite: ${cfg.allowCurrentGroupInvite ? "Yes" : "No"}`,
    `Allow channel links: ${cfg.allowChannelLinks ? "Yes" : "No"}`,
    `Trusted users: ${trusted}`,
    `Currently muted: ${muted}`,
    "",
    "Commands:",
    ".automod on/off",
    ".automod status",
    ".automod trust add @user",
    ".automod trust remove @user",
    ".automod threshold flood 6",
    ".automod threshold repeat 3",
    ".automod threshold mention 5",
    ".automod escalate mute 2",
    ".automod escalate kick 3",
    ".automod duration 10m",
    ".automod invites group on/off",
    ".automod invites channel on/off",
    ".automod reset @user",
  ]
    .filter(Boolean)
    .join("\n");
}

async function maybeNotifyDisabled(conn, m, cfg, isAdmin, isOwner) {
  if (cfg.enabled) return false;
  if (!(isAdmin || isOwner)) return false;
  if (!m.text || m.isBaileys) return false;

  const now = Date.now();
  if (now - (cfg.lastDisabledNoticeAt || 0) < DISABLED_NOTICE_INTERVAL_MS) {
    return false;
  }

  cfg.lastDisabledNoticeAt = now;

  await conn.sendMessage(
    m.chat,
    {
      text: [
        "⚠️ Group security plugins are currently *disabled* here.",
        "",
        "AutoMod is optional and disabled by default.",
        "Enable it with:",
        "`.automod on`",
        "",
        "Check current settings with:",
        "`.automod status`",
      ].join("\n"),
    },
    { quoted: m }
  );

  return false;
}

function parseDuration(input) {
  const value = String(input || "").trim().toLowerCase();
  const match = value.match(/^(\d+)(s|m|h|d)?$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2] || "m";
  const mult = unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return amount * mult;
}

function resolveTarget(m) {
  if (m.mentionedJid?.[0]) return m.mentionedJid[0];
  if (m.quoted?.sender) return m.quoted.sender;
  return null;
}

let handler = async (m, { conn, args, isAdmin, isOwner }) => {
  if (!m.isGroup) throw "Group only.";
  if (!(isAdmin || isOwner)) throw "Admin only.";

  const chat = global.db.data.chats[m.chat];
  const cfg = ensureAutomod(chat);
  const sub = (args[0] || "status").toLowerCase();

  switch (sub) {
    case "on":
    case "enable":
      cfg.enabled = true;
      return m.reply("AutoMod enabled.");
    case "off":
    case "disable":
      cfg.enabled = false;
      return m.reply("AutoMod disabled.");
    case "status":
      return m.reply(formatStatus(chat));
    case "trust": {
      const action = (args[1] || "").toLowerCase();
      const target = resolveTarget(m);
      if (!target) throw "Mention or reply to a user.";
      if (action === "add") {
        if (!cfg.trustedUsers.includes(target)) cfg.trustedUsers.push(target);
        await conn.sendMessage(
          m.chat,
          { text: `Trusted user added: @${target.split("@")[0]}`, mentions: [target] },
          { quoted: m }
        );
        return;
      }
      if (action === "remove") {
        cfg.trustedUsers = cfg.trustedUsers.filter((jid) => jid !== target);
        await conn.sendMessage(
          m.chat,
          { text: `Trusted user removed: @${target.split("@")[0]}`, mentions: [target] },
          { quoted: m }
        );
        return;
      }
      throw "Use `.automod trust add @user` or `.automod trust remove @user`.";
    }
    case "threshold": {
      const type = (args[1] || "").toLowerCase();
      const value = Number(args[2]);
      if (!Number.isFinite(value) || value < 1) throw "Threshold must be a number >= 1.";
      if (type === "flood") cfg.floodThreshold = value;
      else if (type === "repeat") cfg.repeatThreshold = value;
      else if (type === "mention") cfg.mentionThreshold = value;
      else throw "Use threshold type: flood, repeat, mention.";
      return m.reply(`Updated ${type} threshold to ${value}.`);
    }
    case "duration": {
      const parsed = parseDuration(args[1]);
      if (!parsed) throw "Use `.automod duration 10m` or `30s` or `1h`.";
      cfg.muteDurationMs = parsed;
      return m.reply(`Mute duration set to ${formatDuration(parsed)}.`);
    }
    case "escalate":
    case "escalation": {
      const level = (args[1] || "").toLowerCase();
      const value = Number(args[2]);
      if (!Number.isFinite(value) || value < 1) throw "Escalation value must be a number >= 1.";
      if (level === "mute") {
        cfg.muteLimit = value;
        if (cfg.kickLimit < cfg.muteLimit) cfg.kickLimit = cfg.muteLimit + 1;
        return m.reply(`Mute threshold set to ${cfg.muteLimit}.`);
      }
      if (level === "kick") {
        if (value <= cfg.muteLimit) throw "Kick threshold must be higher than mute threshold.";
        cfg.kickLimit = value;
        return m.reply(`Kick threshold set to ${cfg.kickLimit}.`);
      }
      throw "Use `.automod escalate mute 2` or `.automod escalate kick 3`.";
    }
    case "invites": {
      const type = (args[1] || "").toLowerCase();
      const on = /^(on|enable|true|1)$/i.test(args[2] || "");
      if (type === "group") {
        cfg.allowCurrentGroupInvite = on;
        return m.reply(`Current-group invite trust set to ${on ? "on" : "off"}.`);
      }
      if (type === "channel") {
        cfg.allowChannelLinks = on;
        return m.reply(`Channel-link trust set to ${on ? "on" : "off"}.`);
      }
      throw "Use `.automod invites group on/off` or `.automod invites channel on/off`.";
    }
    case "reset": {
      const target = resolveTarget(m);
      if (!target) throw "Mention or reply to a user.";
      delete cfg.members[target];
      await conn.sendMessage(
        m.chat,
        { text: `Moderation state reset for @${target.split("@")[0]}`, mentions: [target] },
        { quoted: m }
      );
      return;
    }
    default:
      return m.reply(formatStatus(chat));
  }
};

handler.before = async function (m, { conn, isAdmin, isOwner, isBotAdmin }) {
  if (!m.isGroup || !m.message) return false;

  const chat = global.db.data.chats[m.chat] || {};
  const cfg = ensureAutomod(chat);
  if (!cfg.enabled) {
    await maybeNotifyDisabled(conn, m, cfg, isAdmin, isOwner);
    return false;
  }

  if (m.isBaileys || m.fromMe || m.sender === conn.user.jid) return false;
  if (isAdmin || isOwner || cfg.trustedUsers.includes(m.sender)) return false;

  const text = String(m.text || "").trim();
  const now = Date.now();
  const state = ensureMemberState(cfg, m.sender);

  if (state.muteUntil > now) {
    await deleteMessage(conn, m);
    return true;
  }

  pruneMessages(state, now, cfg);
  const normalized = normalizeText(text);
  pushMessageState(state, normalized, now);

  const violation = resolveViolation(text, normalized, m, state, cfg);
  if (!violation) return false;

  if (violation.type === "invite-link") {
    const trusted = await isTrustedInvite(conn, m.chat, text, cfg);
    if (trusted) return false;
  }

  await punish(conn, m, cfg, state, violation, Boolean(isBotAdmin), Boolean(isBotAdmin));
  return true;
};

handler.help = [
  "automod",
  "automod on",
  "automod off",
  "automod status",
  "automod trust add @user",
  "automod trust remove @user",
  "automod threshold flood 6",
  "automod threshold repeat 3",
  "automod threshold mention 5",
  "automod escalate mute 2",
  "automod escalate kick 3",
  "automod duration 10m",
  "automod invites group on",
  "automod invites channel off",
  "automod reset @user",
];
handler.tags = ["admin"];
handler.command = /^(automod)$/i;
handler.group = true;

export default handler;
