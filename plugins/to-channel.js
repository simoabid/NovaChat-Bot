async function handler(m, { conn, text }) {
    try {
        // Show loading reaction
        await conn.sendMessage(m.chat, { react: { text: '🕐', key: m.key } });

        const isMedia = m.quoted && (m.quoted.mimetype || m.quoted.isMedia);
        const type = m.quoted?.mimetype || '';
        const contentText = text?.trim();
        const idsal = '120363285847738492@newsletter'; // Your channel ID
        const pushname = m.pushName || 'User';

        // Block message if it contains banned words
        const bannedWords = ['bokep', 'panel', 'jual', 'promo', 'discount', 'diskon', 'top up', 'topup', 'cheat', 'casino', 'slot'];
        const containsBannedWord = bannedWords.some(word => contentText?.toLowerCase().includes(word));

        if (containsBannedWord) {
            await conn.reply(m.chat, 'Message blocked due to forbidden words.', m);
            try {
                await conn.groupParticipantsUpdate(m.chat, [m.sender], 'remove');
            } catch {
                await conn.reply(m.chat, 'Failed to kick user, check bot permissions.', m);
            }
            return;
        }

        // Get user profile picture
        let ppuser;
        try {
            ppuser = await conn.profilePictureUrl(m.sender, 'image');
        } catch {
            ppuser = 'https://picsur.ovh/i/c0948522-2092-4dc6-91fb-8644072e922f.jpg';
        }

        // Message context info
        const ctx = {
            mentionedJid: [m.sender],
            forwardingScore: 9999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: idsal,
                serverMessageId: 20,
                newsletterName: 'NovaChat-Bot By SeeMoo',
            },
            externalAdReply: {
                title: pushname,
                body: `NovaChat-Bot is active.`,
                thumbnailUrl: ppuser,
                mediaType: 1,
                sourceUrl: 'https://wa.me/212676226120'
            }
        };

        // Handle media
        if (isMedia) {
            const media = await m.quoted.download(true); // Use `download()` to download media
            if (/image/.test(type)) {
                await conn.sendMessage(idsal, { image: { url: media }, caption: contentText || '', contextInfo: ctx });
            } else if (/video/.test(type)) {
                await conn.sendMessage(idsal, { video: { url: media }, caption: contentText || '', contextInfo: ctx });
            } else if (/audio/.test(type)) {
                await conn.sendMessage(idsal, { audio: { url: media }, mimetype: 'audio/mp4', ptt: true, contextInfo: ctx });
            } else if (/sticker/.test(type)) {
                await conn.sendMessage(idsal, { sticker: { url: media }, contextInfo: ctx });
            } else if (/application/.test(type)) {
                await conn.sendMessage(idsal, { document: { url: media }, mimetype: type, fileName: 'File.pdf', contextInfo: ctx });
            } else {
                await conn.reply(m.chat, "Unsupported format.", m);
            }
        } else if (contentText) {
            await conn.sendMessage(idsal, { text: contentText, contextInfo: ctx });
        } else {
            await conn.reply(m.chat, "Send text or reply to media.", m);
        }

        // Done reaction
        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

    } catch (err) {
        await conn.reply(m.chat, `❌ Error\nError log: ${err}`, m);
    }
}

handler.command = ['to-channel'];
handler.help = ['to-channel'];
handler.tags = ['owner'];
handler.owner = true;
export default handler;
