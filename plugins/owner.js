import fetch from 'node-fetch'
let handler = async (m, { conn }) => {
  let caption = `
*「 معلومات عن صاحب البوت 」*\n\n
*Whatsapp :*\n https://wa.me/212676226120

*Instagram :*\ninstagram.com/simoabiid

*Linkedin :*\nlinkedin.com/in/mohamed-amine-abidd

*Facebook :*\nwww.facebook.com/simoabidx

*Github :* \ngithub.com/simoabid

`.trim()
  m.reply(caption)
}
handler.help = ['owner']
handler.tags = ['infobot']
handler.command = /^(owner)$/i
handler.limit = false

export default handler
