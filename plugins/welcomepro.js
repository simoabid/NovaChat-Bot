import { WAMessageStubType } from "@adiwajshing/baileys";
import fetch from "node-fetch";

const DEFAULT_BACKGROUND = "https://picsur.ovh/i/c0948522-2092-4dc6-91fb-8644072e922f.jpg";
const DEFAULT_RULES = [
  "Respect all members.",
  "No spam or harmful links.",
  "Use the bot responsibly.",
];
const DEFAULT_INTRO_TEMPLATE = "Name | Age | Country | Role";
const ONBOARDING_COMMANDS = new Set([
  "welcomepro",
  "intro",
  "rulesok",
  "ackrules",
  "onboardstatus",
]);

function ensureWelcomePro(chat) {
  if (!chat.welcomePro || typeof chat.welcomePro !== "object") {
    chat.welcomePro = {};
  }

  const config = chat.welcomePro;

  if (typeof config.enabled !== "boolean") config.enabled = false;
  if (typeof config.cardEnabled !== "boolean") config.cardEnabled = true;
  if (typeof config.verificationGate !== "boolean") config.verificationGate = true;
  if (typeof config.autoRoleTag !== "string") config.autoRoleTag = "New Member";
  if (typeof config.welcomeTitle !== "string") config.welcomeTitle = "Welcome, @user";
  if (typeof config.welcomeBody !== "string") {
    config.welcomeBody =
      "Complete onboarding to unlock the full group experience in @subject.";
  }
  if (typeof config.rulesText !== "string") config.rulesText = DEFAULT_RULES.join("\n");
  if (typeof config.introTemplate !== "string") config.introTemplate = DEFAULT_INTRO_TEMPLATE;
  if (typeof config.cardBackground !== "string") config.cardBackground = DEFAULT_BACKGROUND;
  if (!config.pending || typeof config.pending !== "object") config.pending = {};

  return config;
}

function formatDate(ts) {
  if (!ts || ts <= 0) return "-";
  return new Date(ts).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function replaceVars(text, data) {
  return String(text || "")
    .replace(/@user/g, data.userMention)
    .replace(/@subject/g, data.subject)
    .replace(/@rules/g, data.rules)
    .replace(/@intro/g, data.introTemplate)
    .replace(/@role/g, data.roleTag);
}

function buildPendingState(user) {
  return {
    joinedAt: Date.now(),
    rulesAck: false,
    introDone: false,
    verified: Boolean(user?.registered),
    introText: "",
    ackAt: 0,
    introAt: 0,
    completedAt: 0,
    lastReminderAt: 0,
  };
}

function onboardingProgress(state) {
  const done = [state.rulesAck, state.introDone, state.verified].filter(Boolean).length;
  return `${done}/3`;
}

function isRegisterCommand(text) {
  return /^[!./#@]?((daftar|verify|reg|register)\b)/i.test((text || "").trim());
}

async function renderCard(conn, userJid, subject, memberCount, background) {
  let avatar = "https://picsur.ovh/i/c0948522-2092-4dc6-91fb-8644072e922f.jpg";
  try {
    avatar = await conn.profilePictureUrl(userJid, "image");
  } catch {}

  const url =
    "https://api.siputzx.my.id/api/canvas/welcomev2" +
    `?username=${encodeURIComponent(userJid.split("@")[0])}` +
    `&guildName=${encodeURIComponent(subject)}` +
    `&memberCount=${memberCount}` +
    `&avatar=${encodeURIComponent(avatar)}` +
    `&background=${encodeURIComponent(background || DEFAULT_BACKGROUND)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to render welcome card");
  return res.buffer();
}

function getCompletionMessage(userJid, config, state, subject) {
  const roleLine = config.autoRoleTag ? `\n🏷️ Role tag: ${config.autoRoleTag}` : "";
  const introLine = state.introText ? `\n📝 Intro: ${state.introText}` : "";
  return [
    `✅ Onboarding completed for @${userJid.split("@")[0]}`,
    `🏠 Group: ${subject}`,
    `📅 Joined: ${formatDate(state.joinedAt)}`,
    roleLine,
    introLine,
  ]
    .join("\n")
    .replace(/\n\n+/g, "\n")
    .trim();
}

async function completeOnboarding(conn, m, state, config, userJid, subject) {
  state.completedAt = Date.now();

  const user = global.db.data.users[userJid] || {};
  if (config.autoRoleTag) user.title = config.autoRoleTag;
  global.db.data.users[userJid] = user;

  await conn.sendMessage(
    m.chat,
    {
      text: getCompletionMessage(userJid, config, state, subject),
      mentions: [userJid],
    },
    { quoted: m }
  );

  delete config.pending[userJid];
}

function getStatusText(userJid, subject, state, config, user) {
  const lines = [
    `*WelcomePro Status*`,
    "",
    `User: @${userJid.split("@")[0]}`,
    `Group: ${subject}`,
    `Progress: ${onboardingProgress(state)}`,
    `Rules acknowledged: ${state.rulesAck ? "Yes" : "No"}`,
    `Intro submitted: ${state.introDone ? "Yes" : "No"}`,
    `Verified: ${state.verified || user?.registered ? "Yes" : "No"}`,
    `Joined: ${formatDate(state.joinedAt)}`,
  ];

  if (state.introText) lines.push(`Intro: ${state.introText}`);
  if (config.autoRoleTag) lines.push(`Auto role tag: ${config.autoRoleTag}`);

  return lines.join("\n");
}

async function sendOnboardingCard(conn, m, userJid, groupMetadata, config) {
  const memberCount = groupMetadata?.participants?.length || 0;
  const subject = groupMetadata?.subject || "this group";
  const rulesBlock = config.rulesText
    .split("\n")
    .filter(Boolean)
    .map((line, index) => `${index + 1}. ${line}`)
    .join("\n");

  const data = {
    userMention: `@${userJid.split("@")[0]}`,
    subject,
    rules: rulesBlock,
    introTemplate: config.introTemplate,
    roleTag: config.autoRoleTag || "-",
  };

  const caption = [
    replaceVars(config.welcomeTitle, data),
    "",
    replaceVars(config.welcomeBody, data),
    "",
    "Rules:",
    rulesBlock || "-",
    "",
    "Onboarding steps:",
    "1. Send `.rulesok`",
    `2. Send \`.intro ${config.introTemplate}\``,
    "3. Complete registration with `.daftar Name.Age` or `@verify`",
    "",
    config.verificationGate
      ? "Verification gate is enabled. Finish onboarding before chatting normally."
      : "Verification gate is disabled.",
  ].join("\n");

  if (config.cardEnabled) {
    try {
      const image = await renderCard(conn, userJid, subject, memberCount, config.cardBackground);
      await conn.sendMessage(
        m.chat,
        { image, caption, mentions: [userJid] },
        { quoted: m }
      );
      return;
    } catch (error) {
      console.error(error);
    }
  }

  await conn.sendMessage(
    m.chat,
    { text: caption, mentions: [userJid] },
    { quoted: m }
  );
}

async function handleConfigCommand(m, command, args, chat, groupMetadata) {
  const config = ensureWelcomePro(chat);
  const sub = (args[0] || "status").toLowerCase();
  const value = args.slice(1).join(" ").trim();

  switch (sub) {
    case "on":
    case "enable":
      config.enabled = true;
      return m.reply("WelcomePro enabled for this group.");
    case "off":
    case "disable":
      config.enabled = false;
      return m.reply("WelcomePro disabled for this group.");
    case "status": {
      const pendingCount = Object.keys(config.pending).length;
      const text = [
        "*WelcomePro Config*",
        "",
        `Group: ${groupMetadata?.subject || m.chat}`,
        `Enabled: ${config.enabled ? "Yes" : "No"}`,
        `Welcome card: ${config.cardEnabled ? "Yes" : "No"}`,
        `Verification gate: ${config.verificationGate ? "Yes" : "No"}`,
        `Auto role tag: ${config.autoRoleTag || "-"}`,
        `Intro template: ${config.introTemplate}`,
        `Pending onboardings: ${pendingCount}`,
        "",
        "Examples:",
        ".welcomepro on",
        ".welcomepro gate on",
        ".welcomepro role Verified Member",
        ".welcomepro title Welcome, @user",
        ".welcomepro body Please read the rules and finish onboarding in @subject",
        ".welcomepro rules Respect everyone | No spam | No scams",
        ".welcomepro intro Name | Age | Country | Role",
        ".welcomepro bg https://example.com/bg.jpg",
      ].join("\n");
      return m.reply(text);
    }
    case "gate":
      if (!args[1]) return m.reply("Usage: .welcomepro gate on/off");
      config.verificationGate = /^(on|enable|true|1)$/i.test(args[1]);
      return m.reply(`Verification gate ${config.verificationGate ? "enabled" : "disabled"}.`);
    case "card":
      if (!args[1]) return m.reply("Usage: .welcomepro card on/off");
      config.cardEnabled = /^(on|enable|true|1)$/i.test(args[1]);
      return m.reply(`Welcome card ${config.cardEnabled ? "enabled" : "disabled"}.`);
    case "role":
      if (!value) return m.reply("Usage: .welcomepro role <tag text>");
      config.autoRoleTag = value;
      return m.reply(`Auto role tag set to: ${value}`);
    case "title":
      if (!value) return m.reply("Usage: .welcomepro title <text>");
      config.welcomeTitle = value;
      return m.reply("Welcome title updated.");
    case "body":
      if (!value) return m.reply("Usage: .welcomepro body <text>");
      config.welcomeBody = value;
      return m.reply("Welcome body updated.");
    case "rules":
      if (!value) return m.reply("Usage: .welcomepro rules rule 1 | rule 2 | rule 3");
      config.rulesText = value
        .split("|")
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n");
      return m.reply("Rules acknowledgement text updated.");
    case "intro":
      if (!value) return m.reply("Usage: .welcomepro intro Name | Age | Country | Role");
      config.introTemplate = value;
      return m.reply("Forced intro template updated.");
    case "bg":
    case "background":
      if (!value) return m.reply("Usage: .welcomepro bg <image url>");
      config.cardBackground = value;
      return m.reply("Welcome card background updated.");
    case "reset":
      chat.welcomePro = undefined;
      ensureWelcomePro(chat);
      return m.reply("WelcomePro config reset to defaults.");
    default:
      return m.reply("Unknown subcommand. Use `.welcomepro status`.");
  }
}

async function handleMemberAction(conn, m, command, text, chat, groupMetadata) {
  const config = ensureWelcomePro(chat);
  if (!config.enabled) return false;

  const state = config.pending[m.sender];
  if (!state) {
    if (command === "onboardstatus") {
      return m.reply("You do not have a pending onboarding flow in this group.");
    }
    return false;
  }

  const user = global.db.data.users[m.sender] || {};
  if (user.registered) state.verified = true;

  if (command === "rulesok" || command === "ackrules") {
    state.rulesAck = true;
    state.ackAt = Date.now();
    await m.reply("Rules acknowledged. Next step: send your intro with `.intro ...`.");
  } else if (command === "intro") {
    if (!text) {
      return m.reply(`Use the intro template:\n.intro ${config.introTemplate}`);
    }
    state.introDone = true;
    state.introAt = Date.now();
    state.introText = text.trim();
    await m.reply("Intro saved. Final step: complete verification with `.daftar Name.Age` or `@verify`.");
  } else if (command === "onboardstatus") {
      return conn.sendMessage(
      m.chat,
      {
        text: getStatusText(m.sender, groupMetadata?.subject || m.chat, state, config, user),
        mentions: [m.sender],
      },
      { quoted: m }
    );
  } else {
    return false;
  }

  if (user.registered) state.verified = true;

  if (state.rulesAck && state.introDone && state.verified) {
    await completeOnboarding(conn, m, state, config, m.sender, groupMetadata?.subject || m.chat);
  } else {
    await conn.sendMessage(
      m.chat,
      {
        text: getStatusText(m.sender, groupMetadata?.subject || m.chat, state, config, user),
        mentions: [m.sender],
      },
      { quoted: m }
    );
  }

  return true;
}

let handler = async (m, { conn, command, args, text, isAdmin, isOwner, groupMetadata }) => {
  if (!m.isGroup) throw "This feature is only for groups.";

  const chat = global.db.data.chats[m.chat];

  if (command === "welcomepro") {
    if (!(isAdmin || isOwner)) throw "Admin only.";
    return handleConfigCommand(m, command, args, chat, groupMetadata);
  }

  await handleMemberAction(conn, m, command, text, chat, groupMetadata);
};

handler.before = async function (m, { isAdmin, isOwner, isBotAdmin, groupMetadata, conn }) {
  if (!m.isGroup) return false;

  const chat = global.db.data.chats[m.chat] || {};
  const config = ensureWelcomePro(chat);

  if (m.messageStubType) {
    const userJid = Array.isArray(m.messageStubParameters) ? m.messageStubParameters[0] : null;

    if (
      config.enabled &&
      userJid &&
      (
        m.messageStubType === WAMessageStubType.GROUP_PARTICIPANT_ADD ||
        m.messageStubType === WAMessageStubType.GROUP_PARTICIPANT_INVITE
      )
    ) {
      const user = global.db.data.users[userJid] || {};
      config.pending[userJid] = buildPendingState(user);
      await sendOnboardingCard(conn, m, userJid, groupMetadata, config);
      return false;
    }

    if (
      userJid &&
      (
        m.messageStubType === WAMessageStubType.GROUP_PARTICIPANT_REMOVE ||
        m.messageStubType === WAMessageStubType.GROUP_PARTICIPANT_LEAVE
      )
    ) {
      delete config.pending[userJid];
      return false;
    }
  }

  if (!config.enabled) return false;

  const state = config.pending[m.sender];
  if (!state) return false;

  const user = global.db.data.users[m.sender] || {};
  if (user.registered) state.verified = true;

  if (state.rulesAck && state.introDone && state.verified) {
    await completeOnboarding(conn, m, state, config, m.sender, groupMetadata?.subject || m.chat);
    return false;
  }

  if (isAdmin || isOwner) return false;

  const text = (m.text || "").trim();
  if (!text) return false;

  const firstWord = text.replace(/^[!./#@]+/, "").split(/\s+/)[0]?.toLowerCase() || "";
  const isAllowed = ONBOARDING_COMMANDS.has(firstWord) || isRegisterCommand(text);

  if (!isAllowed && config.verificationGate) {
    if (isBotAdmin) {
      await this.sendMessage(m.chat, { delete: m.key }).catch(() => {});
    }

    const now = Date.now();
    if (now - (state.lastReminderAt || 0) > 5000) {
      state.lastReminderAt = now;
      await this.sendMessage(
        m.chat,
        {
          text: [
            `@${m.sender.split("@")[0]} complete onboarding first.`,
            "",
            "Required:",
            "• `.rulesok`",
            `• \`.intro ${config.introTemplate}\``,
            "• `.daftar Name.Age` or `@verify`",
            "",
            `Progress: ${onboardingProgress(state)}`,
          ].join("\n"),
          mentions: [m.sender],
        },
        { quoted: m }
      );
    }
  }

  return false;
};

handler.help = [
  "welcomepro",
  "welcomepro on",
  "welcomepro gate on",
  "welcomepro role <tag>",
  "welcomepro rules <r1 | r2 | r3>",
  "welcomepro intro <template>",
  "intro <text>",
  "rulesok",
  "onboardstatus",
];
handler.tags = ["admin"];
handler.command = /^(welcomepro|intro|rulesok|ackrules|onboardstatus)$/i;
handler.group = true;

export default handler;
