const { sendMainMenu } = require('./menu');
const config = require('../../config');

const startTime = Date.now();

// ======================================
// OUTILS
// ======================================

function getSender(mek) {
    return mek.key.participant || mek.key.remoteJid;
}

function getMentioned(mek) {
    return mek.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
}

function getQuotedParticipant(mek) {
    return mek.message?.extendedTextMessage?.contextInfo?.participant || null;
}

function getNumberFromArgs(args) {
    const number = String(args[0] || '').replace(/\D/g, '');
    return number.length >= 8 ? `${number}@s.whatsapp.net` : null;
}

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    return `${hours}h ${minutes}m ${remainingSeconds}s`;
}

async function reply(sock, remoteJid, mek, text, mentions = []) {
    return sock.sendMessage(
        remoteJid,
        { text, mentions },
        { quoted: mek }
    );
}

async function getGroupData(sock, remoteJid) {
    if (!remoteJid.endsWith('@g.us')) {
        throw new Error('Cette commande fonctionne uniquement dans un groupe.');
    }

    return sock.groupMetadata(remoteJid);
}

async function checkAdmin(sock, remoteJid, mek) {
    const metadata = await getGroupData(sock, remoteJid);
    const sender = getSender(mek);

    const senderData = metadata.participants.find(
        p => p.id === sender || p.jid === sender
    );

    const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';

    const botData = metadata.participants.find(
        p => p.id === botJid || p.jid === botJid
    );

    const senderIsAdmin = Boolean(
        senderData?.admin || senderData?.superadmin
    );

    const botIsAdmin = Boolean(
        botData?.admin || botData?.superadmin
    );

    return {
        metadata,
        sender,
        senderIsAdmin,
        botIsAdmin
    };
}

async function getTarget(mek, args) {
    const mentions = getMentioned(mek);

    if (mentions.length) return mentions[0];

    const quoted = getQuotedParticipant(mek);

    if (quoted) return quoted;

    return getNumberFromArgs(args);
}

// ======================================
// COMMANDES
// ======================================

async function handleCommand(sock, mek, body, command, args, pushName) {
    const remoteJid = mek.key.remoteJid;

    try {
        switch (command) {

            case 'menu':
            case 'help': {
                await sendMainMenu(sock, mek, pushName);
                break;
            }

            case 'kick': {
                const {
                    senderIsAdmin,
                    botIsAdmin
                } = await checkAdmin(sock, remoteJid, mek);

                if (!senderIsAdmin) {
                    return reply(sock, remoteJid, mek,
                        '⛔ Cette commande est réservée aux administrateurs.');
                }

                if (!botIsAdmin) {
                    return reply(sock, remoteJid, mek,
                        '⚠️ KAYSEUR MDX doit être administrateur pour effectuer cette action.');
                }

                const target = await getTarget(mek, args);

                if (!target) {
                    return reply(sock, remoteJid, mek,
                        '❗ Mentionne un membre ou réponds à son message.\n\nExemple : 🍓kick @membre');
                }

                await sock.groupParticipantsUpdate(
                    remoteJid,
                    [target],
                    'remove'
                );

                await reply(sock, remoteJid, mek,
                    `╭━━〔 KAYSEUR MDX 〕━━╮\n┃ ✅ RETRAIT EFFECTUÉ\n┃ 👤 Membre : @${target.split('@')[0]}\n╰━━━━━━━━━━━━━━━━━━`,
                    [target]
                );
                break;
            }

            case 'purge': {
                const {
                    metadata,
                    senderIsAdmin
                } = await checkAdmin(sock, remoteJid, mek);

                if (!senderIsAdmin) {
                    return reply(sock, remoteJid, mek,
                        '⛔ Seuls les administrateurs peuvent utiliser purge.');
                }

                const candidates = metadata.participants.filter(
                    p => !p.admin && !p.superadmin
                );

                if (!candidates.length) {
                    return reply(sock, remoteJid, mek,
                        '✅ Aucun membre non administrateur à examiner.');
                }

                const preview = candidates
                    .slice(0, 30)
                    .map((p, i) =>
                        `${i + 1}. @${p.id.split('@')[0]}`
                    )
                    .join('\n');

                const remaining = candidates.length - 30;

                await reply(
                    sock,
                    remoteJid,
                    mek,
                    `╭━━〔 ⚠️ KAYSEUR PURGE 〕━━╮\n┃ 👥 MEMBRES À EXAMINER : ${candidates.length}\n┃\n${preview}\n${remaining > 0 ? `\n┃ ... et ${remaining} autres membres` : ''}\n┃\n┃ Aucun membre n'a été retiré.\n┃ Utilise kick pour retirer un membre précis.\n╰━━━━━━━━━━━━━━━━━━`,
                    candidates.slice(0, 30).map(p => p.id)
                );

                break;
            }

            case 'add': {
                const { senderIsAdmin, botIsAdmin } =
                    await checkAdmin(sock, remoteJid, mek);

                if (!senderIsAdmin || !botIsAdmin) {
                    return reply(sock, remoteJid, mek,
                        '⛔ L\'administrateur et le bot doivent avoir les permissions nécessaires.');
                }

                const target = getNumberFromArgs(args);

                if (!target) {
                    return reply(sock, remoteJid, mek,
                        '❗ Exemple : 🍓add 242060000000');
                }

                await sock.groupParticipantsUpdate(
                    remoteJid,
                    [target],
                    'add'
                );

                await reply(sock, remoteJid, mek,
                    `📥 Demande d'ajout envoyée pour @${target.split('@')[0]}.`,
                    [target]
                );
                break;
            }

            case 'promote':
            case 'demote': {
                const { senderIsAdmin, botIsAdmin } =
                    await checkAdmin(sock, remoteJid, mek);

                if (!senderIsAdmin || !botIsAdmin) {
                    return reply(sock, remoteJid, mek,
                        '⛔ Permissions administrateur requises.');
                }

                const target = await getTarget(mek, args);

                if (!target) {
                    return reply(sock, remoteJid, mek,
                        `❗ Mentionne un membre.\nExemple : 🍓${command} @membre`);
                }

                await sock.groupParticipantsUpdate(
                    remoteJid,
                    [target],
                    command
                );

                await reply(sock, remoteJid, mek,
                    `✅ @${target.split('@')[0]} : ${command === 'promote' ? 'promotion effectuée' : 'rétrogradation effectuée'}.`,
                    [target]
                );
                break;
            }

            case 'tagall':
            case 'hidetag': {
                const { metadata, senderIsAdmin } =
                    await checkAdmin(sock, remoteJid, mek);

                if (!senderIsAdmin) {
                    return reply(sock, remoteJid, mek,
                        '⛔ Commande réservée aux administrateurs.');
                }

                const mentions = metadata.participants.map(p => p.id);
                const message = args.join(' ') || '📢 Attention à tous les membres !';

                if (command === 'tagall') {
                    const list = mentions
                        .map(jid => `┃ 👤 @${jid.split('@')[0]}`)
                        .join('\n');

                    await sock.sendMessage(remoteJid, {
                        text: `╭━━〔 📢 ANNONCE 〕━━╮\n┃ ${message}\n┃\n${list}\n╰━━━━━━━━━━━━━━━━━━`,
                        mentions
                    }, { quoted: mek });

                } else {
                    await sock.sendMessage(remoteJid, {
                        text: message,
                        mentions
                    }, { quoted: mek });
                }

                break;
            }

            // ==================================
            // INFORMATIONS DU GROUPE
            // ==================================

            case 'groupinfo': {
                if (!remoteJid.endsWith('@g.us')) {
                    return reply(
                        sock,
                        remoteJid,
                        mek,
                        '❌ Cette commande fonctionne uniquement dans un groupe.'
                    );
                }

                try {
                    const metadata = await sock.groupMetadata(remoteJid);

                    let description = 'Aucune description définie';

                    if (metadata.desc && metadata.desc.trim()) {
                        description = metadata.desc.trim();
                    }

                    const admins = metadata.participants.filter(
                        p => p.admin === 'admin' || p.admin === 'superadmin'
                    ).length;

                    const members = metadata.participants.length;

                    const text = `
╭━━〔 ♛ KAYSEUR MDX ♛ 〕━━╮
┃    INFORMATIONS DU GROUPE
╰━━━━━━━━━━━━━━━━━━━━╯

📌 Nom : ${metadata.subject || '@Inconnu'}

📝 DESCRIPTION :
${description}

👥 Membres : ${members}
👑 Administrateurs : ${admins}

╰━━〔 MR KING KAYSEUR 〕━━╯
`.trim();

                    await sock.sendMessage(remoteJid, {
                        text
                    }, { quoted: mek });

                } catch (error) {
                    console.error('[GROUPINFO ERROR]', error);

                    await reply(
                        sock,
                        remoteJid,
                        mek,
                        '❌ Impossible de récupérer les informations du groupe.'
                    );
                }

                break;
            }

            case 'admins': {
                const metadata = await getGroupData(sock, remoteJid);

                const admins = metadata.participants.filter(
                    p => p.admin || p.superadmin
                );

                const mentions = admins.map(p => p.id);

                await reply(sock, remoteJid, mek,
                    `╭━━〔 ADMINISTRATEURS 〕━━╮\n${admins.map(p => `┃ 👑 @${p.id.split('@')[0]}`).join('\n')}\n╰━━━━━━━━━━━━━━━━━━`,
                    mentions
                );
                break;
            }

            case 'members': {
                const metadata = await getGroupData(sock, remoteJid);

                await reply(sock, remoteJid, mek,
                    `👥 Nombre total de membres : ${metadata.participants.length}`
                );
                break;
            }

            case 'open':
            case 'close': {
                const { senderIsAdmin, botIsAdmin } =
                    await checkAdmin(sock, remoteJid, mek);

                if (!senderIsAdmin || !botIsAdmin) {
                    return reply(sock, remoteJid, mek,
                        '⛔ Permissions administrateur requises.');
                }

                await sock.groupSettingUpdate(
                    remoteJid,
                    command === 'open' ? 'not_announcement' : 'announcement'
                );

                await reply(sock, remoteJid, mek,
                    command === 'open'
                        ? '🔓 Le groupe est maintenant ouvert.'
                        : '🔒 Le groupe est maintenant réservé aux administrateurs.'
                );
                break;
            }

            case 'setname': {
                const { senderIsAdmin, botIsAdmin } =
                    await checkAdmin(sock, remoteJid, mek);

                if (!senderIsAdmin || !botIsAdmin) {
                    return reply(sock, remoteJid, mek,
                        '⛔ Permissions administrateur requises.');
                }

                const name = args.join(' ').trim();

                if (!name) {
                    return reply(sock, remoteJid, mek,
                        '❗ Exemple : 🍓setname Nouveau nom');
                }

                await sock.groupUpdateSubject(remoteJid, name);

                await reply(sock, remoteJid, mek,
                    '✅ Nom du groupe modifié.');
                break;
            }

            case 'setdesc': {
                const { senderIsAdmin, botIsAdmin } =
                    await checkAdmin(sock, remoteJid, mek);

                if (!senderIsAdmin || !botIsAdmin) {
                    return reply(sock, remoteJid, mek,
                        '⛔ Permissions administrateur requises.');
                }

                const description = args.join(' ').trim();

                if (!description) {
                    return reply(sock, remoteJid, mek,
                        '❗ Exemple : 🍓setdesc Nouvelle description');
                }

                await sock.groupUpdateDescription(
                    remoteJid,
                    description
                );

                await reply(sock, remoteJid, mek,
                    '✅ Description du groupe modifiée.');
                break;
            }

            case 'antilink':
            case 'antilinkmode': {
                await reply(sock, remoteJid, mek,
                    '⚙️ Le réglage antilink sera activé après intégration de son système de configuration.');
                break;
            }

            case 'ping': {
                const start = Date.now();

                await reply(sock, remoteJid, mek,
                    `🏓 PONG !\n⚡ Réponse : ${Date.now() - start} ms\n👑 KAYSEUR MDX est actif 🚀.`
                );
                break;
            }

            case 'runtime': {
                await reply(sock, remoteJid, mek,
                    `⏱️ Temps de fonctionnement : ${formatDuration(Date.now() - startTime)}`
                );
                break;
            }

            case 'owner': {
                await reply(sock, remoteJid, mek,
                    `👑 PROPRIÉTAIRE : ${config.ownerName || 'MR KING KAYSEUR'}`
                );
                break;
            }

            case 'repo': {
                await reply(sock, remoteJid, mek,
                    '💻 KAYSEUR MDX — Dépôt du projet :\nhttps://github.com/kingkayseur-oss/kayseur-host'
                );
                break;
            }

            case 'play':
            case 'song':
            case 'audio':
            case 'video':
            case 'tiktok':
            case 'insta':
            case 'fb':
            case 'ytsearch':
            case 'spotify':
            case 'lyrics':
            case 'playlist':
            case 'soundcloud':
            case 'media':
            case 'yts':
            case 'musicinfo':
            case 'sticker':
            case 's':
            case 'toimg':
            case 'tovideo':
            case 'togif':
            case 'emojimix':
            case 'blur':
            case 'pixelate':
            case 'crop':
            case 'circle':
            case 'wanted':
            case 'trigger':
            case 'wasted':
            case 'meme':
            case 'take':
            case 'ai':
            case 'ask':
            case 'translate':
            case 'define':
            case 'weather':
            case 'calculate':
            case 'shorturl':
            case 'qr':
            case 'readqr':
            case 'tts':
            case 'system':
            case 'profile':
            case 'vv':
            case 'save':
            case 'delete':
            case 'report':
            case 'bug':
            case 'feedback':
            case 'ban':
            case 'unban':
            case 'block':
            case 'unblock':
            case 'contact':
            case 'setprefix':
            case 'setnamebot':
            case 'setowner':
            case 'public':
            case 'private':
            case 'restart':
            case 'shutdown':
            case 'setpp':
            case 'getpp':
            case 'backup':
            case 'antispam':
            case 'welcome':
            case 'goodbye':
            case 'setwelcome':
            case 'setgoodbye':
            case 'autoread':
            case 'autoreact':
            case 'autotyping':
            case 'stats': {
                await reply(sock, remoteJid, mek,
                    `⚙️ La commande *${command}* est enregistrée dans le menu, mais son module n'est pas encore configuré.`
                );
                break;
            }

            default: {
                console.log(`[COMMANDE INCONNUE] : ${command}`);
                break;
            }
        }

    } catch (error) {
        console.error(`[HANDLER ERROR: ${command}]`, error.stack || error.message);

        await reply(
            sock,
            remoteJid,
            mek,
            `❌ Une erreur est survenue pendant l'exécution de *${command}*.\nVérifie les permissions du bot et réessaie.`
        ).catch(() => {});
    }
}

module.exports = { handleCommand };
