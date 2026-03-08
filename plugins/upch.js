
import fetch from 'node-fetch'

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        throw `Example:\n${usedPrefix + command} Hello world`
    }

    const idch = '120363285847738492@newsletter'
    const thumbUrl = 'https://picsur.ovh/i/c0948522-2092-4dc6-91fb-8644072e922f.jpg'

    let thumbnail = await fetch(thumbUrl)
        .then(res => res.buffer())
        .catch(() => null)

    await conn.sendMessage(m.chat, {
        react: { text: '😒', key: m.key }
    })

    let content = {
        text: text,
        contextInfo: {
            externalAdReply: {
                title: 'NovaChat-Bot By SeeMoo',
                body: 'https://instagram.com/simoabiid',
                thumbnail: thumbnail,
                mediaType: 1,
                renderLargerThumbnail: true,
                showAdAttribution: false
            }
        }
    }

    await conn.sendMessage(idch, content)

    await conn.sendMessage(m.chat, {
        react: { text: '✅', key: m.key }
    })

    m.reply('✅ Done. If you keep asking, that’s outside the system.')
}

handler.command = /^(upch)$/i
handler.help = ['upch']
handler.tags = ['owner']
handler.mods = true

export default handler
