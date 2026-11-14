
const { Telegraf } = require('telegraf');
const config = require('../config');

const token = process.env.TELEGRAM_BOT_TOKEN;

let bot = null;

if (token && token !== 'VOTRE_TOKEN_TELEGRAM') {
    try {
        bot = new Telegraf(token);

        bot.start(async (ctx) => {
            await ctx.reply(
                `⚡ ʙɪᴇɴᴠᴇɴᴜᴇ sᴜʀ ʟᴇ ʙᴏᴛ ᴛᴇʟᴇɢʀᴀᴍ ᴅᴇ ʟɪᴀɪsᴏɴ ${config.botName} !\n\nᴄʟɪǫᴜᴇᴢ ᴄɪ-ᴅᴇssᴏᴜs ᴘᴏᴜʀ ᴄᴏɴɴᴇᴄᴛᴇʀ ᴠᴏᴛʀᴇ ᴡʜᴀᴛsᴀᴘᴘ.`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{
                                text: "🔗 ᴏᴜᴠʀɪʀ ʟᴇ sɪᴛᴇ ᴅᴇ ᴘᴀɪʀɪɴɢ",
                                url: process.env.RENDER_EXTERNAL_URL ||
                                     process.env.VERCEL_URL ||
                                     "https://kayseur-mdx-pair.vercel.app"
                            }],
                            [{
                                text: "📢 ᴠᴏɪʀ ʟᴀ ᴄʜᴀɪɴᴇ",
                                url: config.channelLink
                            }]
                        ]
                    }
                }
            );
        });

        bot.launch()
            .then(() => {
                console.log("✅ Bot Telegram démarré avec succès.");
            })
            .catch(err => {
                console.error("⚠️ Erreur de lancement Telegram :", err.message);
            });

    } catch (e) {
        console.error("⚠️ Erreur Telegram :", e.message);
    }
} else {
    console.log(
        "ℹ️ Aucun token Telegram détecté, le bot continue sans Telegram."
    );
}

module.exports = bot;
