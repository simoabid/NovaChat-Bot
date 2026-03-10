import axios from "axios";
import crypto from "crypto";
import FormData from "form-data";
import * as cheerio from "cheerio";

const AXIOS_DEFAULTS = {
  timeout: 30000,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    Accept: "application/json, text/plain, */*",
  },
};

function cleanFileName(text) {
  return String(text || "media")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function detectProvider(url) {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }

  if (host.includes("tiktok.com")) return "tiktok";
  if (host.includes("instagram.com")) return "instagram";
  if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
  if (host.includes("twitter.com") || host.includes("x.com")) return "twitter";
  if (host.includes("facebook.com") || host.includes("fb.watch")) return "facebook";
  return null;
}

async function tryMethods(methods) {
  let lastError;
  for (const method of methods) {
    try {
      const result = await method();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("All media sources failed.");
}

async function getTikwm(url) {
  const encodedParams = new URLSearchParams();
  encodedParams.set("url", url);
  encodedParams.set("hd", "1");

  const response = await axios({
    method: "POST",
    url: "https://tikwm.com/api/",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Cookie: "current_language=en",
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
    },
    data: encodedParams,
  });

  const data = response.data?.data;
  if (!data?.play) throw new Error("TikWM failed");

  return {
    provider: "TikTok",
    title: data.title || "TikTok Video",
    author: data.author?.nickname || data.author?.unique_id || "",
    thumbnail: data.cover || data.origin_cover || "",
    video: data.hdplay || data.play,
    audio: data.music || "",
    info: {
      id: data.id,
      duration: data.duration,
      views: data.play_count,
      likes: data.digg_count,
      comments: data.comment_count,
    },
  };
}

async function getSavetik(url) {
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    Origin: "https://savetik.co",
    Referer: "https://savetik.co/id/tiktok-mp3-downloader",
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64)",
    "X-Requested-With": "XMLHttpRequest",
  };

  const data = new URLSearchParams();
  data.append("q", url);
  data.append("lang", "id");

  const res = await axios.post("https://savetik.co/api/ajaxSearch", data, { headers });
  const $ = cheerio.load(res.data?.data || "");
  const title = $("h3").text().trim() || "TikTok";
  const thumbnail = $(".thumbnail img").attr("src") || "";
  const buttons = $("a.tik-button-dl");

  let audio = "";
  let video = "";
  buttons.each((_, el) => {
    const text = $(el).text().toLowerCase();
    const href = $(el).attr("href");
    if (!href) return;
    if (text.includes("mp3")) audio = href;
    else if (text.includes("hd")) video = href;
    else if (text.includes("mp4") && !video) video = href;
  });

  if (!video && !audio) throw new Error("Savetik failed");

  return {
    provider: "TikTok",
    title,
    author: "",
    thumbnail,
    video,
    audio,
    info: {},
  };
}

class SaveTubeAudio {
  constructor() {
    this.key = "C5D58EF67A7584E4A29F6C35BBC4EB12";
    this.matcher =
      /^((?:https?:)?\/\/)?((?:www|m|music)\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(?:embed\/)?(?:v\/)?(?:shorts\/)?([a-zA-Z0-9_-]{11})/;
    this.client = axios.create({
      headers: {
        "content-type": "application/json",
        origin: "https://yt.savetube.me",
        "user-agent": "Mozilla/5.0 (Android 15; Mobile)",
      },
      timeout: 30000,
    });
  }

  async decrypt(enc) {
    const buf = Buffer.from(enc, "base64");
    const key = Buffer.from(this.key, "hex");
    const iv = buf.slice(0, 16);
    const data = buf.slice(16);
    const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(decrypted.toString());
  }

  async getCdn() {
    const res = await this.client.get("https://media.savetube.vip/api/random-cdn");
    return res.data?.cdn;
  }

  async download(url) {
    const id = url.match(this.matcher)?.[3];
    if (!id) throw new Error("Invalid YouTube URL");

    const cdn = await this.getCdn();
    const info = await this.client.post(`https://${cdn}/v2/info`, {
      url: `https://www.youtube.com/watch?v=${id}`,
    });
    const dec = await this.decrypt(info.data.data);

    const dl = await this.client.post(`https://${cdn}/download`, {
      id,
      downloadType: "audio",
      quality: "128",
      key: dec.key,
    });

    return {
      provider: "YouTube",
      title: dec.title || "YouTube Audio",
      author: "",
      thumbnail: dec.thumbnail || "",
      audio: dl.data?.data?.downloadUrl || "",
      info: {
        duration: dec.duration,
      },
    };
  }
}

class SaveNowVideo {
  constructor() {
    this.baseUrl = "https://p.savenow.to";
    this.headers = {
      "User-Agent": "Mozilla/5.0",
      Referer: "https://y2down.cc/",
      Origin: "https://y2down.cc",
    };
  }

  async request(url, format) {
    const res = await axios.get(`${this.baseUrl}/ajax/download.php`, {
      params: {
        copyright: "0",
        format,
        url,
        api: "dfcb6d76f2f6a9894gjkege8a4ab232222",
      },
      headers: this.headers,
      timeout: 30000,
    });

    if (!res.data?.progress_url) throw new Error("SaveNow init failed");
    return {
      progress: res.data.progress_url,
      title: res.data.info?.title || "YouTube Video",
    };
  }

  async wait(progressUrl) {
    for (let i = 0; i < 30; i++) {
      const res = await axios.get(progressUrl, { headers: this.headers, timeout: 30000 });
      if (res.data?.download_url) return res.data.download_url;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    throw new Error("SaveNow timed out");
  }

  async download(url, format = "720") {
    const req = await this.request(url, format);
    const download = await this.wait(req.progress);
    return {
      provider: "YouTube",
      title: req.title,
      author: "",
      thumbnail: "",
      video: download,
      info: {},
    };
  }
}

async function getEliteProTechVideoByUrl(youtubeUrl) {
  const apiUrl = `https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(youtubeUrl)}&format=mp4`;
  const res = await axios.get(apiUrl, AXIOS_DEFAULTS);
  if (res?.data?.success && res?.data?.downloadURL) {
    return {
      provider: "YouTube",
      title: res.data.title || "YouTube Video",
      author: "",
      thumbnail: "",
      video: res.data.downloadURL,
      info: {},
    };
  }
  throw new Error("EliteProTech failed");
}

async function getYupraVideoByUrl(youtubeUrl) {
  const apiUrl = `https://api.yupra.my.id/api/downloader/ytmp4?url=${encodeURIComponent(youtubeUrl)}`;
  const res = await axios.get(apiUrl, AXIOS_DEFAULTS);
  if (res?.data?.success && res?.data?.data?.download_url) {
    return {
      provider: "YouTube",
      title: res.data.data.title || "YouTube Video",
      author: "",
      thumbnail: res.data.data.thumbnail || "",
      video: res.data.data.download_url,
      info: {},
    };
  }
  throw new Error("Yupra failed");
}

async function getOkatsuVideoByUrl(youtubeUrl) {
  const apiUrl = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp4?url=${encodeURIComponent(youtubeUrl)}`;
  const res = await axios.get(apiUrl, AXIOS_DEFAULTS);
  if (res?.data?.result?.mp4) {
    return {
      provider: "YouTube",
      title: res.data.result.title || "YouTube Video",
      author: "",
      thumbnail: "",
      video: res.data.result.mp4,
      info: {},
    };
  }
  throw new Error("Okatsu failed");
}

class InstagramKol {
  static async getCookieAndToken() {
    const response = await axios.get("https://kol.id/download-video/instagram", {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 30000,
    });

    const cookies =
      response.headers["set-cookie"]?.map((cookie) => cookie.split(";")[0]).join("; ") || "";
    const $ = cheerio.load(response.data);
    const token = $("input[name='_token']").val();

    return { cookies, token };
  }

  static async download(url) {
    const { cookies, token } = await this.getCookieAndToken();
    const formData = new FormData();
    formData.append("url", url);
    formData.append("_token", token);

    const headers = {
      "X-Requested-With": "XMLHttpRequest",
      Cookie: cookies,
      ...formData.getHeaders(),
    };

    const { data } = await axios.post("https://kol.id/download-video/instagram", formData, {
      headers,
      timeout: 30000,
    });

    const $ = cheerio.load(data.html || "");
    const title = $("#title-content-here h2").text().trim() || "Instagram";
    const videoUrl = $(".btn-instagram.btn-primary").attr("href");
    if (videoUrl) {
      return {
        provider: "Instagram",
        title,
        author: "",
        thumbnail: "",
        video: videoUrl,
        images: [],
        info: {},
      };
    }

    const images = [];
    $(".dropdown-menu .dropdown-item").each((_, el) => {
      const imgUrl = $(el).attr("href");
      if (imgUrl) images.push(imgUrl);
    });

    if (!images.length) throw new Error("Instagram Kol failed");

    return {
      provider: "Instagram",
      title,
      author: "",
      thumbnail: images[0],
      video: "",
      images,
      info: {},
    };
  }
}

async function getInstagramSnapSave(url) {
  function decodeData(data) {
    let [part1, part2, part3, part4, part5, part6] = data;
    function decodeSegment(segment, base, length) {
      const charSet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/".split("");
      let baseSet = charSet.slice(0, base);
      let decodeSet = charSet.slice(0, length);
      let decodedValue = segment
        .split("")
        .reverse()
        .reduce((accum, char, index) => {
          if (baseSet.indexOf(char) !== -1) {
            return (accum += baseSet.indexOf(char) * Math.pow(base, index));
          }
          return accum;
        }, 0);
      let result = "";
      while (decodedValue > 0) {
        result = decodeSet[decodedValue % length] + result;
        decodedValue = Math.floor(decodedValue / length);
      }
      return result || "0";
    }

    part6 = "";
    for (let i = 0, len = part1.length; i < len; i++) {
      let segment = "";
      while (part1[i] !== part3[part5]) {
        segment += part1[i];
        i++;
      }
      for (let j = 0; j < part3.length; j++) {
        segment = segment.replace(new RegExp(part3[j], "g"), j.toString());
      }
      part6 += String.fromCharCode(decodeSegment(segment, part5, 10) - part4);
    }
    return decodeURIComponent(encodeURIComponent(part6));
  }

  function extractParams(data) {
    return data
      .split("decodeURIComponent(escape(r))}(")[1]
      .split("))")[0]
      .split(",")
      .map((item) => item.replace(/"/g, "").trim());
  }

  function extractDownloadUrl(data) {
    return data
      .split('getElementById("download-section").innerHTML = "')[1]
      .split('"; document.getElementById("inputData").remove(); ')[0]
      .replace(/\\(\\)?/g, "");
  }

  function getVideoUrl(data) {
    return extractDownloadUrl(decodeData(extractParams(data)));
  }

  const response = await axios.post("https://snapsave.app/action.php?lang=id", "url=" + url, {
    headers: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://snapsave.app",
      referer: "https://snapsave.app/id",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Safari/537.36",
    },
    timeout: 30000,
  });

  const data = response.data;
  const videoPageContent = getVideoUrl(data);
  const $ = cheerio.load(videoPageContent);
  const downloadLinks = [];
  $("div.download-items__btn a").each((_, button) => {
    let downloadUrl = $(button).attr("href");
    if (!downloadUrl) return;
    if (!/^https?:\/\//.test(downloadUrl)) {
      downloadUrl = "https://snapsave.app" + downloadUrl;
    }
    downloadLinks.push(downloadUrl);
  });

  if (!downloadLinks.length) throw new Error("Instagram SnapSave failed");

  return {
    provider: "Instagram",
    title: "Instagram Media",
    author: "",
    thumbnail: downloadLinks[0],
    video: downloadLinks[0],
    images: downloadLinks,
    info: {},
  };
}

async function getTwitterX(url) {
  class Util {
    static PRIMARY_KEY = "73587A446B5642716E6A6A48325742733561436D5A457847555273367A4E4B79";
    static X_TOKEN_KEY = "UAXFoplp5H87RRX7/HvrKAvO6rkH3IE/u0931xcvThO7sxOvv1cvz7H14iRSSHXM";
    static X_TOKEN_DEC = "OFx0xDz4WXeHQn+5mZtaf7eScT6WbgYRHV/cVLKIoYYbfpL0JYRPMY7G75BJQ5n2";
    static X_APP_KEY = "FJ7lkHHe8QSX1S5rCNkYlI9eBZTYLP1s2GgJFC5ZJhG6LWX37b5p7fyiZZN07uYR";
    static X_APP_DEC = "wy9V4gkza+fPVHVADo1nC8ln5otwFWqJ8xpElEXcS38=";
    static decrypt(strToDecrypt, secret) {
      const key = Buffer.from(secret, "utf-8");
      const iv = Buffer.from(secret.substring(0, 16), "utf-8");
      const encryptedText = Buffer.from(strToDecrypt, "base64");
      const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
      let decrypted = decipher.update(encryptedText, null, "utf8");
      decrypted += decipher.final("utf8");
      return decrypted.replace(/\n/g, "");
    }
    static encrypt(strToEncrypt, secret) {
      const key = Buffer.from(secret, "utf-8");
      const iv = Buffer.from(secret.substring(0, 16), "utf-8");
      const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
      let encrypted = cipher.update(strToEncrypt, "utf8", "base64");
      encrypted += cipher.final("base64");
      return encrypted.replace(/\n/g, "");
    }
    static hexToBytes(hexString) {
      return Buffer.from(hexString, "hex");
    }
    static getUtcTime() {
      return Math.floor(Date.now() / 1000);
    }
  }

  const data = new URLSearchParams();
  data.append("url", url);
  data.append("cookie", "");
  const key = Util.hexToBytes(Util.PRIMARY_KEY).toString();
  const unixTime = Util.getUtcTime();
  const xtokenKey = Util.decrypt(Util.X_TOKEN_KEY, key);
  const xtokenDec = Util.decrypt(Util.X_TOKEN_DEC, key);
  const xtoken = Util.encrypt(`${xtokenDec}___${unixTime}`, xtokenKey);
  const xappkeyKey = Util.decrypt(Util.X_APP_KEY, key);
  const xappkeyDec = Util.decrypt(Util.X_APP_DEC, key);
  const xappkey = Util.encrypt(`${xappkeyDec}___${unixTime}`, xappkeyKey);

  const response = await axios.request({
    method: "POST",
    url: "https://downloaderapi.densavedownloader.app/index.php?action=extract",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.63 Safari/537.36",
      referer: "https://downloaderapi.quqqashop.com/",
      "x-token": xtoken,
      "x-appkey": xappkey,
      "x-appcode": "haticitwitter",
      "content-type": "application/x-www-form-urlencoded",
    },
    data,
    timeout: 30000,
  });

  const result = response.data;
  if (!result?.formats?.length) throw new Error("Twitter/X extraction failed");

  const bestVideo = result.formats[result.formats.length - 1]?.url;
  return {
    provider: "X/Twitter",
    title: result.title || "Twitter Video",
    author: result.author || "",
    thumbnail: result.thumbnail || "",
    video: bestVideo,
    audio: "",
    info: {
      description: result.description || "",
    },
  };
}

async function getFacebook(url) {
  const headers = {
    "sec-fetch-user": "?1",
    "sec-ch-ua-mobile": "?0",
    "sec-fetch-site": "none",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "cache-control": "max-age=0",
    authority: "www.facebook.com",
    "upgrade-insecure-requests": "1",
    "accept-language": "en-GB,en;q=0.9",
    "sec-ch-ua": '"Google Chrome";v="89", "Chromium";v="89", ";Not A Brand";v="99"',
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.114 Safari/537.36",
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
  };

  const { data } = await axios.get(url, { headers, timeout: 30000 });
  const extractData = data.replace(/\\u0025/g, "%");

  const match = (...patterns) => {
    for (const pattern of patterns) {
      const result = extractData.match(pattern);
      if (result) return result;
    }
    return null;
  };

  const parseString = (string) => {
    try {
      return JSON.parse(`{"text":"${string}"}`).text;
    } catch {
      return string;
    }
  };

  const sdUrl = match(/"browser_native_sd_url":"(.*?)"/, /sd_src\s*:\s*"([^"]*)"/)?.[1];
  const hdUrl = match(/"browser_native_hd_url":"(.*?)"/, /hd_src\s*:\s*"([^"]*)"/)?.[1];
  const title = match(/<meta\sname="description"\scontent="(.*?)"/)?.[1] || "Facebook Video";

  if (!sdUrl && !hdUrl) throw new Error("Facebook extraction failed");

  return {
    provider: "Facebook",
    title: parseString(title),
    author: "",
    thumbnail: "",
    video: parseString(hdUrl || sdUrl),
    audio: "",
    info: {
      quality: hdUrl ? "HD" : "SD",
    },
  };
}

const providers = {
  async tiktok(url) {
    return tryMethods([() => getTikwm(url), () => getSavetik(url)]);
  },
  async instagram(url) {
    return tryMethods([() => InstagramKol.download(url), () => getInstagramSnapSave(url)]);
  },
  async youtube(url, mode) {
    if (mode === "audio") {
      return new SaveTubeAudio().download(url);
    }
    return tryMethods([
      () => new SaveNowVideo().download(url, "720"),
      () => getEliteProTechVideoByUrl(url),
      () => getYupraVideoByUrl(url),
      () => getOkatsuVideoByUrl(url),
    ]);
  },
  async twitter(url) {
    return getTwitterX(url);
  },
  async facebook(url) {
    return getFacebook(url);
  },
};

function buildInfoCaption(result, url) {
  const lines = [
    `*MediaHub Info*`,
    "",
    `Provider: ${result.provider}`,
    `Title: ${result.title || "-"}`,
    `Author: ${result.author || "-"}`,
    `URL: ${url}`,
    `Video: ${result.video ? "Yes" : "No"}`,
    `Audio: ${result.audio ? "Yes" : "No"}`,
    `Images: ${result.images?.length || 0}`,
  ];

  for (const [key, value] of Object.entries(result.info || {})) {
    if (value === undefined || value === null || value === "") continue;
    lines.push(`${key}: ${value}`);
  }

  return lines.join("\n");
}

async function sendAuto(conn, m, result) {
  if (result.video) {
    return conn.sendMessage(
      m.chat,
      {
        video: { url: result.video },
        caption: `🎬 *${result.title || "Media"}*${result.author ? `\n👤 ${result.author}` : ""}`,
      },
      { quoted: m }
    );
  }

  if (result.images?.length) {
    for (const [index, image] of result.images.entries()) {
      await conn.sendMessage(
        m.chat,
        {
          image: { url: image },
          caption: index === 0 ? `🖼️ *${result.title || "Media"}*` : "",
        },
        { quoted: m }
      );
    }
    return;
  }

  if (result.audio) {
    return conn.sendMessage(
      m.chat,
      {
        audio: { url: result.audio },
        mimetype: "audio/mpeg",
        fileName: `${cleanFileName(result.title)}.mp3`,
      },
      { quoted: m }
    );
  }

  throw new Error("No media payload available.");
}

async function sendVideo(conn, m, result) {
  if (!result.video) throw new Error("Video mode is not available for this URL.");
  return conn.sendMessage(
    m.chat,
    {
      video: { url: result.video },
      caption: `🎬 *${result.title || "Media"}*${result.author ? `\n👤 ${result.author}` : ""}`,
    },
    { quoted: m }
  );
}

async function sendAudio(conn, m, result) {
  if (!result.audio) throw new Error("Audio mode is not available for this URL.");
  return conn.sendMessage(
    m.chat,
    {
      audio: { url: result.audio },
      mimetype: "audio/mpeg",
      fileName: `${cleanFileName(result.title)}.mp3`,
    },
    { quoted: m }
  );
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  if (!args[0]) {
    return m.reply(
      [
        "*MediaHub*",
        "",
        "Usage:",
        `${usedPrefix}${command} <url>`,
        `${usedPrefix}${command} audio <url>`,
        `${usedPrefix}${command} video <url>`,
        `${usedPrefix}${command} info <url>`,
      ].join("\n")
    );
  }

  let mode = "auto";
  let url = args[0];
  if (["audio", "video", "info"].includes(String(args[0]).toLowerCase())) {
    mode = String(args[0]).toLowerCase();
    url = args[1];
  }

  if (!url) throw `Usage:\n${usedPrefix}${command} <url>\n${usedPrefix}${command} audio <url>\n${usedPrefix}${command} video <url>\n${usedPrefix}${command} info <url>`;

  const providerName = detectProvider(url);
  if (!providerName || !providers[providerName]) {
    throw "Unsupported media URL. Supported: TikTok, Instagram, YouTube, X/Twitter, Facebook.";
  }

  await conn.reply(m.chat, "⏳ MediaHub is processing your link...", m);

  const result = await providers[providerName](url, mode);

  if (mode === "info") {
    return conn.sendMessage(
      m.chat,
      {
        text: buildInfoCaption(result, url),
      },
      { quoted: m }
    );
  }

  if (mode === "audio") {
    return sendAudio(conn, m, result);
  }

  if (mode === "video") {
    return sendVideo(conn, m, result);
  }

  return sendAuto(conn, m, result);
};

handler.help = ["media <url>", "media audio <url>", "media video <url>", "media info <url>"];
handler.tags = ["downloader"];
handler.command = /^(media|mediahub)$/i;
handler.limit = true;

export default handler;
