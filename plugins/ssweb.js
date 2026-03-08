import axios from 'axios';
async function Screenshot(url) {
    try {
        const response = await axios.get(`https://image.thum.io/get/png/fullpage/viewportWidth/2400/${url}`, {
            responseType: 'arraybuffer'
        });

        return {
            status: 200,
            type: 'image/png',
            buffer: response.data
        };
    } catch (err) {
        throw Error(err.message);
    }
}

let handler = async (m, { args, conn }) => {
    if (!args[0]) return m.reply('Please provide a website URL\n\n*Example:* .ssweb https://instagram.com/simoabiid');

    try {
        let result = await Screenshot(args[0]);

        await conn.sendMessage(m.chat, { 
            image: result.buffer
        }, { quoted: m });
    } catch (e) {
        m.reply('Error');
    }
};

handler.help = ['ssweb'];
handler.command = ['ssweb'];
handler.tags = ['tools'];

export default handler;
