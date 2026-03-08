// plugin by instagram.com/simoabiid
// scrape by malik

import axios from "axios";

class DeepSeek {
  constructor() {
    this.api = axios.create({
      baseURL: "https://ark.cn-beijing.volces.com/api/v3",
      headers: {
        Authorization: "Bearer 937e9831-d15e-4674-8bd3-a30be3e148e9", // ⚠️ Move this to env variable in production
        "Content-Type": "application/json",
        "User-Agent": "okhttp/4.12.0"
      }
    });
    this.history = [];
  }

  async chat({ prompt, messages, ...rest }) {
    const msg = messages || this.history;
    const model = rest.model ? rest.model : "deepseek-v3-1-250821";

    msg.push({
      role: "user",
      content: prompt || ""
    });

    try {
      const { data } = await this.api.post("/chat/completions", {
        model: model,
        messages: msg,
        max_tokens: rest.max_tokens || 1024,
        temperature: rest.temperature ?? 0.1
      });

      const result = data?.choices?.[0]?.message?.content || "";

      if (result) {
        msg.push({
          role: "assistant",
          content: result
        });
      }

      return {
        result,
        history: msg,
        info: {
          id: data?.id,
          usage: data?.usage,
          model: data?.model
        }
      };

    } catch (error) {
      throw new Error(error?.response?.data?.error?.message || error.message);
    }
  }
}

let handler = async (m, { conn, text }) => {
  if (!text) {
    return conn.reply(
      m.chat,
      `❗ Please provide a prompt.\n\nExample:\n.deepseek Explain quantum computing in simple terms`,
      m
    );
  }

  const api = new DeepSeek();

  try {
    await conn.reply(m.chat, "⏳ Processing your request...", m);

    const response = await api.chat({
      prompt: text
    });

    const result = response.result || "No response received.";

    await conn.reply(m.chat, `🤖 *DeepSeek AI Response:*\n\n${result}`, m);

  } catch (err) {
    await conn.reply(m.chat, `❌ Error:\n${err.message}`, m);
  }
};

handler.help = ['deepseek'];
handler.command = ['deepseek'];
handler.tags = ['ai'];
handler.limit = true;

export default handler;
