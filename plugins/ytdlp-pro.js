import fs from "fs";
import fsp from "fs/promises";
import os from "os";
import path from "path";
import { spawn, spawnSync } from "child_process";

const MAX_TEXT_REPLY = 3500;
const MAX_FILES_TO_SEND = 5;
const YTDLP_CANDIDATES = [
  "yt-dlp",
  path.join(os.homedir(), ".local", "bin", "yt-dlp"),
];
const INSTALL_METHODS = [
  ["python3", ["-m", "pip", "install", "--user", "-U", "yt-dlp"]],
  ["pip3", ["install", "--user", "-U", "yt-dlp"]],
];

const INFO_FLAGS = new Set([
  "-h",
  "--help",
  "--version",
  "-F",
  "--list-formats",
  "-j",
  "--dump-json",
  "-J",
  "--dump-single-json",
  "-s",
  "--simulate",
  "--print",
  "--get-id",
  "--get-title",
  "--get-url",
  "--get-description",
  "--get-duration",
  "--get-filename",
  "--list-extractors",
  "--list-extractor-descriptions",
]);

const OUTPUT_CONTROL_FLAGS = new Set([
  "-o",
  "--output",
  "-P",
  "--paths",
]);

function truncate(text, max = MAX_TEXT_REPLY) {
  const value = String(text || "").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 20)}\n...[truncated]`;
}

function parseShellArgs(input) {
  const args = [];
  const pattern = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(\S+)/g;
  let match;

  while ((match = pattern.exec(String(input || "")))) {
    const value =
      match[1] !== undefined
        ? match[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\")
        : match[2] !== undefined
          ? match[2].replace(/\\'/g, "'").replace(/\\\\/g, "\\")
          : match[3];
    args.push(value);
  }

  return args;
}

function guessMime(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".mp3" || ext === ".m4a" || ext === ".aac" || ext === ".opus" || ext === ".wav") {
    return "audio/mpeg";
  }
  if (ext === ".mp4" || ext === ".mkv" || ext === ".webm" || ext === ".mov") {
    return "video/mp4";
  }
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".json") return "application/json";
  return "application/octet-stream";
}

function isInfoMode(args) {
  return args.some((arg) => INFO_FLAGS.has(arg));
}

function controlsOutputPath(args) {
  return args.some((arg, index) => OUTPUT_CONTROL_FLAGS.has(arg) || (index > 0 && OUTPUT_CONTROL_FLAGS.has(args[index - 1])));
}

function findYtDlpBinary() {
  for (const candidate of YTDLP_CANDIDATES) {
    const res = spawnSync(candidate, ["--version"], { encoding: "utf8", timeout: 8000 });
    if (!res.error && res.status === 0) {
      return candidate;
    }
  }
  return null;
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function collectFiles(dir) {
  const out = [];

  async function walk(current) {
    const entries = await fsp.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (!entry.name.endsWith(".part") && !entry.name.endsWith(".ytdl")) {
        out.push(full);
      }
    }
  }

  if (fs.existsSync(dir)) {
    await walk(dir);
  }

  return out.sort();
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function ensureYtDlpInstalled() {
  let binary = findYtDlpBinary();
  if (binary) return { binary, installed: false, output: "" };

  let install = null;
  for (const [command, args] of INSTALL_METHODS) {
    try {
      install = await runProcess(command, args, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PATH: `${path.join(os.homedir(), ".local", "bin")}:${process.env.PATH || ""}`,
        },
      });
      if (install.code === 0) break;
    } catch (error) {
      install = {
        code: 1,
        stdout: "",
        stderr: error.message,
      };
    }
  }

  binary = findYtDlpBinary();
  if (!binary) {
    throw new Error(
      [
        "yt-dlp installation failed on first run.",
        "",
        "Tried:",
        "• python3 -m pip install --user -U yt-dlp",
        "• pip3 install --user -U yt-dlp",
        "",
        "Make sure the Ubuntu server has Python 3 + pip available.",
        truncate(install?.stderr || install?.stdout, 1200),
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  return {
    binary,
    installed: true,
    output: truncate([install.stdout, install.stderr].filter(Boolean).join("\n"), 1200),
  };
}

async function sendOutput(conn, chat, quoted, label, text) {
  if (!text || !text.trim()) return;
  await conn.sendMessage(
    chat,
    {
      text: `*${label}*\n\n${truncate(text)}`,
    },
    { quoted }
  );
}

async function sendDownloadedFiles(conn, m, files) {
  if (!files.length) return false;

  const slice = files.slice(0, MAX_FILES_TO_SEND);
  for (const file of slice) {
    const stat = await fsp.stat(file);
    if (stat.size > 95 * 1024 * 1024) {
      await conn.sendMessage(
        m.chat,
        {
          text: `Downloaded file is too large for WhatsApp:\n${path.basename(file)}\n${file}`,
        },
        { quoted: m }
      );
      continue;
    }

    await conn.sendMessage(
      m.chat,
      {
        document: { url: file },
        fileName: path.basename(file),
        mimetype: guessMime(file),
      },
      { quoted: m }
    );
  }

  if (files.length > MAX_FILES_TO_SEND) {
    await conn.sendMessage(
      m.chat,
      {
        text: `Downloaded ${files.length} files. Sent the first ${MAX_FILES_TO_SEND} only.`,
      },
      { quoted: m }
    );
  }

  return true;
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) {
    return m.reply(
      [
        "*yt-dlp Pro*",
        "",
        "Owner-only raw yt-dlp wrapper with auto-install.",
        "",
        "Examples:",
        `${usedPrefix}${command} https://www.youtube.com/watch?v=dQw4w9WgXcQ`,
        `${usedPrefix}${command} -x --audio-format mp3 "https://youtu.be/dQw4w9WgXcQ"`,
        `${usedPrefix}${command} -F <url>`,
        `${usedPrefix}${command} --dump-json <url>`,
        `${usedPrefix}${command} --help`,
        "",
        "Notes:",
        "• If yt-dlp is missing, the plugin installs it automatically with pip3 --user.",
        "• Raw flags are forwarded to yt-dlp.",
        "• If you do not provide -o/--output/--paths, downloads are captured in bot temp storage and sent back here.",
      ].join("\n")
    );
  }

  const args = parseShellArgs(text);
  if (!args.length) throw "No yt-dlp arguments detected.";

  await conn.reply(m.chat, "⏳ Checking yt-dlp availability...", m);

  const bootstrap = await ensureYtDlpInstalled();
  if (bootstrap.installed) {
    await conn.sendMessage(
      m.chat,
      {
        text: `✅ yt-dlp was not installed. It has now been installed.\n\n${bootstrap.output || ""}`.trim(),
      },
      { quoted: m }
    );
  }

  const infoMode = isInfoMode(args);
  const customOutput = controlsOutputPath(args);
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const downloadDir = path.join(process.cwd(), "tmp", "yt-dlp-pro", runId);

  if (!infoMode && !customOutput) {
    await ensureDir(downloadDir);
    args.unshift("--paths", `home:${downloadDir}`);
  }

  await conn.reply(m.chat, `🚀 Running yt-dlp...\n\`${bootstrap.binary} ${text}\``, m);

  const result = await runProcess(bootstrap.binary, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PATH: `${path.join(os.homedir(), ".local", "bin")}:${process.env.PATH || ""}`,
    },
  });

  const combinedOutput = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();

  if (result.code !== 0) {
    if (!customOutput) {
      await fsp.rm(downloadDir, { recursive: true, force: true }).catch(() => {});
    }
    throw new Error(truncate(combinedOutput || `yt-dlp exited with code ${result.code}`));
  }

  if (infoMode || customOutput) {
    await sendOutput(conn, m.chat, m, "yt-dlp Output", combinedOutput || "Command completed.");
    if (!infoMode && customOutput) {
      await conn.sendMessage(
        m.chat,
        {
          text: "Files were written using your yt-dlp output settings. This wrapper did not relocate them.",
        },
        { quoted: m }
      );
    }
    if (!customOutput) {
      await fsp.rm(downloadDir, { recursive: true, force: true }).catch(() => {});
    }
    return;
  }

  const files = await collectFiles(downloadDir);
  if (!files.length) {
    await sendOutput(conn, m.chat, m, "yt-dlp Output", combinedOutput || "Download completed but no files were found.");
    await fsp.rm(downloadDir, { recursive: true, force: true }).catch(() => {});
    return;
  }

  await sendDownloadedFiles(conn, m, files);
  if (combinedOutput) {
    await sendOutput(conn, m.chat, m, "yt-dlp Log", combinedOutput);
  }

  await fsp.rm(downloadDir, { recursive: true, force: true }).catch(() => {});
};

handler.help = ["ytdlp <raw yt-dlp args>"];
handler.tags = ["owner"];
handler.command = /^(ytdlp)$/i;
handler.rowner = true;

export default handler;
