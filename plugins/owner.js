import fetch from 'node-fetch'
let handler = async (m, { conn }) => {
  let caption = `
*「 معلومات عن صاحب البوت 」*\n\n
*Whatsapp channel:*\n https://wa.me/212676226120\n
*instagram:*\ninstagram.com/simoabiid

*youtube:*\nyoutube.com/@simoabid

*facebook page:*\nwww.facebook.com/simoabidx

*script bot :* github.com/simoabiid

`.trim()
  m.reply(caption)
}
handler.help = ['owner']
handler.tags = ['infobot']
handler.command = /^(owner)$/i
handler.limit = false

export default handler
