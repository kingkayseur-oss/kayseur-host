
const config = require('../../config');
const { toKayseurFont } = require('../font');

function getMenu(pushName = 'Utilisateur') {
    const p = config.prefix || '🍓';

    const categories = [
        {
            title: '👥 COMMANDES GROUPE',
            commands: [
                'kick', 'add', 'promote', 'demote',
                'open', 'close', 'tagall', 'hidetag',
                'link', 'revoke', 'welcome', 'goodbye',
                'antilink', 'antibot', 'mute', 'unmute',
                'setname', 'setdesc', 'groupinfo', 'purge'
            ]
        },
        {
            title: '🎵 MUSIQUE & MÉDIAS',
            commands: [
                'play', 'song', 'ytmp3', 'video', 'ytmp4',
                'music', 'lyrics', 'spotify', 'tiktok', 'igdl',
                'fbdl', 'pinterest', 'anime', 'manga', 'bass'
            ]
        },
        {
            title: '🎨 STICKERS & TEXTE',
            commands: [
                'sticker', 's', 'asticker', 'take', 'steal',
                'toimg', 'togif', 'attp', 'ttp', 'emojimix',
                'font', 'style', 'fancy', 'bold', 'glitch'
            ]
        },
        {
            title: '👑 BOT & PROPRIÉTAIRE',
            commands: [
                'public', 'private', 'self', 'owner', 'block',
                'unblock', 'bc', 'join', 'leave', 'setpp',
                'setbio', 'restart', 'ping', 'alive', 'runtime'
            ]
        },
        {
            title: '🛠️ OUTILS & IA',
            commands: [
                'ai', 'gpt', 'imagine', 'translate', 'tts',
                'qr', 'readqr', 'calc', 'weather', 'wiki',
                'google', 'shorturl', 'screenshot', 'github',
                'npm', 'encode', 'decode', 'binary',
                'password', 'define'
            ]
        },
        {
            title: '🎮 JEUX & DIVERTISSEMENT',
            commands: [
                'quiz', 'devinette', 'trueorfalse', 'roulette',
                'slot', 'dice', 'coin', '8ball', 'ship',
                'gay', 'love', 'joke', 'fact', 'quote', 'roast'
            ]
        }
    ];

    const total = categories.reduce(
        (sum, category) => sum + category.commands.length, 0
    );

    let menu = '';

    menu += '╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮\n';
    menu += '       🍓 KAYSEUR MDX\n';
    menu += '       THE GLITCH DEV\n';
    menu += '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n';

    menu += '╭━━〔 👑 INFORMATIONS 〕━━╮\n';
    menu += `┃ Propriétaire : ${config.ownerName}\n`;
    menu += `┃ Utilisateur : ${toKayseurFont(pushName)}\n`;
    menu += `┃ Bot : ${config.botName}\n`;
    menu += `┃ Préfixe : ${p}\n`;
    menu += `┃ Mode : ${config.publicMode ? 'PUBLIC' : 'PRIVÉ'}\n`;
    menu += `┃ Total : ${total} commandes\n`;
    menu += '╰━━━━━━━━━━━━━━━━━━━━━━╯\n\n';

    for (const category of categories) {
        menu += `╭━━〔 ${category.title} 〕━━╮\n`;

        for (let i = 0; i < category.commands.length; i += 2) {
            const first = category.commands[i];
            const second = category.commands[i + 1];

            let row = `┃ 🍓 ${p}${first}`;

            if (second) {
                row += `     🍓 ${p}${second}`;
            }

            menu += row + '\n';
        }

        menu += '╰━━━━━━━━━━━━━━━━━━━━━━╯\n\n';
    }

    menu += '💀 MR KING KAYSEUR THE GLITCH DEV';

    return menu;
}

module.exports = { getMenu };
