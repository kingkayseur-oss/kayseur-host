const { sendMainMenu } = require('./menu');

async function handleCommand(sock, mek, body, command, args, pushName) {
    const remoteJid = mek.key.remoteJid;

    switch (command) {
        // --- MENU ---
        case 'menu':
        case 'help': {
            await sendMainMenu(sock, mek, pushName);
            break;
        }

        // --- 1. ADMIN & GROUPE ---
        case 'kick':
        case 'add':
        case 'promote':
        case 'demote':
        case 'tagall':
        case 'hidetag':
        case 'antilink': {
            await sock.sendMessage(remoteJid, { text: `⚙️ Exécution de la commande administrative : .${command}` }, { quoted: mek });
            break;
        }

        // --- 2. TÉLÉCHARGEMENT ---
        case 'play':
        case 'video':
        case 'tiktok':
        case 'insta':
        case 'fb': {
            await sock.sendMessage(remoteJid, { text: `📥 Traitement du téléchargement pour : .${command}` }, { quoted: mek });
            break;
        }

        // --- 3. OUTILS & IA ---
        case 'ai':
        case 'sticker':
        case 'toimg':
        case 'vv':
        case 'ping': {
            if (command === 'ping') {
                await sock.sendMessage(remoteJid, { text: 'Pong! 🏓 Le bot est bien en ligne.' }, { quoted: mek });
            } else {
                await sock.sendMessage(remoteJid, { text: `✨ Exécution de l'outil : .${command}` }, { quoted: mek });
            }
            break;
        }

        // --- 4. BUG & DIVERS ---
        case 'ban':
        case 'unban':
        case 'bug': {
            await sock.sendMessage(remoteJid, { text: `⚠️ Traitement de la commande : .${command}` }, { quoted: mek });
            break;
        }

        default: {
            console.log(`[COMMANDE INCONNUE] : ${command}`);
            break;
        }
    }
}

module.exports = { handleCommand };
