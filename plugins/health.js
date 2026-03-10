import fs from "fs";
import os from "os";
import path from "path";
import axios from "axios";
import { spawnSync } from "child_process";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const PROVIDER_CHECKS = [
  { name: "TikWM", url: "https://tikwm.com/api/", method: "HEAD", plugins: ["tiktok.js", "tiktoksearch.js", "ttsearch.js"] },
  { name: "SaveNow", url: "https://p.savenow.to/ajax/download.php", method: "HEAD", plugins: ["ytdl.js"] },
  { name: "ImageYouTube", url: "https://imageyoutube.com/", method: "GET", plugins: ["youtube-vd-info.js"] },
  { name: "MediaFireTrend", url: "https://mediafiretrend.com/", method: "GET", plugins: ["mediafiresearch.js"] },
  { name: "Siputzx Canvas", url: "https://api.siputzx.my.id/api/canvas/welcomev2", method: "HEAD", plugins: ["_welcome.js", "welcomepro.js"] },
  { name: "OCR.Space", url: "https://api.ocr.space/parse/image", method: "HEAD", plugins: ["ocr.js"] },
  { name: "TmpFiles", url: "https://tmpfiles.org/api/v1/upload", method: "HEAD", plugins: ["tmpupload.js", "tourl-pro.js", "img2video.js"] },
  { name: "Airbrush", url: "https://airbrush.com/core-api/v1/upload/sts", method: "HEAD", plugins: ["airbrush.js"] },
];

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(1)} ${units[index]}`;
}

function formatPercent(value) {
  return `${(Number(value) || 0).toFixed(1)}%`;
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

function statusIcon(ok) {
  return ok ? "✅" : "❌";
}

function pluginLabel(file) {
  const plugin = global.plugins?.[file];
  if (plugin?.help?.[0]) return String(plugin.help[0]);
  if (typeof plugin?.help === "string") return plugin.help;
  return file.replace(/\.js$/i, "");
}

function getPluginFailureStats() {
  const entries = Object.entries(global.db?.data?.stats || {}).map(([file, stat]) => {
    const total = Number(stat?.total) || 0;
    const success = Number(stat?.success) || 0;
    const failed = Math.max(0, total - success);
    return {
      file,
      label: pluginLabel(file),
      total,
      success,
      failed,
      failureRate: total ? (failed / total) * 100 : 0,
      last: Number(stat?.last) || 0,
    };
  });

  return entries
    .filter((entry) => entry.failed > 0)
    .sort((a, b) => b.failed - a.failed || b.failureRate - a.failureRate || b.total - a.total);
}

function getMemorySnapshot() {
  const mem = process.memoryUsage();
  return {
    rss: formatBytes(mem.rss),
    heapUsed: formatBytes(mem.heapUsed),
    heapTotal: formatBytes(mem.heapTotal),
    external: formatBytes(mem.external),
    arrayBuffers: formatBytes(mem.arrayBuffers),
  };
}

function getTempDirectories() {
  return [
    { name: "os.tmpdir()", dir: os.tmpdir() },
    { name: "./tmp", dir: path.resolve("./tmp") },
    { name: "./temp", dir: path.resolve("./temp") },
  ];
}

function getDirectorySnapshot(dir) {
  try {
    if (!fs.existsSync(dir)) {
      return { exists: false, files: 0, bytes: 0, writable: false };
    }

    const entries = fs.readdirSync(dir);
    let bytes = 0;

    for (const entry of entries) {
      const filePath = path.join(dir, entry);
      try {
        const stat = fs.statSync(filePath);
        bytes += stat.size || 0;
      } catch {}
    }

    fs.accessSync(dir, fs.constants.W_OK);
    return { exists: true, files: entries.length, bytes, writable: true };
  } catch {
    return { exists: true, files: 0, bytes: 0, writable: false };
  }
}

function checkBinary(command, args = ["-version"]) {
  try {
    const result = spawnSync(command, args, { encoding: "utf8", timeout: 5000 });
    return {
      ok: result.status === 0 || result.status === 1,
      detail: result.error ? result.error.message : (result.stdout || result.stderr || "").split("\n")[0].trim() || "available",
    };
  } catch (error) {
    return { ok: false, detail: error.message };
  }
}

function checkNodeDependency(name) {
  try {
    require.resolve(name);
    return { ok: true, detail: "installed" };
  } catch (error) {
    return { ok: false, detail: error.code || error.message };
  }
}

async function probeUrl(url, method = "GET") {
  try {
    const response = await axios({
      url,
      method,
      timeout: 8000,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: {
        "User-Agent": "NovaChat-Health/1.0",
      },
    });

    return {
      ok: response.status >= 200 && response.status < 500,
      status: response.status,
      detail: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      detail: error.code || error.message,
    };
  }
}

async function getApiChecks() {
  const apiChecks = Object.entries(global.APIs || {}).map(async ([name, baseUrl]) => {
    const result = await probeUrl(baseUrl, "GET");
    return { name, baseUrl, ...result };
  });

  const providerChecks = PROVIDER_CHECKS.map(async (provider) => {
    const result = await probeUrl(provider.url, provider.method);
    return { ...provider, ...result };
  });

  return {
    apis: await Promise.all(apiChecks),
    providers: await Promise.all(providerChecks),
  };
}

function buildHealthReport(apiResults) {
  const memory = getMemorySnapshot();
  const pluginFailures = getPluginFailureStats();
  const tempSnapshots = getTempDirectories().map((item) => ({
    ...item,
    ...getDirectorySnapshot(item.dir),
  }));
  const providerFailures = apiResults.providers.filter((provider) => !provider.ok);
  const apiFailures = apiResults.apis.filter((api) => !api.ok);

  const lines = [
    "*Bot Health*",
    "",
    "Memory:",
    `• RSS: ${memory.rss}`,
    `• Heap: ${memory.heapUsed} / ${memory.heapTotal}`,
    `• External: ${memory.external}`,
    "",
    "Temp storage:",
    ...tempSnapshots.map(
      (item) =>
        `• ${item.name}: ${item.exists ? `${formatBytes(item.bytes)} / ${item.files} files / ${item.writable ? "writable" : "not writable"}` : "missing"}`
    ),
    "",
    `Plugin errors: ${pluginFailures.length ? `${pluginFailures.length} plugins have recorded failures` : "no recorded command failures"}`,
    ...pluginFailures.slice(0, 5).map(
      (item) =>
        `• ${item.label}: ${item.failed} failed of ${item.total} (${formatPercent(item.failureRate)})`
    ),
    "",
    `Global APIs: ${apiResults.apis.length - apiFailures.length}/${apiResults.apis.length} reachable`,
    ...apiResults.apis.slice(0, 6).map(
      (api) => `• ${statusIcon(api.ok)} ${api.name}: ${api.detail}`
    ),
    "",
    `Fragile providers: ${apiResults.providers.length - providerFailures.length}/${apiResults.providers.length} reachable`,
    ...apiResults.providers.map(
      (provider) =>
        `• ${statusIcon(provider.ok)} ${provider.name}: ${provider.detail}${provider.ok ? "" : ` | ${provider.plugins.join(", ")}`}`
    ),
  ];

  return lines.join("\n");
}

function buildDepsReport(pkg) {
  const importantDeps = [
    "@adiwajshing/baileys",
    "axios",
    "cheerio",
    "lowdb",
    "node-fetch",
    "sharp",
    "yt-search",
  ];

  const depResults = importantDeps.map((name) => ({ name, ...checkNodeDependency(name) }));
  const binaries = [
    { name: "ffmpeg", args: ["-version"] },
    { name: "ffprobe", args: ["-version"] },
    { name: "convert", args: ["-version"] },
    { name: "magick", args: ["-version"] },
    { name: "gm", args: ["version"] },
  ].map((item) => ({ name: item.name, ...checkBinary(item.name, item.args) }));

  const missingDeps = depResults.filter((item) => !item.ok);
  const missingBins = binaries.filter((item) => !item.ok);

  const lines = [
    "*Dependency Diagnostics*",
    "",
    `Package: ${pkg.name}@${pkg.version}`,
    `Declared dependencies: ${Object.keys(pkg.dependencies || {}).length}`,
    "",
    "Node modules:",
    ...depResults.map((item) => `• ${statusIcon(item.ok)} ${item.name}: ${item.detail}`),
    "",
    "System binaries:",
    ...binaries.map((item) => `• ${statusIcon(item.ok)} ${item.name}: ${item.detail}`),
    "",
    `Summary: ${missingDeps.length} missing node deps, ${missingBins.length} missing binaries`,
  ];

  return lines.join("\n");
}

function buildApisReport(apiResults) {
  const lines = [
    "*API Diagnostics*",
    "",
    "Configured global APIs:",
    ...apiResults.apis.map(
      (api) => `• ${statusIcon(api.ok)} ${api.name} -> ${api.baseUrl} (${api.detail})`
    ),
    "",
    "External providers used by plugins:",
    ...apiResults.providers.map(
      (provider) =>
        `• ${statusIcon(provider.ok)} ${provider.name} -> ${provider.url} (${provider.detail}) [${provider.plugins.join(", ")}]`
    ),
  ];

  return lines.join("\n");
}

let handler = async (m, { command }) => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve("./package.json"), "utf8"));

  if (command === "deps") {
    return m.reply(buildDepsReport(pkg));
  }

  const apiResults = await getApiChecks();

  if (command === "apis") {
    return m.reply(buildApisReport(apiResults));
  }

  return m.reply(buildHealthReport(apiResults));
};

handler.help = ["health", "deps", "apis"];
handler.tags = ["owner"];
handler.command = /^(health|deps|apis)$/i;
handler.rowner = true;

export default handler;
