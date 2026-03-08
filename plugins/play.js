// plugin from  Toxic-v2/xhclintohn thanks 🌟
// re-modified by instagram.com/simoabiid

let handler = async (m, { conn, text }) => {
  try {
    if (!text) {
      return m.reply(
        "🎵 *Spotify Play Command*\n\n" +
        "You must provide a song name.\n\n" +
        "📌 Example:\n" +
        ".play Blinding Lights\n\n" +
        "This command searches Spotify, downloads the song, and sends you the audio."
      );
    }

    if (text.length > 100) {
      return m.reply("❌ Song title is too long. Please keep it under 100 characters.");
    }

    await conn.sendMessage(m.chat, {
      react: { text: '⌛', key: m.key }
    });

    const res = await fetch(
      `https://api.ootaizumi.web.id/downloader/spotifyplay?query=${encodeURIComponent(text)}`
    );
    const json = await res.json();

    if (!json.status || !json.result?.download) {
      await conn.sendMessage(m.chat, {
        react: { text: '❌', key: m.key }
      });
      return m.reply(`❌ No results found for: *${text}*`);
    }

    const song = json.result;
    const title = song.title || "Unknown Song";
    const artist = song.artists || "Unknown Artist";
    const audioUrl = song.download;

    await conn.sendMessage(m.chat, {
      react: { text: '✅', key: m.key }
    });

    // Send audio (playable)
    await conn.sendMessage(
      m.chat,
      {
        audio: { url: audioUrl },
        mimetype: "audio/mpeg",
        fileName: `${title}.mp3`,
        contextInfo: {
          externalAdReply: {
            title: title.substring(0, 30),
            body: artist.substring(0, 30),
            thumbnailUrl: song.image || "",
            sourceUrl: song.external_url || "",
            mediaType: 1,
            renderLargerThumbnail: true
          }
        }
      },
      { quoted: m }
    );

    // Send as document (downloadable)
    await conn.sendMessage(
      m.chat,
      {
        document: { url: audioUrl },
        mimetype: "audio/mpeg",
        fileName: `${title.replace(/[<>:"/\\|?*]/g, "_")}.mp3`,
        caption: `🎵 *${title}*\n👤 ${artist}\n\nDownloaded via Spotify Play`
      },
      { quoted: m }
    );

  } catch (e) {
    console.error("Spotify Play Error:", e);
    await conn.sendMessage(m.chat, {
      react: { text: '❌', key: m.key }
    });
    m.reply(`❌ Failed to download the song.\n\nError: ${e.message}`);
  }
};

handler.help = ["play"];

handler.command = ['play'];

handler.tags = ['downloader'];

handler.limit = true;

export default handler;
