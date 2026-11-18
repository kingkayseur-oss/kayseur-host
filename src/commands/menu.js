const { toKayseurFont } = require('./font');
const config = require('./config');

async function sendMenu(sock, mek) {
    const remoteJid = mek.key.remoteJid;
    const pushName = mek.pushName || 'Utilisateur';

    const menuCaption = `
 *${toKayseurFont('🚀KAYSEUR_MDX — MENU PRINCIPAL💀')}* 

👤 *Proprio :* ${pushName}
⚡ *Préfixe :* ${config.prefix}

╭── 「 ${toKayseurFont('1. ADMIN & GROUPE')} 」 ──
│ ≫ ${toKayseurFont('kick')}
│ ≫ ${toKayseurFont('add')}
│ ≫ ${toKayseurFont('promote')}
│ ≫ ${toKayseurFont('demote')}
│ ≫ ${toKayseurFont('tagall')}
│ ≫ ${toKayseurFont('hidetag')}
│ ≫ ${toKayseurFont('antilink')}
╰───────────────

╭── 「 ${toKayseurFont('2. TÉLÉCHARGEMENT')} 」 ──
│ ≫ ${toKayseurFont('play')}
│ ≫ ${toKayseurFont('video')}
│ ≫ ${toKayseurFont('tiktok')}
│ ≫ ${toKayseurFont('insta')}
│ ≫ ${toKayseurFont('fb')}
╰───────────────

╭── 「 ${toKayseurFont('3. OUTILS & IA')} 」 ──
│ ≫ ${toKayseurFont('ai')}
│ ≫ ${toKayseurFont('sticker')}
│ ≫ ${toKayseurFont('toimg')}
│ ≫ ${toKayseurFont('vv')}
│ ≫ ${toKayseurFont('ping')}
╰───────────────

╭── 「 ${toKayseurFont('4. BUG & DIVERS')} 」 ──
│ ≫ ${toKayseurFont('ban')}
│ ≫ ${toKayseurFont('unban')}
│ ≫ ${toKayseurFont('bug')}
╰───────────────

> 📢 ${toKayseurFont('Rejoignez notre canal officiel !')}
`.trim();

    // Envoi direct via l'URL de l'image de Catbox
    await sock.sendMessage(remoteJid, {
        image: { url: 'https://files.catbox.moe/47dngj.jpg' },
        caption: menuCaption
    }, { quoted: mek });
}

module.exports = { sendMenu };
