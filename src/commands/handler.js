
const axios = require('axios');
const yts = require('yt-search');
const config = require('../../config');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { toKayseurFont, boxText } = require('../font');
const { getMenu } = require('./menu');

// ========================================
// 🍓 KAYSEUR MDX — HANDLER PRINCIPAL
// ========================================

const CHANNEL_LINK = 'https://whatsapp.com/channel/0029Vb8cfQn8V0te5K0atc1s';

// 🍓 COLLE TON FUTUR LIEN CATBOX ENTRE LES GUILLEMETS
const MENU_IMAGE_URL = 'https://files.catbox.moe/47dngj.jpg';

// ========================================
// FONCTION CALCULATRICE SANS EVAL
// ========================================

function calculate(expression) {
    const input = expression.replace(/\s+/g, '');
    if (!/^[0-9+\-*/().%]+$/.test(input)) {
        throw new Error('Expression invalide');
    }

    let pos = 0;

    function factor() {
        if (input[pos] === '+') {
            pos++;
            return factor();
        }

        if (input[pos] === '-') {
            pos++;
            return -factor();
        }

        if (input[pos] === '(') {
            pos++;
            const value = sum();
            if (input[pos] !== ')') throw new Error('Parenthèse manquante');
            pos++;
            return value;
        }

        const start = pos;
        while (/[0-9.]/.test(input[pos] || '')) pos++;

        if (start === pos) throw new Error('Nombre attendu');

        const value = Number(input.slice(start, pos));
        if (!Number.isFinite(value)) throw new Error('Nombre invalide');
        return value;
    }

    function term() {
        let value = factor();

        while (['*', '/', '%'].includes(input[pos])) {
            const operator = input[pos++];
            const next = factor();

            if ((operator === '/' || operator === '%') && next === 0) {
                throw new Error('Division par zéro');
            }

            if (operator === '*') value *= next;
            if (operator === '/') value /= next;
            if (operator === '%') value %= next;
        }

        return value;
    }

    function sum() {
        let value = term();

        while (input[pos] === '+' || input[pos] === '-') {
            const operator = input[pos++];
            const next = term();
            value = operator === '+' ? value + next : value - next;
        }

        return value;
    }

    const result = sum();

    if (pos !== input.length || !Number.isFinite(result)) {
        throw new Error('Calcul invalide');
    }

    return result;
}

// ========================================
// FONCTION PRINCIPALE
// ========================================

async function handleCommand(sock, mek, body, command, args, pushName) {
    const remoteJid = mek.key.remoteJid;
    const isGroup = remoteJid.endsWith('@g.us');
    const sender = mek.key.participant || remoteJid;
    const text = args.join(' ').trim();

    const botNumber = sock.user?.id?.split(':')[0];
    const senderNumber = sender.split('@')[0];
    const isOwner = mek.key.fromMe || senderNumber === botNumber;

    const quoted = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const mentions = mek.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

    const sendText = async (message) => {
        return sock.sendMessage(remoteJid, { text: message }, { quoted: mek });
    };

    const sendBox = async (title, lines) => {
        return sendText(boxText(title, lines));
    };

    const requireOwner = async () => {
        if (!isOwner) {
            await sendBox('ACCÈS REFUSÉ', ['Cette commande est réservée au propriétaire.']);
            return false;
        }
        return true;
    };

    const getGroupData = async () => {
        if (!isGroup) throw new Error('Cette commande fonctionne uniquement dans un groupe.');

        const metadata = await sock.groupMetadata(remoteJid);
        const participants = metadata.participants || [];

        const senderParticipant = participants.find(
            p => p.id === sender || p.id?.split(':')[0] === sender.split(':')[0]
        );

        const botParticipant = participants.find(
            p => p.id?.split(':')[0] === botNumber
        );

        return {
            metadata,
            participants,
            isAdmin: Boolean(senderParticipant?.admin),
            botIsAdmin: Boolean(botParticipant?.admin)
        };
    };

    const requireAdmin = async () => {
        const data = await getGroupData();

        if (!data.isAdmin && !isOwner) {
            await sendBox('ACCÈS REFUSÉ', ['Cette commande est réservée aux administrateurs.']);
            return null;
        }

        if (!data.botIsAdmin) {
            await sendBox('ERREUR', ['Le bot doit être administrateur du groupe.']);
            return null;
        }

        return data;
    };

    // ========================================
    // 🍓 MENU
    // ========================================

    switch (command) {

        case 'menu':
        case 'help': {
            const menuText = getMenu(pushName);
            const hasImage = MENU_IMAGE_URL.startsWith('https://') &&
                !MENU_IMAGE_URL.includes('https://files.catbox.moe/47dngj.jpg');

            if (hasImage) {
                await sock.sendMessage(remoteJid, {
                    image: { url: MENU_IMAGE_URL },
                    caption: menuText,
                    footer: '🍓 KAYSEUR MDX',
                    templateButtons: [
                        {
                            index: 1,
                            urlButton: {
                                displayText: '📢 VOIR LA CHAÎNE',
                                url: CHANNEL_LINK
                            }
                        }
                    ]
                }, { quoted: mek });
            } else {
                await sendText(menuText);
                await sock.sendMessage(remoteJid, {
                    text: '📢 VOIR LA CHAÎNE WHATSAPP',
                    templateButtons: [
                        {
                            index: 1,
                            urlButton: {
                                displayText: 'OUVRIR LA CHAÎNE',
                                url: CHANNEL_LINK
                            }
                        }
                    ]
                }, { quoted: mek });
            }
            break;
        }

        // ========================================
        // 1. MUSIQUE, ANIME & MÉDIAS
        // ========================================

        case 'play':
        case 'song':
        case 'ytmp3':
        case 'music':
        case 'video':
        case 'ytmp4': {
            if (!text) {
                return sendBox('RECHERCHE MÉDIA', [
                    `Exemple : ${config.prefix}${command} Naruto opening`,
                    'Le bot recherche des résultats et fournit les liens.'
                ]);
            }

            try {
                const result = await yts(text);
                const video = result.videos?.[0];

                if (!video) {
                    return sendBox('RÉSULTAT', ['Aucun résultat trouvé.']);
                }

                await sendBox('RÉSULTAT YOUTUBE', [
                    `Titre : ${video.title}`,
                    `Durée : ${video.timestamp}`,
                    `Chaîne : ${video.author?.name || 'Inconnue'}`,
                    `Lien : ${video.url}`,
                    'Ouvre le lien pour écouter ou regarder depuis la plateforme.'
                ]);
            } catch (error) {
                await sendBox('ERREUR', ['La recherche média a échoué. Réessaie plus tard.']);
            }
            break;
        }

        case 'anime':
        case 'manga': {
            if (!text) {
                return sendBox('ANIME & MANGA', [
                    `Exemple : ${config.prefix}${command} Naruto`
                ]);
            }

            try {
                const type = command === 'anime' ? 'anime' : 'manga';
                const response = await axios.get(
                    `https://api.jikan.moe/v4/${type}`,
                    { params: { q: text, limit: 1 } }
                );

                const item = response.data.data?.[0];

                if (!item) {
                    return sendBox('RECHERCHE', ['Aucun résultat trouvé.']);
                }

                await sendBox(`INFORMATIONS ${type.toUpperCase()}`, [
                    `Titre : ${item.title}`,
                    `Titre japonais : ${item.title_japanese || 'Non disponible'}`,
                    `Note : ${item.score || 'Non disponible'}`,
                    `Épisodes / chapitres : ${item.episodes || item.chapters || 'Inconnu'}`,
                    `Statut : ${item.status || 'Inconnu'}`,
                    `Informations : ${item.url}`
                ]);
            } catch (error) {
                await sendBox('ERREUR', ['La recherche anime/manga est temporairement indisponible.']);
            }
            break;
        }

        case 'lyrics':
        case 'spotify':
        case 'tiktok':
        case 'igdl':
        case 'fbdl':
        case 'pinterest':
        case 'bass': {
            if (!text) {
                return sendBox(command.toUpperCase(), [
                    `Exemple : ${config.prefix}${command} nom ou lien`
                ]);
            }

            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(text)}`;

            await sendBox(command.toUpperCase(), [
                `Recherche : ${text}`,
                `Lien de recherche : ${searchUrl}`,
                'Utilise les plateformes officielles pour consulter les médias.'
            ]);
            break;
        }

        // ========================================
        // 2. STICKERS & ÉCRITURE
        // ========================================

        case 'sticker':
        case 's':
        case 'asticker':
        case 'take':
        case 'steal': {
            const message = quoted || mek.message;
            const image = message?.imageMessage;
            const video = message?.videoMessage;
            const stickerMessage = message?.stickerMessage;

            if (!image && !video && !stickerMessage) {
                return sendBox('STICKER', [
                    'Réponds à une image, une vidéo courte ou un sticker.',
                    `Exemple : ${config.prefix}sticker`
                ]);
            }

            try {
                const media = image || video || stickerMessage;
                const type = image ? 'image' : video ? 'video' : 'sticker';
                const stream = await downloadContentFromMessage(media, type);

                let buffer = Buffer.alloc(0);

                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }

                const sticker = new Sticker(buffer, {
                    pack: text.split('|')[0] || 'KAYSEUR MDX',
                    author: text.split('|')[1] || 'MR KING KAYSEUR',
                    type: StickerTypes.FULL,
                    quality: 70
                });

                await sock.sendMessage(
                    remoteJid,
                    await sticker.toMessage(),
                    { quoted: mek }
                );
            } catch (error) {
                await sendBox('ERREUR STICKER', [
                    'Impossible de créer le sticker.',
                    'Les vidéos animées peuvent nécessiter un encodage compatible.'
                ]);
            }
            break;
        }

        case 'font':
        case 'style':
        case 'fancy':
        case 'bold':
        case 'glitch': {
            if (!text) {
                return sendBox('STYLE TEXTE', [
                    `Exemple : ${config.prefix}${command} KAYSEUR`
                ]);
            }

            await sendBox('TON TEXTE STYLISÉ', [
                `Original : ${text}`,
                `Style Kayseur : ${toKayseurFont(text)}`
            ]);
            break;
        }

        case 'toimg':
        case 'togif':
        case 'attp':
        case 'ttp':
        case 'emojimix': {
            await sendBox(command.toUpperCase(), [
                'Cette fonction nécessite encore son module de génération.',
                'Elle sera ajoutée dans une prochaine mise à jour.'
            ]);
            break;
        }

        // ========================================
        // 3. GROUPE & ADMINISTRATION
        // ========================================

        case 'kick': {
            const data = await requireAdmin();
            if (!data) break;

            const targets = mentions.length
                ? mentions
                : text.match(/\d{8,15}/)
                    ? [`${text.match(/\d{8,15}/)[0]}@s.whatsapp.net`]
                    : [];

            if (!targets.length) {
                return sendBox('KICK', ['Mentionne un membre à retirer.']);
            }

            await sock.groupParticipantsUpdate(remoteJid, targets, 'remove');
            await sendBox('KICK', ['Action effectuée.']);
            break;
        }

        case 'add': {
            const data = await requireAdmin();
            if (!data) break;

            const number = text.replace(/\D/g, '');
            if (!number || number.length < 8) {
                return sendBox('ADD', ['Exemple : 🍓add 242XXXXXXXXX']);
            }

            await sock.groupParticipantsUpdate(
                remoteJid,
                [`${number}@s.whatsapp.net`],
                'add'
            );

            await sendBox('ADD', ['Demande effectuée.']);
            break;
        }

        case 'promote':
        case 'demote': {
            const data = await requireAdmin();
            if (!data) break;

            if (!mentions.length) {
                return sendBox(command.toUpperCase(), ['Mentionne le membre concerné.']);
            }

            await sock.groupParticipantsUpdate(
                remoteJid,
                mentions,
                command === 'promote' ? 'promote' : 'demote'
            );

            await sendBox(command.toUpperCase(), ['Action effectuée.']);
            break;
        }

        case 'open':
        case 'close': {
            const data = await requireAdmin();
            if (!data) break;

            await sock.groupSettingUpdate(
                remoteJid,
                command === 'open' ? 'not_announcement' : 'announcement'
            );

            await sendBox('PARAMÈTRES DU GROUPE', [
                command === 'open' ? 'Le groupe est ouvert.' : 'Le groupe est fermé aux membres.'
            ]);
            break;
        }

        case 'mute':
        case 'unmute': {
            const data = await requireAdmin();
            if (!data) break;

            await sock.groupSettingUpdate(
                remoteJid,
                command === 'mute' ? 'announcement' : 'not_announcement'
            );

            await sendBox('GROUPE', [
                command === 'mute' ? 'Seuls les admins peuvent écrire.' : 'Les membres peuvent écrire.'
            ]);
            break;
        }

        case 'tagall':
        case 'hidetag': {
            const data = await requireAdmin();
            if (!data) break;

            const members = data.participants.map(p => p.id);

            await sock.sendMessage(remoteJid, {
                text: boxText(
                    command === 'tagall' ? 'APPEL GÉNÉRAL' : 'MESSAGE DISCRET',
                    [text || 'Attention à tous les membres !']
                ),
                mentions: members
            }, { quoted: mek });
            break;
        }

        case 'link': {
            const data = await requireAdmin();
            if (!data) break;

            const code = await sock.groupInviteCode(remoteJid);
            await sendBox('LIEN DU GROUPE', [
                `https://chat.whatsapp.com/${code}`
            ]);
            break;
        }

        case 'revoke': {
            const data = await requireAdmin();
            if (!data) break;

            await sock.groupRevokeInvite(remoteJid);
            await sendBox('LIEN RENOUVELÉ', ['Le lien d’invitation a été renouvelé.']);
            break;
        }

        case 'setname': {
            const data = await requireAdmin();
            if (!data) break;
            if (!text) return sendBox('NOM DU GROUPE', ['Indique le nouveau nom.']);

            await sock.groupUpdateSubject(remoteJid, text);
            await sendBox('GROUPE', ['Nom mis à jour.']);
            break;
        }

        case 'setdesc': {
            const data = await requireAdmin();
            if (!data) break;
            if (!text) return sendBox('DESCRIPTION', ['Indique la nouvelle description.']);

            await sock.groupUpdateDescription(remoteJid, text);
            await sendBox('GROUPE', ['Description mise à jour.']);
            break;
        }

        case 'groupinfo': {
            const data = await getGroupData();

            await sendBox('INFORMATIONS DU GROUPE', [
                `Nom : ${data.metadata.subject}`,
                `Membres : ${data.participants.length}`,
                `Administrateurs : ${data.participants.filter(p => p.admin).length}`,
                `Création : ${data.metadata.creation || 'Inconnue'}`
            ]);
            break;
        }

        case 'welcome':
        case 'goodbye':
        case 'antilink':
        case 'antibot': {
            await sendBox(command.toUpperCase(), [
                'Cette option est prévue dans le menu.',
                'Son système de configuration sera ajouté progressivement.'
            ]);
            break;
        }

        case 'purge': {
            await sendBox('PURGE DÉSACTIVÉE', [
                'La suppression massive de membres est désactivée pour protéger le groupe.',
                'Utilise 🍓kick pour gérer un membre précis.'
            ]);
            break;
        }

        // ========================================
        // 4. BOT & PROPRIÉTAIRE
        // ========================================

        case 'public': {
            if (!(await requireOwner())) break;
            config.publicMode = true;
            await sendBox('MODE PUBLIC', ['Le bot accepte les commandes des utilisateurs.']);
            break;
        }

        case 'private':
        case 'self': {
            if (!(await requireOwner())) break;
            config.publicMode = false;
            await sendBox('MODE PRIVÉ', ['Le bot est réservé au propriétaire.']);
            break;
        }

        case 'owner': {
            await sendBox('PROPRIÉTAIRE', [
                `Nom : ${config.ownerName}`,
                `Bot : ${config.botName}`,
                `Chaîne : ${CHANNEL_LINK}`
            ]);
            break;
        }

        case 'ping':
        case 'alive':
        case 'runtime': {
            await sendBox('KAYSEUR MDX', [
                'Statut : EN LIGNE',
                `Temps actif : ${Math.floor(process.uptime())} secondes`,
                `Préfixe : ${config.prefix}`
            ]);
            break;
        }

        case 'block':
        case 'unblock': {
            if (!(await requireOwner())) break;

            const number = text.replace(/\D/g, '');
            if (!number) return sendBox(command.toUpperCase(), ['Indique un numéro.']);

            await sock.updateBlockStatus(
                `${number}@s.whatsapp.net`,
                command === 'block' ? 'block' : 'unblock'
            );

            await sendBox(command.toUpperCase(), ['Action effectuée.']);
            break;
        }

        case 'leave': {
            if (!(await requireOwner())) break;
            if (!isGroup) return sendBox('LEAVE', ['Cette commande fonctionne dans un groupe.']);

            await sendBox('KAYSEUR MDX', ['Le bot quitte le groupe.']);
            await sock.groupLeave(remoteJid);
            break;
        }

        case 'restart': {
            if (!(await requireOwner())) break;
            await sendBox('REDÉMARRAGE', ['Le bot va redémarrer.']);
            setTimeout(() => process.exit(0), 1500);
            break;
        }

        case 'bc':
        case 'join':
        case 'setpp':
        case 'setbio': {
            if (!(await requireOwner())) break;

            await sendBox(command.toUpperCase(), [
                'Cette fonction nécessite encore son module dédié.',
                'Elle sera ajoutée dans une prochaine mise à jour.'
            ]);
            break;
        }

        // ========================================
        // 5. OUTILS & INTELLIGENCE ARTIFICIELLE
        // ========================================

        case 'calc': {
            if (!text) {
                return sendBox('CALCULATRICE', [
                    `Exemple : ${config.prefix}calc 25*4`
                ]);
            }

            try {
                const result = calculate(text);
                await sendBox('RÉSULTAT DU CALCUL', [
                    `${text} = ${result}`
                ]);
            } catch (error) {
                await sendBox('CALCUL IMPOSSIBLE', [
                    'Vérifie ton expression.',
                    'Exemple : 25*4+10'
                ]);
            }
            break;
        }

        case 'qr': {
            if (!text) return sendBox('QR CODE', ['Indique le texte ou le lien à convertir.']);

            try {
                const QRCode = require('qrcode');
                const buffer = await QRCode.toBuffer(text);

                await sock.sendMessage(remoteJid, {
                    image: buffer,
                    caption: boxText('QR CODE KAYSEUR', ['Voici ton QR code.'])
                }, { quoted: mek });
            } catch (error) {
                await sendBox('QR CODE', ['Impossible de générer le QR code.']);
            }
            break;
        }

        case 'google': {
            if (!text) return sendBox('GOOGLE', ['Indique ce que tu recherches.']);

            await sendBox('RECHERCHE GOOGLE', [
                `https://www.google.com/search?q=${encodeURIComponent(text)}`
            ]);
            break;
        }

        case 'wiki':
        case 'define': {
            if (!text) return sendBox('WIKI', ['Indique un sujet.']);

            try {
                const response = await axios.get(
                    `https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(text)}`
                );

                await sendBox('WIKIPÉDIA', [
                    response.data.title || text,
                    response.data.extract || 'Aucune description trouvée.',
                    response.data.content_urls?.desktop?.page || ''
                ]);
            } catch (error) {
                await sendBox('WIKIPÉDIA', ['Aucun résultat disponible.']);
            }
            break;
        }

        case 'encode': {
            await sendBox('BASE64 ENCODE', [
                Buffer.from(text).toString('base64')
            ]);
            break;
        }

        case 'decode': {
            try {
                await sendBox('BASE64 DECODE', [
                    Buffer.from(text, 'base64').toString('utf8')
                ]);
            } catch {
                await sendBox('ERREUR', ['Texte Base64 invalide.']);
            }
            break;
        }

        case 'binary': {
            await sendBox('TEXTE BINAIRE', [
                [...text].map(c => c.charCodeAt(0).toString(2)).join(' ')
            ]);
            break;
        }

        case 'password': {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
            let password = '';

            for (let i = 0; i < 16; i++) {
                password += chars[Math.floor(Math.random() * chars.length)];
            }

            await sendBox('GÉNÉRATEUR DE MOT DE PASSE', [
                password,
                'Garde ton mot de passe privé.'
            ]);
            break;
        }

        case 'shorturl':
        case 'weather':
        case 'screenshot':
        case 'github':
        case 'npm':
        case 'ai':
        case 'gpt':
        case 'imagine':
        case 'translate':
        case 'tts':
        case 'readqr': {
            await sendBox(command.toUpperCase(), [
                'Cette fonction nécessite une API ou un module supplémentaire.',
                'Elle sera configurée dans une prochaine mise à jour.'
            ]);
            break;
        }

        // ========================================
        // 6. JEUX & DIVERTISSEMENT
        // ========================================

        case 'dice': {
            await sendBox('DÉ', [
                `Résultat : ${Math.floor(Math.random() * 6) + 1}`
            ]);
            break;
        }

        case 'coin': {
            await sendBox('PILE OU FACE', [
                Math.random() < 0.5 ? 'PILE' : 'FACE'
            ]);
            break;
        }

        case '8ball': {
            const answers = [
                'Oui !',
                'Non !',
                'Peut-être...',
                'Certainement !',
                'Réessaie plus tard.'
            ];

            await sendBox('BOULE MAGIQUE', [
                answers[Math.floor(Math.random() * answers.length)]
            ]);
            break;
        }

        case 'ship':
        case 'love':
        case 'gay': {
            await sendBox('JEU AMUSANT', [
                `Résultat aléatoire : ${Math.floor(Math.random() * 101)}%`,
                'Ceci est un jeu, pas une évaluation réelle.'
            ]);
            break;
        }

        case 'quiz':
        case 'devinette':
        case 'trueorfalse':
        case 'roulette':
        case 'slot':
        case 'joke':
        case 'fact':
        case 'quote':
        case 'roast': {
            const messages = {
                quiz: 'Quel est le plus grand océan du monde ? Réponds : Pacifique ou Atlantique.',
                devinette: 'Je peux être ouvert ou fermé, mais je ne suis pas une porte. Qui suis-je ?',
                trueorfalse: 'Le soleil est une étoile. Vrai ou faux ?',
                roulette: 'La roulette est lancée !',
                slot: '🎰 Résultat : 🍓 🍓 ⭐',
                joke: 'Pourquoi les développeurs aiment-ils le mode sombre ? Parce que la lumière attire les bugs !',
                fact: 'Les pieuvres ont trois cœurs.',
                quote: 'Chaque grand projet commence par une première étape.',
                roast: 'Ton Wi-Fi est tellement lent que même les escargots lui demandent le mot de passe.'
            };

            await sendBox(command.toUpperCase(), [messages[command]]);
            break;
        }

        default:
            break;
    }
}

module.exports = { handleCommand };
