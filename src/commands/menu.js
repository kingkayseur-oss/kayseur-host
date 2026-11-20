
const { toKayseurFont } = require('../font');
const config = require('../../config');

async function sendMainMenu(sock, mek, pushName) {
    const remoteJid = mek.key.remoteJid;

    const sections = [
        {
            title: '1. ADMIN & GROUPE',
            commands: [
                'kick', 'purge', 'add', 'promote', 'demote',
                'tagall', 'hidetag', 'antilink', 'mute', 'unmute',
                'warn', 'warnings', 'resetwarn', 'groupinfo',
                'admins', 'members', 'setname', 'setdesc',
                'open', 'close'
            ]
        },
        {
            title: '2. TÉLÉCHARGEMENT & MUSIQUE',
            commands: [
                'play', 'song', 'audio', 'video', 'tiktok',
                'insta', 'fb', 'ytsearch', 'spotify', 'lyrics',
                'playlist', 'soundcloud', 'media', 'yts', 'musicinfo'
            ]
        },
        {
            title: '3. STICKERS & IMAGES',
            commands: [
                'sticker', 's', 'toimg', 'tovideo', 'togif',
                'emojimix', 'blur', 'pixelate', 'crop', 'circle',
                'wanted', 'trigger', 'wasted', 'meme', 'take'
            ]
        },
        {
            title: '4. OUTILS & INTELLIGENCE ARTIFICIELLE',
            commands: [
                'ai', 'ask', 'translate', 'define', 'weather',
                'calculate', 'shorturl', 'qr', 'readqr', 'tts',
                'ping', 'runtime', 'system', 'owner', 'repo'
            ]
        },
        {
            title: '5. UTILITAIRES & DIVERS',
            commands: [
                'menu', 'help', 'info', 'profile', 'vv',
                'save', 'delete', 'report', 'bug', 'feedback',
                'ban', 'unban', 'block', 'unblock', 'contact'
            ]
        },
        {
            title: '6. PROPRIÉTAIRE & CONFIGURATION',
            commands: [
                'setprefix', 'setnamebot', 'setowner', 'public',
                'private', 'restart', 'shutdown', 'setpp', 'getpp',
                'backup', 'antispam', 'welcome', 'goodbye',
                'setwelcome', 'setgoodbye', 'antilinkmode',
                'autoread', 'autoreact', 'autotyping', 'stats'
            ]
        }
    ];

    const commandCount = sections.reduce(
        (total, section) => total + section.commands.length,
        0
    );

    const menuCaption = `
╭━━〔 👑 KAYSEUR MDX 〕━━╮
┃
┃  ⚡ ${toKayseurFont('MENU PRINCIPAL')}
┃  👤 Utilisateur : ${pushName}
┃  👑 Propriétaire : ${config.ownerName || 'MR KING KAYSEUR'}
┃  🍓 Préfixe : ${config.prefix || '.'}
┃  📚 Commandes : ${commandCount}
┃
╰━━━━━━━━━━━━━━━━━━╯

${sections.map(section => `
╭── 「 ${toKayseurFont(section.title)} 」 ──
${section.commands.map(command => `│ ➤ ${toKayseurFont(command)}`).join('\n')}
╰━━━━━━━━━━━━━━━━━━`).join('\n')}

╭━━〔 📢 OFFICIAL CHANNEL 〕━━╮
┃
┃  ${toKayseurFont('REJOINS NOTRE CHAÎNE')}
┃  ${config.channelLink || 'Lien non configuré'}
┃
╰━━━━━━━━━━━━━━━━━━╯

> ${toKayseurFont('POWERED BY MR KING KAYSEUR THE GLITCH DEV')}
`.trim();

    const imageUrl = 'https://files.catbox.moe/47dngj.jpg';
    const channelLink = config.channelLink || '';

    const message = {
        image: { url: imageUrl },
        caption: menuCaption
    };

    if (/^https?:\/\//i.test(channelLink)) {
        message.templateButtons = [
            {
                index: 1,
                urlButton: {
                    displayText: '📢 VOIR LA CHAÎNE WHATSAPP',
                    url: channelLink
                }
            }
        ];
    }

    await sock.sendMessage(remoteJid, message, {
        quoted: mek
    });
}

module.exports = { sendMainMenu };
