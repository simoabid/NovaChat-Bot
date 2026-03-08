
let handler = async (m, { conn }) => {
  const teks = `📦 *رابط السورس كود الخاص بالبوت:*\n` +
    `https://github.com/simoabid/NovaChat-Bot\n\n` +
    `📢 *القناة الرسمية على واتساب:*\n` +
    `https://wa.me/212676226120\n\n` +
    `⭐ لا تنسَ وضع نجمة على المستودع إذا أعجبك المشروع!`;

  await conn.reply(m.chat, teks, m);
};

handler.help = handler.command = ['sc','script'];
handler.tags = ['tools'];
handler.limit = true;
export default handler;
