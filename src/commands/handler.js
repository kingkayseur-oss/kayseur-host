
const axios = require('axios');
const yts = require('yt-search');
const config = require('../../config');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { toKayseurFont, boxText } = require('../font');
const { getMenu } = require('./menu');

// ========================================
// 🍓 KAYSEUR MDX — HANDLER 100 COMMANDES
// ========================================

const CHANNEL_LINK = 'https://whatsapp.com/channel/0029Vb8cfQn8V0te5K0atc1s';
const MENU_IMAGE_URL = 'https://files.catbox.moe/47dngj.jpg';

// ========================================
// ENVOI IMAGE + BOUTON CHAÎNE
// Le bouton est intégré au même message.
// ========================================

async function sendMediaWithButton(sock, remoteJid, mek, textContent) {
    // Première tentative : image + bouton intégré
    try {
        await sock.sendMessage(remoteJid, {
            image: { url: MENU_IMAGE_URL },
            caption: textContent,
            footer: '🍓 KAYSEUR MDX • THE GLITCH DEV',
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

        return true;
    } catch (error) {
        console.log('Erreur image + bouton :', error.message);
    }

    // Deuxième tentative : image avec lien écrit dans la légende
    try {
        await sock.sendMessage(remoteJid, {
            image: { url: MENU_IMAGE_URL },
            caption: `${textContent}\n\n📢 VOIR LA CHAÎNE :\n${CHANNEL_LINK}`
        }, { quoted: mek });

        return true;
    } catch (error) {
        console.log('Erreur envoi image :', error.message);
    }

    // Dernier recours : texte seul, pour ne pas laisser la commande sans réponse
    try {
        await sock.sendMessage(remoteJid, {
            text: `${textContent}\n\n📢 VOIR LA CHAÎNE :\n${CHANNEL_LINK}`
        }, { quoted: mek });

        return true;
    } catch (error) {
        console.log('Erreur envoi texte de secours :', error.message);
        return false;
    }
}

// ========================================
// CALCULATRICE SÉCURISÉE (SANS EVAL)
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

            if (input[pos] !== ')') {
                throw new Error('Parenthèse manquante');
            }

            pos++;
            return value;
        }

        const start = pos;

        while (/[0-9.]/.test(input[pos] || '')) {
            pos++;
        }

        if (start === pos) {
            throw new Error('Nombre attendu');
        }

        const value = Number(input.slice(start, pos));

        if (!Number.isFinite(value)) {
            throw new Error('Nombre invalide');
        }

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

    // 🍓 RÉACTION FRAISE AVANT CHAQUE COMMANDE
    try {
        await sock.sendMessage(remoteJid, {
            react: {
                text: '🍓',
                key: mek.key
            }
        });
    } catch (error) {
        console.log('Erreur réaction 🍓 :', error.message);
    }

    const botNumber = sock.user?.id?.split(':')[0];
    const senderNumber = sender.split('@')[0];
    const isOwner = mek.key.fromMe || senderNumber === botNumber;

    const quoted = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedParticipant = mek.message?.extendedTextMessage?.contextInfo?.participant;
    const quotedStanzaId = mek.message?.extendedTextMessage?.contextInfo?.stanzaId;
    const mentions = mek.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

    const sendText = async (message) => {
        return sock.sendMessage(remoteJid, { text: message }, { quoted: mek });
    };

    const sendBox = async (title, lines) => {
        return sendText(boxText(title, lines));
    };

    const requireOwner = async () => {
        if (!isOwner) {
            await sendBox('ACCÈS REFUSÉ', [
                'Cette commande est réservée au propriétaire.'
            ]);
            return false;
        }

        return true;
    };

    const getGroupData = async () => {
        if (!isGroup) {
            await sendBox('GROUPE UNIQUEMENT', [
                'Cette commande fonctionne uniquement dans un groupe.'
            ]);
            return null;
        }

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

        if (!data) return null;

        if (!data.isAdmin && !isOwner) {
            await sendBox('ACCÈS REFUSÉ', [
                'Cette commande est réservée aux administrateurs.'
            ]);
            return null;
        }

        if (!data.botIsAdmin) {
            await sendBox('ERREUR', [
                'Le bot doit être administrateur du groupe.'
            ]);
            return null;
        }

        return data;
    };

    switch (command) {

        // ========================================
        // 🍓 MENU PRINCIPAL
        // ========================================

        case 'menu':
        case 'help': {
            const menuText = getMenu(pushName);
            await sendMediaWithButton(sock, remoteJid, mek, menuText);
            break;
        }

        // ========================================
        // 1. GROUP MENU
        // ========================================

        case 'add': {
            const data = await requireAdmin();
            if (!data) break;

            const number = text.replace(/\D/g, '');

            if (!number || number.length < 8) {
                return sendBox('ADD', [
                    `Exemple : ${config.prefix}add 242XXXXXXXXX`
                ]);
            }

            await sock.groupParticipantsUpdate(
                remoteJid,
                [`${number}@s.whatsapp.net`],
                'add'
            );

            await sendBox('ADD', [
                'Membre ajouté ou invitation envoyée.'
            ]);
            break;
        }

        case 'kick': {
            const data = await requireAdmin();
            if (!data) break;

            const targets = mentions.length
                ? mentions
                : quotedParticipant
                    ? [quotedParticipant]
                    : text.match(/\d{8,15}/)
                        ? [`${text.match(/\d{8,15}/)[0]}@s.whatsapp.net`]
                        : [];

            if (!targets.length) {
                return sendBox('KICK', [
                    'Mentionne un membre ou réponds à son message.'
                ]);
            }

            await sock.groupParticipantsUpdate(remoteJid, targets, 'remove');
            await sendBox('KICK', ['Membre expulsé du groupe.']);
            break;
        }

        case 'purge': {
            if (!(await requireOwner())) break;

            const data = await requireAdmin();
            if (!data) break;

            const targets = data.participants
                .filter(p => !p.admin && p.id?.split(':')[0] !== botNumber)
                .map(p => p.id);

            if (!targets.length) {
                return sendBox('KICKALL', [
                    'Aucun membre non-admin à retirer.'
                ]);
            }

            await sendBox('KICKALL', [
                `La purge commence : ${targets.length} membres concernés...`
            ]);

            for (const member of targets) {
                try {
                    await sock.groupParticipantsUpdate(
                        remoteJid,
                        [member],
                        'remove'
                    );

                    await new Promise(r => setTimeout(r, 800));
                } catch (error) {
                    console.log('Erreur purge membre :', error.message);
                }
            }

            await sendBox('KICKALL TERMINÉ', [
                'La purge est terminée.'
            ]);
            break;
        }

        case 'promote':
        case 'demote': {
            const data = await requireAdmin();
            if (!data) break;

            const targets = mentions.length
                ? mentions
                : quotedParticipant
                    ? [quotedParticipant]
                    : [];

            if (!targets.length) {
                return sendBox(command.toUpperCase(), [
                    'Mentionne le membre concerné.'
                ]);
            }

            await sock.groupParticipantsUpdate(remoteJid, targets, command);
            await sendBox(command.toUpperCase(), [
                'Statut administrateur mis à jour.'
            ]);
            break;
        }

        case 'open':
        case 'unmute': {
            const data = await requireAdmin();
            if (!data) break;

            await sock.groupSettingUpdate(remoteJid, 'not_announcement');
            await sendBox('GROUPE OUVERT', [
                'Tous les membres peuvent envoyer des messages.'
            ]);
            break;
        }

        case 'close':
        case 'mute': {
            const data = await requireAdmin();
            if (!data) break;

            await sock.groupSettingUpdate(remoteJid, 'announcement');
            await sendBox('GROUPE FERMÉ', [
                'Seuls les administrateurs peuvent écrire.'
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
                    command === 'tagall' ? '*APPEL GÉNÉRAL*' : '*MESSAGE GROUPE*',
                    [text || '`Attention à tous !`']
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
            await sendBox('LIEN RÉINITIALISÉ', [
                'Un nouveau lien d’invitation a été généré.'
            ]);
            break;
        }

        case 'setname': {
            const data = await requireAdmin();
            if (!data) break;

            if (!text) {
                return sendBox('SETNAME', [
                    'Indique le nouveau nom du groupe.'
                ]);
            }

            await sock.groupUpdateSubject(remoteJid, text);
            await sendBox('NOM MODIFIÉ', [`Nouveau nom : ${text}`]);
            break;
        }

        case 'setdesc': {
            const data = await requireAdmin();
            if (!data) break;

            if (!text) {
                return sendBox('SETDESC', [
                    'Indique la nouvelle description.'
                ]);
            }

            await sock.groupUpdateDescription(remoteJid, text);
            await sendBox('DESCRIPTION MODIFIÉE', [
                'La description du groupe a été mise à jour.'
            ]);
            break;
        }

        case 'ppgroup': {
            const data = await requireAdmin();
            if (!data) break;

            const img = quoted?.imageMessage || mek.message?.imageMessage;

            if (!img) {
                return sendBox('PPGROUP', [
                    'Réponds à une image pour changer la photo du groupe.'
                ]);
            }

            const stream = await downloadContentFromMessage(img, 'image');
            let buffer = Buffer.alloc(0);

            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            await sock.updateProfilePicture(remoteJid, buffer);
            await sendBox('PHOTO DE GROUPE', [
                'La photo de profil du groupe a été changée.'
            ]);
            break;
        }

        case 'groupinfo': {
            const data = await getGroupData();
            if (!data) break;

            await sendBox('INFOS DU GROUPE', [
                `Nom : ${data.metadata.subject}`,
                `Membres : ${data.participants.length}`,
                `Admins : ${data.participants.filter(p => p.admin).length}`,
                `ID : ${remoteJid}`
            ]);
            break;
        }

        case 'del': {
            const data = await requireAdmin();
            if (!data) break;

            if (!quotedStanzaId) {
                return sendBox('DEL', [
                    'Réponds au message à supprimer.'
                ]);
            }

            await sock.sendMessage(remoteJid, {
                delete: {
                    remoteJid,
                    fromMe: false,
                    id: quotedStanzaId,
                    participant: quotedParticipant
                }
            });

            break;
        }

        case 'antilink':
        case 'antibot': {
            const data = await requireAdmin();
            if (!data) break;

            const state = text.toLowerCase();

            if (!['on', 'off'].includes(state)) {
                return sendBox(command.toUpperCase(), [
                    `Utilisation : ${config.prefix}${command} on ou off`
                ]);
            }

            config[command] = state === 'on';

            await sendBox(command.toUpperCase(), [
                `Protection ${command} : ${state.toUpperCase()}`
            ]);
            break;
        }

        // ========================================
        // 2. DOWNLOAD & MEDIA
        // ========================================

        case 'play':
        case 'song':
        case 'ytmp3':
        case 'sound': {
            if (!text) {
                return sendBox('AUDIO YOUTUBE', [
                    `Exemple : ${config.prefix}${command} Fally Ipupa`
                ]);
            }

            try {
                const search = await yts(text);
                const video = search.videos?.[0];

                if (!video) {
                    return sendBox('RÉSULTAT', [
                        'Aucune musique trouvée.'
                    ]);
                }

                await sendMediaWithButton(
                    sock,
                    remoteJid,
                    mek,
                    boxText('TÉLÉCHARGEMENT AUDIO', [
                        `Titre : ${video.title}`,
                        `Durée : ${video.timestamp}`,
                        'Statut : Envoi du fichier en cours...'
                    ])
                );

                const dl = await axios.get(
                    `https://api.giftedtech.web.id/api/download/dlmp3?apikey=gifted&url=${encodeURIComponent(video.url)}`
                );

                const audioUrl = dl.data?.result?.download_url ||
                    dl.data?.result?.url;

                if (audioUrl) {
                    await sock.sendMessage(remoteJid, {
                        audio: { url: audioUrl },
                        mimetype: 'audio/mpeg',
                        fileName: `${video.title}.mp3`
                    }, { quoted: mek });
                } else {
                    await sendBox('LIEN AUDIO', [
                        `Impossible d’envoyer le fichier direct. Lien : ${video.url}`
                    ]);
                }
            } catch (error) {
                console.log('Erreur audio :', error.message);
                await sendBox('ERREUR AUDIO', [
                    'Échec du téléchargement MP3. Réessaie avec un autre titre.'
                ]);
            }

            break;
        }

        case 'video':
        case 'ytmp4': {
            if (!text) {
                return sendBox('VIDÉO YOUTUBE', [
                    `Exemple : ${config.prefix}${command} Naruto AMV`
                ]);
            }

            try {
                const search = await yts(text);
                const video = search.videos?.[0];

                if (!video) {
                    return sendBox('RÉSULTAT', [
                        'Aucune vidéo trouvée.'
                    ]);
                }

                await sendMediaWithButton(
                    sock,
                    remoteJid,
                    mek,
                    boxText('TÉLÉCHARGEMENT VIDÉO', [
                        `Titre : ${video.title}`,
                        `Durée : ${video.timestamp}`,
                        'Statut : Envoi de la vidéo en cours...'
                    ])
                );

                const dl = await axios.get(
                    `https://api.giftedtech.web.id/api/download/dlmp4?apikey=gifted&url=${encodeURIComponent(video.url)}`
                );

                const videoUrl = dl.data?.result?.download_url ||
                    dl.data?.result?.url;

                if (videoUrl) {
                    await sock.sendMessage(remoteJid, {
                        video: { url: videoUrl },
                        caption: `🍓 ${video.title}`
                    }, { quoted: mek });
                } else {
                    await sendBox('LIEN VIDÉO', [
                        `Lien direct : ${video.url}`
                    ]);
                }
            } catch (error) {
                console.log('Erreur vidéo :', error.message);
                await sendBox('ERREUR VIDÉO', [
                    'Échec du téléchargement MP4.'
                ]);
            }

            break;
        }

        case 'tiktok': {
            if (!text || !text.includes('tiktok.com')) {
                return sendBox('TIKTOK', [
                    `Exemple : ${config.prefix}tiktok https://vm.tiktok.com/...`
                ]);
            }

            try {
                const res = await axios.get(
                    `https://www.tikwm.com/api/?url=${encodeURIComponent(text)}`
                );

                const videoUrl = res.data?.data?.play;
                const title = res.data?.data?.title || 'Vidéo TikTok';

                if (!videoUrl) {
                    throw new Error('Vidéo introuvable');
                }

                await sendMediaWithButton(
                    sock,
                    remoteJid,
                    mek,
                    boxText('TIKTOK TÉLÉCHARGÉ', [
                        `Titre : ${title}`,
                        'Statut : Succès'
                    ])
                );

                await sock.sendMessage(remoteJid, {
                    video: { url: videoUrl },
                    caption: `🍓 ${title}`
                }, { quoted: mek });
            } catch (error) {
                console.log('Erreur TikTok :', error.message);
                await sendBox('ERREUR TIKTOK', [
                    'Impossible de télécharger cette vidéo TikTok.'
                ]);
            }

            break;
        }

        case 'igdl':
        case 'fbdl':
        case 'twitter':
        case 'snapchat': {
            if (!text) {
                return sendBox(command.toUpperCase(), [
                    `Envoie le lien ${command} après la commande.`
                ]);
            }

            try {
                const endpoint = command === 'igdl'
                    ? 'instadl'
                    : command === 'fbdl'
                        ? 'fbdl'
                        : 'twitterdl';

                const res = await axios.get(
                    `https://api.giftedtech.web.id/api/download/${endpoint}?apikey=gifted&url=${encodeURIComponent(text)}`
                );

                const mediaUrl = res.data?.result?.[0]?.url ||
                    res.data?.result?.url ||
                    res.data?.result?.hd;

                if (!mediaUrl) {
                    throw new Error('Média introuvable');
                }

                await sendMediaWithButton(
                    sock,
                    remoteJid,
                    mek,
                    boxText('MÉDIA TÉLÉCHARGÉ', [
                        `Succès de l’extraction ${command}`
                    ])
                );

                await sock.sendMessage(remoteJid, {
                    video: { url: mediaUrl },
                    caption: '🍓 Téléchargé via KAYSEUR MDX'
                }, { quoted: mek });
            } catch (error) {
                console.log('Erreur téléchargement :', error.message);
                await sendBox('ERREUR TÉLÉCHARGEMENT', [
                    'Lien invalide ou média privé.'
                ]);
            }

            break;
        }

        case 'yts': {
            if (!text) {
                return sendBox('RECHERCHE YOUTUBE', [
                    `Exemple : ${config.prefix}yts One Piece`
                ]);
            }

            const res = await yts(text);
            const list = res.videos.slice(0, 5).map(
                (v, i) => `${i + 1}. ${v.title} (${v.timestamp})\n${v.url}`
            );

            await sendMediaWithButton(
                sock,
                remoteJid,
                mek,
                boxText('RÉSULTATS YOUTUBE', list.length ? list : ['Aucun résultat.'])
            );

            break;
        }

        case 'anime':
        case 'manga': {
            if (!text) {
                return sendBox('ANIME / MANGA', [
                    `Exemple : ${config.prefix}${command} Solo Leveling`
                ]);
            }

            try {
                const type = command === 'anime' ? 'anime' : 'manga';

                const res = await axios.get(
                    `https://api.jikan.moe/v4/${type}`,
                    { params: { q: text, limit: 1 } }
                );

                const item = res.data.data?.[0];

                if (!item) {
                    return sendBox('RÉSULTAT', [
                        'Aucun résultat trouvé.'
                    ]);
                }

                await sendMediaWithButton(
                    sock,
                    remoteJid,
                    mek,
                    boxText(`${type.toUpperCase()} INFO`, [
                        `Titre : ${item.title}`,
                        `Note : ${item.score || 'N/A'}/10`,
                        `Épisodes/Chapitres : ${item.episodes || item.chapters || '?'}`,
                        `Statut : ${item.status}`,
                        `Lien : ${item.url}`
                    ])
                );
            } catch (error) {
                console.log('Erreur anime/manga :', error.message);
                await sendBox('ERREUR', [
                    'Recherche indisponible.'
                ]);
            }

            break;
        }

        case 'lyrics': {
            if (!text) {
                return sendBox('PAROLES', [
                    `Exemple : ${config.prefix}lyrics Papaoutai`
                ]);
            }

            try {
                const res = await axios.get(
                    `https://api.lyrics.ovh/v1/${encodeURIComponent(text.split('-')[0] || 'artist')}/${encodeURIComponent(text.split('-')[1] || text)}`
                );

                await sendMediaWithButton(
                    sock,
                    remoteJid,
                    mek,
                    boxText('PAROLES', [
                        res.data.lyrics?.slice(0, 1500) || 'Paroles introuvables.'
                    ])
                );
            } catch (error) {
                console.log('Erreur paroles :', error.message);
                await sendBox('PAROLES', [
                    'Indique : Artiste - Titre (ex: Stromae - Papaoutai)'
                ]);
            }

            break;
        }

        case 'spotify':
        case 'pinterest':
        case 'apk':
        case 'mediafire':
        case 'gdrive': {
            if (!text) {
                return sendBox(command.toUpperCase(), [
                    `Exemple : ${config.prefix}${command} recherche ou lien`
                ]);
            }

            await sendMediaWithButton(
                sock,
                remoteJid,
                mek,
                boxText(command.toUpperCase(), [
                    `Recherche : ${text}`,
                    `Lien direct : https://www.google.com/search?q=${encodeURIComponent(command + ' ' + text)}`
                ])
            );

            break;
        }

        // ========================================
        // 3. AI & TOOLS
        // ========================================

        case 'ai':
        case 'gpt':
        case 'gemini': {
            if (!text) {
                return sendBox('KAYSEUR AI', [
                    `Pose ta question : ${config.prefix}${command} Explique la gravité`
                ]);
            }

            try {
                const res = await axios.get(
                    `https://api.giftedtech.web.id/api/ai/gptbox?apikey=gifted&q=${encodeURIComponent(text)}`
                );

                const reply = res.data?.result || res.data?.message;

                if (!reply) {
                    throw new Error('Réponse vide');
                }

                await sendMediaWithButton(
                    sock,
                    remoteJid,
                    mek,
                    boxText('KAYSEUR AI', [reply])
                );
            } catch (error) {
                try {
                    const fallback = await axios.get(
                        `https://text.pollinations.ai/${encodeURIComponent(text)}`
                    );

                    await sendMediaWithButton(
                        sock,
                        remoteJid,
                        mek,
                        boxText('KAYSEUR AI', [
                            String(fallback.data).slice(0, 2000)
                        ])
                    );
                } catch (fallbackError) {
                    console.log('Erreur IA :', fallbackError.message);
                    await sendBox('ERREUR IA', [
                        'L’IA est momentanément surchargée. Réessaie dans un instant.'
                    ]);
                }
            }

            break;
        }

        case 'imagine': {
            if (!text) {
                return sendBox('GÉNÉRATEUR IMAGE IA', [
                    `Exemple : ${config.prefix}imagine un lion cybernétique`
                ]);
            }

            try {
                const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(text)}?width=1024&height=1024&nologo=true`;

                await sock.sendMessage(remoteJid, {
                    image: { url: imageUrl },
                    caption: boxText('IMAGE IA GÉNÉRÉE', [
                        `Prompt : ${text}`
                    ])
                }, { quoted: mek });
            } catch (error) {
                console.log('Erreur image IA :', error.message);
                await sendBox('ERREUR IMAGE', [
                    'Impossible de générer cette image.'
                ]);
            }

            break;
        }

        case 'translate': {
            if (!text) {
                return sendBox('TRADUCTION', [
                    `Exemple : ${config.prefix}translate Hello world`
                ]);
            }

            try {
                const res = await axios.get(
                    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|fr`
                );

                await sendMediaWithButton(
                    sock,
                    remoteJid,
                    mek,
                    boxText('TRADUCTION (FR)', [
                        res.data?.responseData?.translatedText || 'Traduction impossible.'
                    ])
                );
            } catch (error) {
                console.log('Erreur traduction :', error.message);
                await sendBox('ERREUR', [
                    'Service de traduction indisponible.'
                ]);
            }

            break;
        }

        case 'tts': {
            if (!text) {
                return sendBox('VOCAL TTS', [
                    `Exemple : ${config.prefix}tts Bonjour tout le monde`
                ]);
            }

            const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=fr&client=tw-ob`;

            await sock.sendMessage(remoteJid, {
                audio: { url: ttsUrl },
                mimetype: 'audio/mp4',
                ptt: true
            }, { quoted: mek });

            break;
        }

        case 'calc': {
            if (!text) {
                return sendBox('CALCULATRICE', [
                    `Exemple : ${config.prefix}calc 25*4+10`
                ]);
            }

            try {
                await sendMediaWithButton(
                    sock,
                    remoteJid,
                    mek,
                    boxText('RÉSULTAT', [
                        `${text} = ${calculate(text)}`
                    ])
                );
            } catch (error) {
                await sendBox('ERREUR', [
                    'Expression mathématique invalide.'
                ]);
            }

            break;
        }

        case 'qr': {
            if (!text) {
                return sendBox('QR CODE', [
                    `Exemple : ${config.prefix}qr https://whatsapp.com`
                ]);
            }

            try {
                const QRCode = require('qrcode');
                const buffer = await QRCode.toBuffer(text);

                await sock.sendMessage(remoteJid, {
                    image: buffer,
                    caption: boxText('QR CODE', [
                        'Scanne ce code QR.'
                    ])
                }, { quoted: mek });
            } catch (error) {
                console.log('Erreur QR :', error.message);
                await sendBox('ERREUR QR', [
                    'Impossible de créer le QR code.'
                ]);
            }

            break;
        }

        case 'wiki':
        case 'define': {
            if (!text) {
                return sendBox('WIKIPÉDIA', [
                    `Exemple : ${config.prefix}${command} Brazzaville`
                ]);
            }

            try {
                const res = await axios.get(
                    `https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(text)}`
                );

                await sendMediaWithButton(
                    sock,
                    remoteJid,
                    mek,
                    boxText('WIKIPÉDIA', [
                        res.data.title || text,
                        res.data.extract || 'Aucun résumé disponible.'
                    ])
                );
            } catch (error) {
                console.log('Erreur Wikipédia :', error.message);
                await sendBox('WIKIPÉDIA', [
                    'Aucun article trouvé pour ce sujet.'
                ]);
            }

            break;
        }

        case 'weather': {
            if (!text) {
                return sendBox('MÉTÉO', [
                    `Exemple : ${config.prefix}weather Brazzaville`
                ]);
            }

            try {
                const res = await axios.get(
                    `https://wttr.in/${encodeURIComponent(text)}?format=3`
                );

                await sendMediaWithButton(
                    sock,
                    remoteJid,
                    mek,
                    boxText('MÉTÉO ACTUELLE', [
                        String(res.data).trim()
                    ])
                );
            } catch (error) {
                console.log('Erreur météo :', error.message);
                await sendBox('MÉTÉO', [
                    'Ville introuvable.'
                ]);
            }

            break;
        }

        case 'shorturl': {
            if (!text) {
                return sendBox('RACCOURCIR LIEN', [
                    `Exemple : ${config.prefix}shorturl https://google.com`
                ]);
            }

            try {
                const res = await axios.get(
                    `https://tinyurl.com/api-create.php?url=${encodeURIComponent(text)}`
                );

                await sendMediaWithButton(
                    sock,
                    remoteJid,
                    mek,
                    boxText('LIEN RACCOURCI', [res.data])
                );
            } catch (error) {
                console.log('Erreur URL :', error.message);
                await sendBox('ERREUR', [
                    'Lien invalide.'
                ]);
            }

            break;
        }

        case 'github': {
            if (!text) {
                return sendBox('GITHUB', [
                    `Exemple : ${config.prefix}github kingkayseur-oss`
                ]);
            }

            try {
                const res = await axios.get(
                    `https://api.github.com/users/${encodeURIComponent(text)}`
                );

                await sendMediaWithButton(
                    sock,
                    remoteJid,
                    mek,
                    boxText('PROFIL GITHUB', [
                        `Utilisateur : ${res.data.login}`,
                        `Dépôts publics : ${res.data.public_repos}`,
                        `Abonnés : ${res.data.followers}`,
                        `Lien : ${res.data.html_url}`
                    ])
                );
            } catch (error) {
                console.log('Erreur GitHub :', error.message);
                await sendBox('GITHUB', [
                    'Utilisateur introuvable.'
                ]);
            }

            break;
        }

        case 'npm': {
            if (!text) {
                return sendBox('NPM', [
                    `Exemple : ${config.prefix}npm axios`
                ]);
            }

            try {
                const res = await axios.get(
                    `https://registry.npmjs.org/${encodeURIComponent(text)}/latest`
                );

                await sendMediaWithButton(
                    sock,
                    remoteJid,
                    mek,
                    boxText('PACKAGE NPM', [
                        `Nom : ${res.data.name}`,
                        `Version : ${res.data.version}`,
                        `Description : ${res.data.description || 'Aucune'}`
                    ])
                );
            } catch (error) {
                console.log('Erreur NPM :', error.message);
                await sendBox('NPM', [
                    'Package introuvable.'
                ]);
            }

            break;
        }

        case 'google': {
            if (!text) {
                return sendBox('GOOGLE', [
                    `Exemple : ${config.prefix}google WhatsApp Bot`
                ]);
            }

            await sendMediaWithButton(
                sock,
                remoteJid,
                mek,
                boxText('RECHERCHE GOOGLE', [
                    `https://www.google.com/search?q=${encodeURIComponent(text)}`
                ])
            );

            break;
        }

        case 'encode': {
            if (!text) {
                return sendBox('ENCODE', [
                    'Indique un texte.'
                ]);
            }

            await sendMediaWithButton(
                sock,
                remoteJid,
                mek,
                boxText('BASE64 ENCODE', [
                    Buffer.from(text).toString('base64')
                ])
            );

            break;
        }

        case 'decode': {
            if (!text) {
                return sendBox('DECODE', [
                    'Indique un code Base64.'
                ]);
            }

            try {
                await sendMediaWithButton(
                    sock,
                    remoteJid,
                    mek,
                    boxText('BASE64 DECODE', [
                        Buffer.from(text, 'base64').toString('utf8')
                    ])
                );
            } catch (error) {
                await sendBox('ERREUR', [
                    'Code Base64 invalide.'
                ]);
            }

            break;
        }

        case 'password': {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
            let pwd = '';

            for (let i = 0; i < 16; i++) {
                pwd += chars[Math.floor(Math.random() * chars.length)];
            }

            await sendMediaWithButton(
                sock,
                remoteJid,
                mek,
                boxText('MOT DE PASSE SÉCURISÉ', [pwd])
            );

            break;
        }

        case 'readqr':
        case 'screenshot': {
            if (!text) {
                return sendBox(command.toUpperCase(), [
                    `Exemple : ${config.prefix}${command} https://google.com`
                ]);
            }

            const shotUrl = `https://image.thum.io/get/width/1200/${text.startsWith('http') ? text : 'https://' + text}`;

            try {
                await sock.sendMessage(remoteJid, {
                    image: { url: shotUrl },
                    caption: boxText('CAPTURE WEB', [text])
                }, { quoted: mek });
            } catch (error) {
                console.log('Erreur capture web :', error.message);
                await sendBox('CAPTURE WEB', [
                    `Impossible de créer la capture. Lien : ${text}`
                ]);
            }

            break;
        }

        // ========================================
        // 4. STICKER & STYLE
        // ========================================

        case 'sticker':
        case 's':
        case 'asticker':
        case 'take':
        case 'steal': {
            const message = quoted || mek.message;
            const image = message?.imageMessage;
            const video = message?.videoMessage;
            const stickerMsg = message?.stickerMessage;

            if (!image && !video && !stickerMsg) {
                return sendBox('STICKER', [
                    'Réponds à une image, une vidéo courte ou un sticker.'
                ]);
            }

            try {
                const media = image || video || stickerMsg;
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
                console.log('Erreur sticker :', error.message);
                await sendBox('ERREUR STICKER', [
                    'Impossible de convertir ce média en sticker.'
                ]);
            }

            break;
        }

        case 'toimg':
        case 'togif': {
            const stickerMsg = quoted?.stickerMessage;

            if (!stickerMsg) {
                return sendBox(command.toUpperCase(), [
                    'Réponds à un sticker.'
                ]);
            }

            try {
                const stream = await downloadContentFromMessage(
                    stickerMsg,
                    'sticker'
                );

                let buffer = Buffer.alloc(0);

                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }

                await sock.sendMessage(remoteJid, {
                    image: buffer,
                    caption: '🍓 Converti par KAYSEUR MDX'
                }, { quoted: mek });
            } catch (error) {
                console.log('Erreur conversion sticker :', error.message);
                await sendBox('ERREUR', [
                    'Impossible de convertir ce sticker.'
                ]);
            }

            break;
        }

        case 'attp':
        case 'ttp': {
            if (!text) {
                return sendBox(command.toUpperCase(), [
                    `Exemple : ${config.prefix}${command} KAYSEUR`
                ]);
            }

            try {
                const sticker = new Sticker(
                    `https://dummyimage.com/512x512/000000/ff2a6d.png&text=${encodeURIComponent(text)}`,
                    {
                        pack: 'KAYSEUR MDX',
                        author: 'MR KING KAYSEUR',
                        type: StickerTypes.FULL
                    }
                );

                await sock.sendMessage(
                    remoteJid,
                    await sticker.toMessage(),
                    { quoted: mek }
                );
            } catch (error) {
                console.log('Erreur ATTP :', error.message);
                await sendBox('ERREUR', [
                    'Impossible de créer ce sticker.'
                ]);
            }

            break;
        }

        case 'emojimix': {
            if (!text || !text.includes('+')) {
                return sendBox('EMOJIMIX', [
                    `Exemple : ${config.prefix}emojimix 😎+🍓`
                ]);
            }

            await sendMediaWithButton(
                sock,
                remoteJid,
                mek,
                boxText('EMOJIMIX', [
                    `Combinaison : ${text}`
                ])
            );

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

            await sendMediaWithButton(
                sock,
                remoteJid,
                mek,
                boxText('TEXTE STYLISÉ', [
                    toKayseurFont(text)
                ])
            );

            break;
        }

        // ========================================
        // 5. GAMES & FUN
        // ========================================

        case 'dice': {
            await sendMediaWithButton(
                sock,
                remoteJid,
                mek,
                boxText('LANCER DE DÉ', [
                    `Résultat : 🎲 ${Math.floor(Math.random() * 6) + 1}`
                ])
            );

            break;
        }

        case 'coin': {
            await sendMediaWithButton(
                sock,
                remoteJid,
                mek,
                boxText('PILE OU FACE', [
                    Math.random() < 0.5 ? '🪙 PILE' : '🪙 FACE'
                ])
            );

            break;
        }

        case '8ball': {
            const answers = [
                'Oui sans aucun doute !',
                'Non.',
                'Peut-être bien...',
                'C’est certain !',
                'Demande plus tard.'
            ];

            await sendMediaWithButton(
                sock,
                remoteJid,
                mek,
                boxText('BOULE MAGIQUE', [
                    answers[Math.floor(Math.random() * answers.length)]
                ])
            );

            break;
        }

        case 'ship':
        case 'love':
        case 'gay': {
            await sendMediaWithButton(
                sock,
                remoteJid,
                mek,
                boxText(command.toUpperCase(), [
                    `Score : ${Math.floor(Math.random() * 101)}% 🍓`
                ])
            );

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
            const funData = {
                quiz: 'Quel est le métal le plus conducteur d’électricité ? (Réponse : L’argent)',
                devinette: 'Je grandis quand je mange, mais je meurs si je bois. Qui suis-je ? (Le feu)',
                trueorfalse: 'Les dauphins dorment avec un œil ouvert. (Vrai !)',
                roulette: `🎡 Résultat : ${['🍓 Fraise', '💎 Diamant', '👑 Couronne', '⭐ Étoile'][Math.floor(Math.random() * 4)]}`,
                slot: `🎰 [ ${['🍓', '💎', '👑', '🔥'][Math.floor(Math.random() * 4)]} | ${['🍓', '💎', '👑', '🔥'][Math.floor(Math.random() * 4)]} | ${['🍓', '💎', '👑', '🔥'][Math.floor(Math.random() * 4)]} ]`,
                joke: 'Que dit une fraise sur un cheval ? Tagada ! 🍓',
                fact: 'Le cœur d’une baleine bleue est aussi grand qu’une petite voiture.',
                quote: '« Le succès n’est pas final, l’échec n’est pas fatal : c’est le courage de continuer qui compte. »',
                roast: 'Même Google ne trouve pas ce que tu essaies de faire.'
            };

            await sendMediaWithButton(
                sock,
                remoteJid,
                mek,
                boxText(command.toUpperCase(), [
                    funData[command]
                ])
            );

            break;
        }

        // ========================================
        // 6. OWNER & BOT
        // ========================================

        case 'ping':
        case 'alive':
        case 'runtime': {
            await sendMediaWithButton(
                sock,
                remoteJid,
                mek,
                boxText('KAYSEUR MDX • STATUT', [
                    'État : EN LIGNE 🟢',
                    `Uptime : ${Math.floor(process.uptime())}s`,
                    'Commandes actives : 100',
                    `Préfixe : ${config.prefix}`
                ])
            );

            break;
        }

        case 'owner': {
            await sendMediaWithButton(
                sock,
                remoteJid,
                mek,
                boxText('PROPRIÉTAIRE DU BOT', [
                    `Nom : ${config.ownerName || 'MR KING KAYSEUR'}`,
                    `Bot : ${config.botName || 'KAYSEUR_MDX'}`,
                    `Chaîne : ${CHANNEL_LINK}`
                ])
            );

            break;
        }

        case 'public': {
            if (!(await requireOwner())) break;

            config.publicMode = true;

            await sendBox('MODE PUBLIC', [
                'Le bot répond désormais à tout le monde.'
            ]);

            break;
        }

        case 'private': {
            if (!(await requireOwner())) break;

            config.publicMode = false;

            await sendBox('MODE PRIVÉ', [
                'Le bot répond uniquement au propriétaire.'
            ]);

            break;
        }

        case 'block':
        case 'unblock': {
            if (!(await requireOwner())) break;

            const number = text.replace(/\D/g, '');

            if (!number) {
                return sendBox(command.toUpperCase(), [
                    'Indique le numéro à bloquer/débloquer.'
                ]);
            }

            await sock.updateBlockStatus(
                `${number}@s.whatsapp.net`,
                command
            );

            await sendBox(command.toUpperCase(), [
                `Numéro ${number} mis à jour.`
            ]);

            break;
        }

        default:
            break;
    }
}

module.exports = { handleCommand };
