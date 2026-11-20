
const { Telegraf } = require('telegraf');
const config = require('../config');

const token = String(
  process.env.TELEGRAM_BOT_TOKEN || ''
).trim();

let bot = null;

if (!token) {
  console.log(
    '[TELEGRAM] Aucun token détecté. Telegram désactivé, WhatsApp continue normalement.'
  );
} else {
  try {
    bot = new Telegraf(token);

    bot.start(async (ctx) => {
      try {
        const pairingUrl =
          process.env.RENDER_EXTERNAL_URL ||
          process.env.VERCEL_URL ||
          'https://kayseur-mdx-pair.onrender.com';

        await ctx.reply(
          `⚡ BIENVENUE SUR ${config.botName}\n\n` +
          `🤖 Bot de liaison KAYSEUR MDX\n` +
          `👑 Owner : MR KING KAYSEUR THE GLITCH DEV\n\n` +
          `Clique sur le bouton ci-dessous pour ouvrir le site de pairing.`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '🔗 OUVRIR LE SITE DE PAIRING',
                    url: pairingUrl
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
      } catch (error) {
        console.error(
          '[TELEGRAM START ERROR]',
          error.message
        );
      }
    });

    bot.catch((error) => {
      console.error(
        '[TELEGRAM BOT ERROR]',
        error.message
      );
    });

    console.log(
      '[TELEGRAM] Bot configuré. Le lancement sera effectué par index.js.'
    );
  } catch (error) {
    console.error(
      '[TELEGRAM CONFIG ERROR]',
      error.message
    );

    bot = null;
  }
}

module.exports = bot;
