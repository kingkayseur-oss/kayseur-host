
const config = require('../../config');
const { toKayseurFont } = require('../font');

const CHANNEL_LINK = 'https://whatsapp.com/channel/0029VbDvPxj0VycNWTvOrE0x';

function getMenu(pushName = 'Utilisateur') {
    const p = config.prefix || '🍓';

    const categories = [
        {
            title: '01 • MUSIQUE & MÉDIAS',
            commands: [
                'play', 'song', 'ytmp3', 'video', 'ytmp4',
                'music', 'lyrics', 'spotify', 'tiktok', 'igdl',
                'fbdl', 'pinterest', 'anime', 'manga', 'bass'
            ]
        },
        {
            title: '02 • STICKERS & ÉCRITURE',
            commands: [
                'sticker', 's', 'asticker', 'take', 'steal',
                'toimg', 'togif', 'attp', 'ttp', 'emojimix',
                'font', 'style', 'fancy', 'bold', 'glitch'
            ]
        },
        {
            title: '03 • GROUPES & ADMINISTRATION',
            commands: [
                'kick', 'add', 'promote', 'demote', 'open',
                'close', 'tagall', 'hidetag', 'link', 'revoke',
                'welcome', 'goodbye', 'antilink', 'antibot', 'mute',
                'unmute', 'setname', 'setdesc', 'groupinfo', 'purge'
            ]
        },
        {
            title: '04 • BOT & PROPRIÉTAIRE',
            commands: [
                'public', 'private', 'self', 'owner', 'block',
                'unblock', 'bc', 'join', 'leave', 'setpp',
                'setbio', 'restart', 'ping', 'alive', 'runtime'
            ]
        },
        {
            title: '05 • OUTILS & INTELLIGENCE ARTIFICIELLE',
            commands: [
                'ai', 'gpt', 'imagine', 'translate', 'tts',
                'qr', 'readqr', 'calc', 'weather', 'wiki',
                'google', 'shorturl', 'screenshot', 'github', 'npm',
                'encode', 'decode', 'binary', 'password', 'define'
            ]
        },
        {
            title: '06 • JEUX & DIVERTISSEMENT',
            commands: [
                'quiz', 'devinette', 'trueorfalse', 'roulette', 'slot',
                'dice', 'coin', '8ball', 'ship', 'gay',
                'love', 'joke', 'fact', 'quote', 'roast'
            ]
        }
    ];

    const total = categories.reduce(
        (sum, category) => sum + category.commands.length,
        0
    );

    let menu = '';

    menu += '╭━━━━━━━━━━━━━━━━━━━━━━╮\n';
    menu += '       🍓  K A Y S E U R  M D X\n';
    menu += '╰━━━━━━━━━━━━━━━━━━━━━━╯\n\n';

    menu += '┏━━━━━━━━〔 👑 PROFIL 〕━━━━━━━━┓\n';
    menu += `┃ 👑 Propriétaire : ${config.ownerName}\n`;
    menu += `┃ 👤 Utilisateur : ${toKayseurFont(pushName)}\n`;
    menu += `┃ 🤖 Bot : ${config.botName}\n`;
    menu += `┃ 🍓 Préfixe : ${p}\n`;
    menu += `┃ 🌐 Mode : ${config.publicMode ? 'PUBLIC' : 'PRIVÉ'}\n`;
    menu += `┃ 📚 Commandes : ${total}\n`;
    menu += '┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n';

    for (const category of categories) {
        menu += `┏━━〔 ${category.title} 〕━━┓\n`;

        for (let i = 0; i < category.commands.length; i += 2) {
            const first = category.commands[i];
            const second = category.commands[i + 1];

            let line = `┃ 🍓 ${p}${first}`;

            if (second) {
                line += `   🍓 ${p}${second}`;
            }

            menu += line + '\n';
        }

        menu += '┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n';
    }

    menu += '┏━━━━━━━━〔 📢 NOS RÉSEAUX 〕━━━━━━━━┓\n';
    menu += `┃ WhatsApp : ${CHANNEL_LINK}\n`;
    menu += '> ┃ Développeur : MR KING KAYSEUR\n';
    menu += '┃ THE GLITCH DEV 🍓\n';
    menu += '┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n';

    menu += '╭━━━━━━━━━━━━━━━━━━━━━━╮\n';
    menu += '     ⚡ UNE FAMILLE • UNE FORCE\n';
    menu += '        UNE DESTINÉE ⚡\n';
    menu += '╰━━━━━━━━━━━━━━━━━━━━━━╯';

    return menu;
}

module.exports = { getMenu };
