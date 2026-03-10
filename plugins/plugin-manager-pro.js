import fs from "fs";
import path from "path";
import syntaxerror from "syntax-error";
import { createRequire, builtinModules } from "module";

const require = createRequire(import.meta.url);
const PLUGIN_DIR = path.resolve("./plugins");
const SELF_FILE = "plugin-manager-pro.js";
const WRAP_MARK = Symbol.for("novachat.pluginManagerPro.wrapped");
const originalMainMap = new Map();

function ensureManagerConfig(chat) {
  if (!chat.pluginManagerPro || typeof chat.pluginManagerPro !== "object") {
    chat.pluginManagerPro = {};
  }
  const cfg = chat.pluginManagerPro;
  if (!Array.isArray(cfg.disabledPlugins)) cfg.disabledPlugins = [];
  return cfg;
}

function getPluginFiles() {
  return fs.readdirSync(PLUGIN_DIR).filter((file) => file.endsWith(".js")).sort();
}

function normalizePluginName(input) {
  if (!input) return null;
  const cleaned = input.trim().replace(/^plugins\//i, "");
  const wanted = cleaned.endsWith(".js") ? cleaned : `${cleaned}.js`;
  const files = getPluginFiles();
  if (files.includes(wanted)) return wanted;
  const found = files.find((file) => file.replace(/\.js$/i, "") === cleaned.replace(/\.js$/i, ""));
  return found || null;
}

function readPluginSource(file) {
  return fs.readFileSync(path.join(PLUGIN_DIR, file), "utf8");
}

function getPackageName(specifier) {
  if (!specifier || specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("file:")) {
    return null;
  }
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return scope && name ? `${scope}/${name}` : specifier;
  }
  return specifier.split("/")[0];
}

function parseSpecifiers(source) {
  const found = new Set();
  const patterns = [
    /import\s+[^'"]*?from\s+['"]([^'"]+)['"]/g,
    /import\s+['"]([^'"]+)['"]/g,
    /import\(\s*['"]([^'"]+)['"]\s*\)/g,
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const regex of patterns) {
    let match;
    while ((match = regex.exec(source))) {
      found.add(match[1]);
    }
  }

  return [...found];
}

function parseUrls(source) {
  const found = new Set();
  const regex = /https?:\/\/[^\s'"`]+/g;
  let match;
  while ((match = regex.exec(source))) {
    try {
      found.add(new URL(match[0]).host);
    } catch {}
  }
  return [...found].sort();
}

function resolveMissingDeps(specifiers) {
  const missing = [];
  const packages = [...new Set(specifiers.map(getPackageName).filter(Boolean))];

  for (const pkg of packages) {
    if (builtinModules.includes(pkg) || builtinModules.includes(pkg.replace(/^node:/, ""))) continue;
    try {
      require.resolve(pkg);
    } catch (error) {
      missing.push({ name: pkg, detail: error.code || error.message });
    }
  }

  return missing.sort((a, b) => a.name.localeCompare(b.name));
}

function detectRiskFlags(source) {
  const flags = [];
  if (/conn\.ev\.on\(/.test(source)) flags.push("event-listener");
  if (/setInterval\(|scheduleJob\(|cron\.schedule\(/.test(source)) flags.push("scheduler");
  if (/writeFileSync|unlinkSync|rmSync|rmdirSync/.test(source)) flags.push("fs-write");
  if (/exec\(|spawn\(/.test(source)) flags.push("process");
  return flags;
}

function serializeCommand(command) {
  if (command instanceof RegExp) return String(command);
  return String(command || "");
}

function getPluginCommandValues(plugin) {
  const command = plugin?.command;
  if (command == null) return [];
  const values = Array.isArray(command) ? command : [command];
  return values.map(serializeCommand).filter(Boolean);
}

function getCommandIndex() {
  const index = new Map();

  for (const [file, plugin] of Object.entries(global.plugins || {})) {
    for (const command of getPluginCommandValues(plugin)) {
      if (!index.has(command)) index.set(command, []);
      index.get(command).push(file);
    }
  }

  return index;
}

function getDuplicateCommands() {
  return [...getCommandIndex().entries()]
    .filter(([, files]) => files.length > 1)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

function getPluginMetadata(file) {
  const plugin = global.plugins?.[file];
  return {
    loaded: Boolean(plugin),
    type: typeof plugin,
    help: plugin?.help || [],
    tags: plugin?.tags || [],
    commandValues: getPluginCommandValues(plugin),
  };
}

function validatePlugin(file) {
  const source = readPluginSource(file);
  const syntax = syntaxerror(source, file, {
    sourceType: "module",
    allowAwaitOutsideFunction: true,
  });
  const specifiers = parseSpecifiers(source);
  const localImports = specifiers.filter((item) => item.startsWith(".") || item.startsWith("/"));
  const missingDeps = resolveMissingDeps(specifiers);
  const metadata = getPluginMetadata(file);
  const duplicates = getDuplicateCommands()
    .filter(([command, files]) => files.includes(file) && files.length > 1)
    .map(([command, files]) => ({ command, files }));

  return {
    file,
    syntaxOk: !syntax,
    syntaxError: syntax ? String(syntax) : "",
    metadata,
    localImports,
    packageImports: [...new Set(specifiers.map(getPackageName).filter(Boolean))].sort(),
    missingDeps,
    domains: parseUrls(source),
    risks: detectRiskFlags(source),
    duplicates,
  };
}

function formatValidationReport(result) {
  const lines = [
    `*Plugin Validate: ${result.file}*`,
    "",
    `Syntax: ${result.syntaxOk ? "OK" : "ERROR"}`,
    `Loaded: ${result.metadata.loaded ? "Yes" : "No"}`,
    `Type: ${result.metadata.type || "-"}`,
    `Commands: ${result.metadata.commandValues.length ? result.metadata.commandValues.join(", ") : "-"}`,
    `Tags: ${Array.isArray(result.metadata.tags) ? result.metadata.tags.join(", ") || "-" : String(result.metadata.tags || "-")}`,
    "",
    `Missing deps: ${result.missingDeps.length || 0}`,
    ...result.missingDeps.map((item) => `• ${item.name}: ${item.detail}`),
    "",
    `Duplicate commands: ${result.duplicates.length || 0}`,
    ...result.duplicates.map((item) => `• ${item.command} -> ${item.files.join(", ")}`),
    "",
    `Local imports: ${result.localImports.length ? result.localImports.join(", ") : "-"}`,
    `Package imports: ${result.packageImports.length ? result.packageImports.join(", ") : "-"}`,
    `External domains: ${result.domains.length ? result.domains.join(", ") : "-"}`,
    `Risk flags: ${result.risks.length ? result.risks.join(", ") : "-"}`,
  ];

  if (!result.syntaxOk) {
    lines.push("", "Syntax error:", result.syntaxError);
  }

  return lines.join("\n");
}

function formatDuplicateReport() {
  const duplicates = getDuplicateCommands();
  if (!duplicates.length) {
    return "*Plugin Manager Pro: Duplicates*\n\nNo duplicate command signatures detected.";
  }

  return [
    "*Plugin Manager Pro: Duplicates*",
    "",
    ...duplicates.map(([command, files], index) => `${index + 1}. ${command}\n${files.join(", ")}`),
  ].join("\n\n");
}

function formatDepsReport(file) {
  if (file) {
    const result = validatePlugin(file);
    return [
      `*Plugin Dependencies: ${file}*`,
      "",
      `Missing deps: ${result.missingDeps.length || 0}`,
      ...result.missingDeps.map((item) => `• ${item.name}: ${item.detail}`),
      "",
      `Package imports: ${result.packageImports.length ? result.packageImports.join(", ") : "-"}`,
      `Local imports: ${result.localImports.length ? result.localImports.join(", ") : "-"}`,
    ].join("\n");
  }

  const rows = getPluginFiles().map((pluginFile) => {
    const result = validatePlugin(pluginFile);
    return {
      file: pluginFile,
      missing: result.missingDeps,
    };
  });

  const withMissing = rows.filter((row) => row.missing.length > 0);
  if (!withMissing.length) {
    return "*Plugin Manager Pro: Missing Deps*\n\nNo missing package dependencies detected in plugin imports.";
  }

  return [
    "*Plugin Manager Pro: Missing Deps*",
    "",
    ...withMissing.map((row) => `${row.file}\n${row.missing.map((item) => `• ${item.name}`).join("\n")}`),
  ].join("\n\n");
}

function formatGraphReport(file) {
  const result = validatePlugin(file);
  const loadedBy = Object.entries(global.plugins || {})
    .filter(([otherFile]) => otherFile !== file)
    .filter(([otherFile]) => {
      const source = readPluginSource(otherFile);
      return parseSpecifiers(source).some((specifier) => {
        if (!specifier.startsWith(".")) return false;
        return specifier.includes(file.replace(/\.js$/i, ""));
      });
    })
    .map(([otherFile]) => otherFile);

  return [
    `*Plugin Graph: ${file}*`,
    "",
    `Commands: ${result.metadata.commandValues.length ? result.metadata.commandValues.join(", ") : "-"}`,
    `Tags: ${Array.isArray(result.metadata.tags) ? result.metadata.tags.join(", ") || "-" : String(result.metadata.tags || "-")}`,
    "",
    "Dependencies:",
    `• Local: ${result.localImports.length ? result.localImports.join(", ") : "-"}`,
    `• Packages: ${result.packageImports.length ? result.packageImports.join(", ") : "-"}`,
    `• Domains: ${result.domains.length ? result.domains.join(", ") : "-"}`,
    "",
    `Reverse local dependents: ${loadedBy.length ? loadedBy.join(", ") : "-"}`,
  ].join("\n");
}

function isDisabledForChat(file, chatId) {
  if (!chatId || !chatId.endsWith("@g.us")) return false;
  const chat = global.db?.data?.chats?.[chatId];
  if (!chat) return false;
  const cfg = ensureManagerConfig(chat);
  return cfg.disabledPlugins.includes(file);
}

function copyPluginProperties(target, source) {
  for (const key of Reflect.ownKeys(source)) {
    if (key === "length" || key === "name" || key === "prototype") continue;
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (descriptor) {
      try {
        Object.defineProperty(target, key, descriptor);
      } catch {}
    }
  }
}

function patchPlugin(file) {
  if (file === SELF_FILE) return;
  const plugin = global.plugins?.[file];
  if (typeof plugin !== "function") return;
  if (plugin[WRAP_MARK]) return;

  const original = plugin;
  originalMainMap.set(file, original);

  const wrapped = async function (m, extra) {
    if (isDisabledForChat(file, m?.chat)) {
      if (!m.__pluginManagerProNotified) {
        m.__pluginManagerProNotified = true;
        await (extra?.conn || this).reply(
          m.chat,
          `Plugin *${file.replace(/\.js$/i, "")}* is disabled in this group.`,
          m
        );
      }
      return;
    }
    return await original.call(this, m, extra);
  };

  copyPluginProperties(wrapped, original);

  const originalBefore = original.before;
  wrapped.before = async function (m, extra) {
    if (isDisabledForChat(file, m?.chat)) return true;
    if (typeof originalBefore === "function") {
      return await originalBefore.call(this, m, extra);
    }
    return false;
  };

  const originalAll = original.all;
  wrapped.all = async function (m, extra) {
    if (isDisabledForChat(file, m?.chat)) return;
    if (typeof originalAll === "function") {
      return await originalAll.call(this, m, extra);
    }
  };

  wrapped[WRAP_MARK] = true;
  global.plugins[file] = wrapped;
}

function patchAllPlugins() {
  for (const file of Object.keys(global.plugins || {})) {
    patchPlugin(file);
  }
}

function formatGroupState(chatId) {
  const chat = global.db?.data?.chats?.[chatId];
  const cfg = ensureManagerConfig(chat || {});
  const disabled = cfg.disabledPlugins || [];
  return [
    "*Plugin Manager Pro: Group State*",
    "",
    `Group: ${chatId}`,
    `Disabled plugins: ${disabled.length || 0}`,
    ...(disabled.length ? disabled.map((file, index) => `${index + 1}. ${file}`) : ["None"]),
  ].join("\n");
}

async function handleGroupToggle(m, args, isAdmin, isOwner) {
  if (!m.isGroup) throw "Group-only command.";
  if (!(isAdmin || isOwner)) throw "Admin only.";

  const action = (args[1] || "").toLowerCase();
  const target = normalizePluginName(args[2] || "");
  const chat = global.db.data.chats[m.chat];
  const cfg = ensureManagerConfig(chat);

  if (action === "list" || !action) {
    return m.reply(formatGroupState(m.chat));
  }

  if (!target) throw "Plugin not found.";
  if (target === SELF_FILE) throw "Refusing to disable the manager itself.";

  if (action === "disable") {
    if (!cfg.disabledPlugins.includes(target)) cfg.disabledPlugins.push(target);
    patchPlugin(target);
    return m.reply(`Disabled *${target}* in this group.`);
  }

  if (action === "enable") {
    cfg.disabledPlugins = cfg.disabledPlugins.filter((file) => file !== target);
    return m.reply(`Enabled *${target}* in this group.`);
  }

  throw "Use `.pman group disable <plugin>`, `.pman group enable <plugin>`, or `.pman group list`.";
}

let handler = async (m, { command, args, text, isROwner, isAdmin, isOwner }) => {
  patchAllPlugins();

  const sub = (args[0] || "status").toLowerCase();
  const target = normalizePluginName(args[1] || "");

  if (sub === "group") {
    return handleGroupToggle(m, args, isAdmin, isOwner);
  }

  if (!isROwner) throw "Real owner only.";

  switch (sub) {
    case "status":
    case "overview": {
      const files = getPluginFiles();
      const duplicates = getDuplicateCommands();
      const failedLoads = files.filter((file) => !global.plugins?.[file]);
      const disabledGroups = Object.entries(global.db?.data?.chats || {})
        .filter(([jid, chat]) => jid.endsWith("@g.us") && ensureManagerConfig(chat).disabledPlugins.length > 0)
        .length;

      return m.reply(
        [
          "*Plugin Manager Pro*",
          "",
          `Plugin files: ${files.length}`,
          `Loaded plugins: ${Object.keys(global.plugins || {}).length}`,
          `Failed or unloaded: ${failedLoads.length}`,
          `Duplicate commands: ${duplicates.length}`,
          `Groups with disabled plugins: ${disabledGroups}`,
          "",
          "Commands:",
          ".pman validate <plugin>",
          ".pman duplicates",
          ".pman deps [plugin]",
          ".pman graph <plugin>",
          ".pman group disable <plugin>",
          ".pman group enable <plugin>",
          ".pman group list",
        ].join("\n")
      );
    }
    case "validate":
      if (!target) throw "Usage: .pman validate <plugin>";
      return m.reply(formatValidationReport(validatePlugin(target)));
    case "duplicates":
      return m.reply(formatDuplicateReport());
    case "deps":
      return m.reply(formatDepsReport(target));
    case "graph":
      if (!target) throw "Usage: .pman graph <plugin>";
      return m.reply(formatGraphReport(target));
    default:
      return m.reply(
        [
          "*Plugin Manager Pro*",
          "",
          "Usage:",
          ".pman",
          ".pman validate <plugin>",
          ".pman duplicates",
          ".pman deps [plugin]",
          ".pman graph <plugin>",
          ".pman group disable <plugin>",
          ".pman group enable <plugin>",
          ".pman group list",
        ].join("\n")
      );
  }
};

handler.all = async function () {
  patchAllPlugins();
};

handler.help = [
  "pman",
  "pman validate <plugin>",
  "pman duplicates",
  "pman deps [plugin]",
  "pman graph <plugin>",
  "pman group disable <plugin>",
  "pman group enable <plugin>",
  "pman group list",
];
handler.tags = ["owner"];
handler.command = /^(plugin-manager-pro|pman|pmpro)$/i;

export default handler;
