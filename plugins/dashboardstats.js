function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value) || 0);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "0.0%";
  return `${value.toFixed(1)}%`;
}

function formatDate(value) {
  if (!value || value <= 0) return "-";
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isRecent(timestamp, windowMs) {
  return Number.isFinite(timestamp) && timestamp > 0 && Date.now() - timestamp <= windowMs;
}

function getPluginLabel(filename) {
  const plugin = global.plugins?.[filename];
  if (!plugin) return filename.replace(/\.js$/i, "");
  if (Array.isArray(plugin.help) && plugin.help[0]) return String(plugin.help[0]);
  if (typeof plugin.help === "string" && plugin.help) return plugin.help;
  return filename.replace(/\.js$/i, "");
}

function getStatsEntries(stats) {
  return Object.entries(stats || {}).map(([pluginFile, stat]) => {
    const total = Number(stat?.total) || 0;
    const success = Number(stat?.success) || 0;
    const failed = Math.max(0, total - success);
    const successRate = total ? (success / total) * 100 : 0;
    return {
      pluginFile,
      label: getPluginLabel(pluginFile),
      total,
      success,
      failed,
      successRate,
      last: Number(stat?.last) || 0,
      lastSuccess: Number(stat?.lastSuccess) || 0,
    };
  });
}

function getUsersMap() {
  return global.db?.data?.users || {};
}

function getChatsMap() {
  return global.db?.data?.chats || {};
}

function getPremiumCommandCount() {
  return Object.values(global.plugins || {}).filter(
    (plugin) => typeof plugin === "function" && plugin.premium === true
  ).length;
}

function buildOverview() {
  const users = Object.entries(getUsersMap()).map(([jid, user]) => ({ jid, ...(user || {}) }));
  const groups = Object.entries(getChatsMap())
    .filter(([jid]) => jid.endsWith("@g.us"))
    .map(([jid, chat]) => ({ jid, ...(chat || {}) }));
  const statEntries = getStatsEntries(global.db?.data?.stats);
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const weekMs = 7 * dayMs;
  const monthMs = 30 * dayMs;

  const topCommands = [...statEntries]
    .sort((a, b) => b.total - a.total || b.success - a.success)
    .slice(0, 5);

  const failedCommands = [...statEntries]
    .filter((entry) => entry.failed > 0)
    .sort((a, b) => b.failed - a.failed || b.total - a.total)
    .slice(0, 5);

  const activeGroups7d = groups.filter((group) => isRecent(Number(group.delay) || 0, weekMs));
  const activeUsers7d = users.filter((user) => isRecent(Number(user.delay) || 0, weekMs));
  const premiumUsers = users.filter((user) => user.premium === true);
  const activePremiumUsers7d = premiumUsers.filter((user) =>
    isRecent(Number(user.delay) || 0, weekMs)
  );
  const registeredUsers = users.filter((user) => user.registered === true);
  const retainedUsers = registeredUsers.filter((user) => {
    const regTime = Number(user.regTime) || 0;
    const delay = Number(user.delay) || 0;
    return regTime > 0 && now - regTime >= weekMs && isRecent(delay, weekMs);
  });

  const totals = statEntries.reduce(
    (acc, entry) => {
      acc.total += entry.total;
      acc.success += entry.success;
      acc.failed += entry.failed;
      return acc;
    },
    { total: 0, success: 0, failed: 0 }
  );

  let text = `*Dashboard Stats*\n\n`;
  text += `• Commands run: ${formatNumber(totals.total)}\n`;
  text += `• Successful: ${formatNumber(totals.success)}\n`;
  text += `• Failed: ${formatNumber(totals.failed)}\n`;
  text += `• Command success rate: ${formatPercent(
    totals.total ? (totals.success / totals.total) * 100 : 0
  )}\n\n`;

  text += `• Users tracked: ${formatNumber(users.length)}\n`;
  text += `• Registered users: ${formatNumber(registeredUsers.length)}\n`;
  text += `• Active users 7d: ${formatNumber(activeUsers7d.length)}\n`;
  text += `• Groups tracked: ${formatNumber(groups.length)}\n`;
  text += `• Active groups 7d: ${formatNumber(activeGroups7d.length)}\n\n`;

  text += `• Premium users: ${formatNumber(premiumUsers.length)}\n`;
  text += `• Premium active 7d: ${formatNumber(activePremiumUsers7d.length)}\n`;
  text += `• Premium share: ${formatPercent(
    users.length ? (premiumUsers.length / users.length) * 100 : 0
  )}\n`;
  text += `• Premium-only commands: ${formatNumber(getPremiumCommandCount())}\n\n`;

  text += `• Retention 7d: ${formatPercent(
    registeredUsers.length ? (retainedUsers.length / registeredUsers.length) * 100 : 0
  )}\n`;
  text += `• Active users 24h: ${formatNumber(
    users.filter((user) => isRecent(Number(user.delay) || 0, dayMs)).length
  )}\n`;
  text += `• Active users 30d: ${formatNumber(
    users.filter((user) => isRecent(Number(user.delay) || 0, monthMs)).length
  )}\n\n`;

  text += `*Top Commands*\n`;
  text += topCommands.length
    ? topCommands
        .map(
          (entry, index) =>
            `${index + 1}. ${entry.label} | ${formatNumber(entry.total)} runs`
        )
        .join("\n")
    : "No command data yet.";

  text += `\n\n*Failed Commands*\n`;
  text += failedCommands.length
    ? failedCommands
        .map(
          (entry, index) =>
            `${index + 1}. ${entry.label} | ${formatNumber(entry.failed)} failed`
        )
        .join("\n")
    : "No failed command data yet.";

  return text.trim();
}

function buildCommandsView() {
  const entries = getStatsEntries(global.db?.data?.stats).sort(
    (a, b) => b.total - a.total || b.failed - a.failed
  );

  if (!entries.length) return "*Dashboard Stats: Commands*\n\nNo command analytics data yet.";

  let text = `*Dashboard Stats: Commands*\n\n`;
  text += entries
    .slice(0, 15)
    .map((entry, index) => {
      return [
        `${index + 1}. ${entry.label}`,
        `Runs: ${formatNumber(entry.total)} | Failed: ${formatNumber(entry.failed)} | Success: ${formatPercent(entry.successRate)}`,
        `Last run: ${formatDate(entry.last)}`,
      ].join("\n");
    })
    .join("\n\n");

  return text.trim();
}

function buildGroupsView() {
  const groups = Object.entries(getChatsMap())
    .filter(([jid]) => jid.endsWith("@g.us"))
    .map(([jid, chat]) => ({ jid, ...(chat || {}) }))
    .sort((a, b) => (Number(b.delay) || 0) - (Number(a.delay) || 0));

  if (!groups.length) return "*Dashboard Stats: Groups*\n\nNo group analytics data yet.";

  const dayMs = 24 * 60 * 60 * 1000;
  const weekMs = 7 * dayMs;
  const active24h = groups.filter((group) => isRecent(Number(group.delay) || 0, dayMs)).length;
  const active7d = groups.filter((group) => isRecent(Number(group.delay) || 0, weekMs)).length;
  const welcomeEnabled = groups.filter((group) => group.welcome === true).length;
  const antiLinkEnabled = groups.filter((group) => group.antiLink === true).length;

  let text = `*Dashboard Stats: Groups*\n\n`;
  text += `• Total groups: ${formatNumber(groups.length)}\n`;
  text += `• Active 24h: ${formatNumber(active24h)}\n`;
  text += `• Active 7d: ${formatNumber(active7d)}\n`;
  text += `• Welcome enabled: ${formatNumber(welcomeEnabled)}\n`;
  text += `• Anti-link enabled: ${formatNumber(antiLinkEnabled)}\n\n`;

  text += `*Most Active Groups*\n`;
  text += groups
    .slice(0, 12)
    .map((group, index) => {
      const flags = [];
      if (group.welcome) flags.push("welcome");
      if (group.antiLink) flags.push("antilink");
      if (group.isBanned) flags.push("banned");
      const label = flags.length ? ` | ${flags.join(", ")}` : "";
      return `${index + 1}. ${group.jid}\nLast active: ${formatDate(Number(group.delay) || 0)}${label}`;
    })
    .join("\n\n");

  return text.trim();
}

function buildUsersView() {
  const users = Object.entries(getUsersMap())
    .map(([jid, user]) => ({ jid, ...(user || {}) }))
    .sort((a, b) => (Number(b.delay) || 0) - (Number(a.delay) || 0));

  if (!users.length) return "*Dashboard Stats: Users*\n\nNo user analytics data yet.";

  const dayMs = 24 * 60 * 60 * 1000;
  const weekMs = 7 * dayMs;
  const monthMs = 30 * dayMs;

  const registeredUsers = users.filter((user) => user.registered === true);
  const premiumUsers = users.filter((user) => user.premium === true);
  const active24h = users.filter((user) => isRecent(Number(user.delay) || 0, dayMs)).length;
  const active7d = users.filter((user) => isRecent(Number(user.delay) || 0, weekMs)).length;
  const active30d = users.filter((user) => isRecent(Number(user.delay) || 0, monthMs)).length;

  let text = `*Dashboard Stats: Users*\n\n`;
  text += `• Total users: ${formatNumber(users.length)}\n`;
  text += `• Registered: ${formatNumber(registeredUsers.length)}\n`;
  text += `• Premium: ${formatNumber(premiumUsers.length)}\n`;
  text += `• Active 24h: ${formatNumber(active24h)}\n`;
  text += `• Active 7d: ${formatNumber(active7d)}\n`;
  text += `• Active 30d: ${formatNumber(active30d)}\n\n`;

  text += `*Most Active Users*\n`;
  text += users
    .slice(0, 12)
    .map((user, index) => {
      const flags = [];
      if (user.premium) flags.push("premium");
      if (user.registered) flags.push("registered");
      if (user.banned) flags.push("banned");
      const label = flags.length ? ` | ${flags.join(", ")}` : "";
      return `${index + 1}. ${user.name || user.jid}\n${user.jid}\nLast active: ${formatDate(Number(user.delay) || 0)}${label}`;
    })
    .join("\n\n");

  return text.trim();
}

let handler = async (m, { args }) => {
  const section = (args[0] || "").toLowerCase();

  let response;
  switch (section) {
    case "":
      response = buildOverview();
      break;
    case "commands":
    case "command":
      response = buildCommandsView();
      break;
    case "groups":
    case "group":
      response = buildGroupsView();
      break;
    case "users":
    case "user":
      response = buildUsersView();
      break;
    default:
      response = [
        "*Dashboard Stats*",
        "",
        "Usage:",
        ".stats",
        ".stats commands",
        ".stats groups",
        ".stats users",
      ].join("\n");
  }

  await m.reply(response);
};

handler.help = ["stats", "stats commands", "stats groups", "stats users"];
handler.tags = ["owner"];
handler.command = /^stats$/i;
handler.rowner = true;

export default handler;
