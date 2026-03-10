import axios from "axios";
import crypto from "crypto";

const ROUTES = {
  deepseek: "deepseek",
  code: "deepseek",
  gemini: "gemini-v2",
  "gemini-v2": "gemini-v2",
  openai: "openai",
  chatgpt: "openai",
  summarize: "summarize",
  summary: "summarize",
  translate: "translate",
  translation: "translate",
  research: "research",
  prompt: "promptenhance",
  "image-prompt": "promptenhance",
  promptenhance: "promptenhance",
  img2prompt: "img2prompt",
  analyze: "research",
};

function detectTask(prompt, hasImage = false) {
  const text = String(prompt || "").trim().toLowerCase();

  if (hasImage && /prompt|describe this image|turn this image into prompt/.test(text)) {
    return "img2prompt";
  }
  if (hasImage) return "research";
  if (/^translate\b|translation\b|to arabic|to english|ترجم|ترجمة/.test(text)) return "translate";
  if (/^summari[sz]e\b|tl;dr|short summary|لخص|تلخيص/.test(text)) return "summarize";
  if (/research|compare|pros and cons|analyze|analysis|study|investigate|بحث|قارن/.test(text)) return "research";
  if (/code|debug|bug|fix|refactor|function|regex|script|javascript|python|node|api|stack trace/.test(text)) {
    return "deepseek";
  }
  if (/prompt|improve prompt|enhance prompt|image prompt|midjourney|sdxl|flux/.test(text)) {
    return "promptenhance";
  }
  return "openai";
}

function parseInput(text = "") {
  const parts = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { route: null, prompt: "" };

  const first = parts[0].toLowerCase();
  if (ROUTES[first]) {
    return {
      route: ROUTES[first],
      prompt: parts.slice(1).join(" ").trim(),
    };
  }

  return {
    route: null,
    prompt: String(text || "").trim(),
  };
}

async function getQuotedImageDataUrl(m) {
  const q = m.quoted ? m.quoted : null;
  const mime = (q?.msg || q)?.mimetype || "";
  if (!mime || !/image\/(jpe?g|png|webp)/i.test(mime)) return null;
  const media = await q.download();
  return `data:${mime};base64,${media.toString("base64")}`;
}

async function askDeepSeek(prompt, model = "deepseek-v3-1-250821") {
  const { data } = await axios.post(
    "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    {
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1200,
      temperature: 0.2,
    },
    {
      headers: {
        Authorization: "Bearer 937e9831-d15e-4674-8bd3-a30be3e148e9",
        "Content-Type": "application/json",
        "User-Agent": "okhttp/4.12.0",
      },
      timeout: 45000,
    }
  );

  return {
    provider: "DeepSeek",
    model: data?.model || model,
    text: data?.choices?.[0]?.message?.content || "No response received.",
  };
}

async function askGeminiV2(prompt, imageDataUrl = null, model = "gemini-2.0-flash-lite") {
  const parts = [];
  if (imageDataUrl) {
    const [, mimeType = "image/jpeg", base64 = ""] =
      imageDataUrl.match(/^data:(.*?);base64,(.*)$/) || [];
    parts.push({
      inline_data: {
        mime_type: mimeType,
        data: base64,
      },
    });
  }
  parts.push({ text: prompt });

  const { data } = await axios.post(
    "https://us-central1-infinite-chain-295909.cloudfunctions.net/gemini-proxy-staging-v1",
    { contents: [{ parts }] },
    {
      headers: {
        accept: "*/*",
        "accept-language": "id-ID,id;q=0.9",
        "content-type": "application/json",
        priority: "u=1, i",
        "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "cross-site",
        "user-agent":
          "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
      },
      timeout: 45000,
    }
  );

  return {
    provider: "Gemini",
    model,
    text: data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response from Gemini API.",
  };
}

async function askOpenAIProxy(prompt) {
  const now = new Date();
  const logic = `You are an AI assistant for NovaChat. Date: ${now.toDateString()}. Be concise, useful, and clear.`;

  const { data } = await axios.post(
    "https://chateverywhere.app/api/chat/",
    {
      model: {
        id: "gpt-4",
        name: "GPT-4",
        maxLength: 32000,
        tokenLimit: 8000,
        completionTokenLimit: 5000,
        deploymentName: "gpt-4",
      },
      messages: [{ pluginId: null, content: prompt, role: "user" }],
      prompt: logic,
      temperature: 0.5,
    },
    {
      headers: {
        Accept: "*/*",
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      },
      timeout: 45000,
    }
  );

  return {
    provider: "OpenAI",
    model: "gpt-4-proxy",
    text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
  };
}

async function translapp(module, inputText, to = "") {
  const shorten = (input) => (input.length >= 5 ? input.substring(0, 5) : "O".repeat(5 - input.length) + input);
  const hashString = (str) => crypto.createHash("sha256").update(str, "utf8").digest("hex");
  const key = hashString(`${shorten(inputText)}ZERO`);
  const userId = `GALAXY_AI${crypto.randomUUID()}`;

  const { data } = await axios.post(
    "https://translapp.info/ai/g/ask",
    {
      k: key,
      module,
      text: inputText,
      to,
      userId,
    },
    {
      headers: {
        "user-agent": "Postify/1.0.0",
        "content-type": "application/json",
        "accept-language": "en",
      },
      timeout: 45000,
    }
  );

  return {
    provider: "Translapp",
    model: module,
    text: data?.message || "No response.",
  };
}

async function enhancePrompt(prompt, type = "mid") {
  const KEY = "kR9p2sL7mZ3xA1bC5vN8qE4dF6gH2jK3";
  const IV = "a1B2c3D4e5F6g7H8";
  const keyBuffer = Buffer.from(KEY).slice(0, 32);
  const ivBuffer = Buffer.from(IV).slice(0, 16);

  const tokenRes = await axios.get("https://prompthancer.com/api/token", {
    headers: {
      "Content-Type": "application/json",
      Referer: "https://prompthancer.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
    },
    timeout: 30000,
  });

  const cookie =
    tokenRes.headers["set-cookie"]?.map((item) => item.split(";")[0]).join("; ") || "";
  const endpoint =
    type === "basic"
      ? "https://prompthancer.com/api/enhancebasic"
      : "https://prompthancer.com/api/enhancemid";

  const { data } = await axios.post(
    endpoint,
    { originalPrompt: prompt },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenRes.data.token}`,
        Cookie: cookie,
        Origin: "https://prompthancer.com",
        Referer: "https://prompthancer.com/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
      },
      timeout: 45000,
    }
  );

  const decipher = crypto.createDecipheriv("aes-256-cbc", keyBuffer, ivBuffer);
  let decrypted = decipher.update(data.data, "base64", "utf8");
  decrypted += decipher.final("utf8");
  const parsed = JSON.parse(decrypted);

  return {
    provider: "PromptEnhancer",
    model: type,
    text: parsed?.enhancedPrompt || "No enhanced prompt found.",
  };
}

async function imageToPrompt(base64Url) {
  const { data } = await axios.post(
    "https://imageprompt.org/api/ai/prompts/image",
    { base64Url },
    {
      headers: {
        accept: "*/*",
        "content-type": "application/json",
      },
      timeout: 45000,
    }
  );

  return {
    provider: "Img2Prompt",
    model: "imageprompt",
    text: data?.prompt || data || "No prompt generated.",
  };
}

async function runRoute(route, prompt, imageDataUrl) {
  switch (route) {
    case "deepseek":
      return askDeepSeek(prompt);
    case "gemini-v2":
      return askGeminiV2(prompt, imageDataUrl);
    case "openai":
      return askOpenAIProxy(prompt);
    case "summarize":
      return translapp("SUMMARIZE", prompt);
    case "translate": {
      const match =
        prompt.match(/^([a-z]{2,20}|english|arabic|french|spanish|turkish|hindi)\s*\|\s*([\s\S]+)$/i) ||
        prompt.match(/^to\s+([a-z]{2,20}|english|arabic|french|spanish|turkish|hindi)\s+([\s\S]+)$/i);
      const target = match?.[1] || "English";
      const text = match?.[2] || prompt;
      return translapp("TRANSLATE", text, target);
    }
    case "research":
      return askGeminiV2(
        `Research mode:\nAnalyze carefully, structure the answer clearly, and include practical conclusions.\n\n${prompt}`,
        imageDataUrl
      );
    case "promptenhance":
      return enhancePrompt(prompt, "mid");
    case "img2prompt":
      if (!imageDataUrl) throw new Error("Reply to an image for image-to-prompt mode.");
      return imageToPrompt(imageDataUrl);
    default:
      return askOpenAIProxy(prompt);
  }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text && !m.quoted) {
    return m.reply(
      [
        "*AI Router*",
        "",
        "Usage:",
        `${usedPrefix}${command} <prompt>`,
        `${usedPrefix}${command} <plugin/provider/model> <prompt>`,
        "",
        "Examples:",
        `${usedPrefix}${command} summarize Explain this long paragraph...`,
        `${usedPrefix}${command} translate English | السلام عليكم`,
        `${usedPrefix}${command} deepseek write a nodejs retry helper`,
        `${usedPrefix}${command} research compare Rust vs Go for backend APIs`,
        `${usedPrefix}${command} prompt a cinematic sci-fi poster with neon rain`,
        `${usedPrefix}${command} img2prompt  (reply to image)`,
      ].join("\n")
    );
  }

  const parsed = parseInput(text);
  const imageDataUrl = await getQuotedImageDataUrl(m);
  const route = parsed.route || detectTask(parsed.prompt, Boolean(imageDataUrl));
  const prompt =
    parsed.prompt ||
    (route === "img2prompt" ? "Describe this image as a high-quality generation prompt." : "");

  if (!prompt && route !== "img2prompt") {
    throw "Please provide a prompt.";
  }

  await conn.reply(m.chat, `⏳ AI Router selected: *${route}*`, m);

  try {
    const result = await runRoute(route, prompt, imageDataUrl);
    const header = `*AI Router*\nProvider: ${result.provider}\nModel/Mode: ${result.model}\n`;
    await conn.reply(m.chat, `${header}\n${result.text}`, m);
  } catch (error) {
    await conn.reply(
      m.chat,
      `❌ AI Router failed on *${route}*.\nError: ${error.message || error}`,
      m
    );
  }
};

handler.help = ["ai <prompt>", "ai <route> <prompt>"];
handler.tags = ["ai"];
handler.command = /^(ai|airouter)$/i;
handler.limit = true;

export default handler;
