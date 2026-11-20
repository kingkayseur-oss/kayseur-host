
const { Telegraf } = require('telegraf');
const config = require('../config');

const token = process.env.TELEGRAM_BOT_TOKEN;

let bot = null;

if (token) {
    try {
        bot = new Telegraf(token);

        bot.start(async (ctx) => {
            await ctx.reply(
                `⚡ Bienvenue sur le bot Telegram de liaison ${config.botName} !\n\nCliquez ci-dessous pour connecter votre WhatsApp.`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: '🔗 OUVRIR LE SITE DE PAIRING',
                                    url:
                                        process.env.RENDER_EXTERNAL_URL ||
                                        process.env.VERCEL_URL ||
                                        'https://kayseur-mdx-pair.onrender.com'
                                }
                            ],
                            [
                                {
                                    text: '📢 VOIR LA CHAÎNE',
                                    url: config.channelLink
                                }
                            ]
                        ]
                    }
                }
            );
        });

    } catch (error) {
        console.error('[TELEGRAM ERROR]', error.message);
        bot = null;
    }
} else {
    console.log('[TELEGRAM] Aucun token détecté.');
}

module.exports = bot;
