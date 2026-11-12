const { Telegraf } = require('telegraf');
const config = require('../config');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || 'VOTRE_TOKEN_TELEGRAM');

bot.start((ctx) => {
    ctx.reply(`⚡ ʙɪᴇɴᴠᴇɴᴜᴇ sᴜʀ ʟᴇ ʙᴏᴛ ᴛᴇʟᴇɢʀᴀᴍ ᴅᴇ ʟɪᴀɪsᴏɴ ${config.botName} !\n\nᴄʟɪǫᴜᴇᴢ ᴄɪ-ᴅᴇssᴏᴜs ᴘᴏᴜʀ ᴄᴏɴɴᴇᴄᴛᴇʀ ᴠᴏᴛʀᴇ ᴡʜᴀᴛsᴀᴘᴘ.`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🔗 ᴏᴜᴠʀɪʀ ʟᴇ sɪᴛᴇ ᴅᴇ ᴘᴀɪʀɪɴɢ", url: process.env.VERCEL_URL || "https://votre-app.vercel.app" }],
                [{ text: "📢 ᴠᴏɪʀ ʟᴀ ᴄʜᴀɪɴᴇ", url: config.channelLink }]
            ]
        }
    });
});

module.exports = bot;