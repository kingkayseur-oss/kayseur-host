
const express = require('express');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require('@whiskeysockets/baileys');

const { Boom } = require('@hapi/boom');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const QRCode = require('qrcode');

const config = require('./config');
const { boxText } = require('./src/font');
const { handleCommand } = require('./src/commands/handler');
const telegramBot = require('./src/telegram');

const app = express();
const PORT = process.env.PORT || 3000;

// ======================================
// VARIABLES
// ======================================

let waSock = null;
let latestQR = null;

let startingWhatsApp = false;
let reconnectTimer = null;

let pairingInProgress = null;
let pairingCode = null;
let pairingPhone = null;
let pairingCodeTime = 0;

let pairingReadyPromise = Promise.resolve(false);
let pairingReadyResolver = null;

const PAIRING_CACHE_TIME = 45000;
const PAIRING_READY_TIMEOUT = 20000;

// ======================================
// EXPRESS
// ======================================

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '1mb' }));

app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');

    if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
    }

    return res.send('KAYSEUR MDX is running.');
});

// ======================================
// EXTRACTION DES MESSAGES
// ======================================

function extractMessageBody(message) {
    if (!message) return '';

    if (typeof message.conversation === 'string') {
        return message.conversation;
    }

    if (message.extendedTextMessage?.text) {
        return message.extendedTextMessage.text;
    }

    if (message.imageMessage?.caption) {
        return message.imageMessage.caption;
    }

    if (message.videoMessage?.caption) {
        return message.videoMessage.caption;
    }

    if (message.documentMessage?.caption) {
        return message.documentMessage.caption;
    }

    if (message.buttonsResponseMessage?.selectedButtonId) {
        return message.buttonsResponseMessage.selectedButtonId;
    }

    if (message.listResponseMessage?.singleSelectReply?.selectedRowId) {
        return message.listResponseMessage.singleSelectReply.selectedRowId;
    }

    if (message.templateButtonReplyMessage?.selectedId) {
        return message.templateButtonReplyMessage.selectedId;
    }

    if (message.interactiveResponseMessage?.body?.text) {
        return message.interactiveResponseMessage.body.text;
    }

    if (message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
        try {
            const params = JSON.parse(
                message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson
            );

            return params.id || params.selected_id || '';
        } catch {
            return '';
        }
    }

    const wrappers = [
        'ephemeralMessage',
        'viewOnceMessage',
        'viewOnceMessageV2',
        'viewOnceMessageV2Extension',
        'documentWithCaptionMessage'
    ];

    for (const wrapper of wrappers) {
        if (message[wrapper]?.message) {
            const result = extractMessageBody(
                message[wrapper].message
            );

            if (result) return result;
        }
    }

    return '';
}

// ======================================
// PAIRING
// ======================================

function resetPairingReadiness() {
    pairingReadyPromise = new Promise(resolve => {
        pairingReadyResolver = resolve;
    });
}

function resolvePairingReadiness(value) {
    if (pairingReadyResolver) {
        pairingReadyResolver(value);
        pairingReadyResolver = null;
    }
}

async function waitForPairingReady() {
    let timeout;

    try {
        return await Promise.race([
            pairingReadyPromise,
            new Promise(resolve => {
                timeout = setTimeout(
                    () => resolve(false),
                    PAIRING_READY_TIMEOUT
                );
            })
        ]);
    } finally {
        clearTimeout(timeout);
    }
}

function clearPairingData() {
    pairingCode = null;
    pairingPhone = null;
    pairingCodeTime = 0;
    pairingInProgress = null;
}

// ======================================
// API PAIRING
// ======================================

app.get('/api/pairing', async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');

    const phone = String(req.query.phone || '')
        .replace(/\D/g, '');

    if (!phone || phone.length < 8 || phone.length > 15) {
        return res.status(400).json({
            error: 'NUMERO INVALIDE',
            details: 'Entre le numéro avec son indicatif international.'
        });
    }

    if (!waSock) {
        return res.status(503).json({
            error: 'WHATSAPP EN ATTENTE',
            details: 'Le bot WhatsApp est en cours de démarrage.'
        });
    }

    if (waSock.authState.creds.registered) {
        return res.status(409).json({
            error: 'WHATSAPP DEJA CONNECTE'
        });
    }

    if (
        pairingCode &&
        pairingPhone === phone &&
        Date.now() - pairingCodeTime < PAIRING_CACHE_TIME
    ) {
        return res.json({
            code: pairingCode
        });
    }

    if (pairingInProgress) {
        return res.status(409).json({
            error: 'PAIRING EN COURS',
            details: 'Attends la fin de la demande actuelle.'
        });
    }

    if (pairingCode && pairingPhone !== phone) {
        return res.status(409).json({
            error: 'CODE EXISTANT',
            details: 'Un code existe déjà. Attends son expiration ou redémarre le service.'
        });
    }

    const currentSocket = waSock;

    pairingInProgress = (async () => {
        try {
            console.log('[PAIRING] Préparation de la connexion...');

            const ready = await waitForPairingReady();

            if (!ready) {
                throw new Error('WHATSAPP_NOT_READY');
            }

            if (
                !waSock ||
                waSock !== currentSocket ||
                currentSocket.authState.creds.registered
            ) {
                throw new Error('SESSION_NOT_AVAILABLE');
            }

            const code = await currentSocket.requestPairingCode(phone);

            if (!code || typeof code !== 'string') {
                throw new Error('EMPTY_PAIRING_CODE');
            }

            if (waSock !== currentSocket) {
                throw new Error('SOCKET_CHANGED');
            }

            pairingPhone = phone;
            pairingCode = code.match(/.{1,4}/g)?.join('-') || code;
            pairingCodeTime = Date.now();

            console.log('[PAIRING] Code généré.');

            return pairingCode;

        } catch (error) {
            console.error('[PAIRING ERROR]', error.message);

            clearPairingData();

            throw error;
        }
    })();

    try {
        const code = await pairingInProgress;

        return res.json({
            code
        });

    } catch (error) {
        return res.status(503).json({
            error: 'ERREUR DE PAIRING',
            details: error.message
        });

    } finally {
        pairingInProgress = null;
    }
});

// ======================================
// API QR CODE
// ======================================

app.get('/api/qr', async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (!latestQR) {
        return res.json({
            status: 'EN ATTENTE DU QR...'
        });
    }

    try {
        const qrDataUrl = await QRCode.toDataURL(latestQR);

        return res.json({
            qr: qrDataUrl
        });

    } catch (error) {
        console.error('[QR ERROR]', error.message);

        return res.status(500).json({
            error: 'QR_GENERATION_ERROR'
        });
    }
});

// ======================================
// STATUS
// ======================================

app.get('/api/status', (req, res) => {
    res.set('Cache-Control', 'no-store');

    res.json({
        server: 'online',
        whatsapp: waSock ? 'starting' : 'offline',
        telegram: telegramBot ? 'configured' : 'disabled'
    });
});

// ======================================
// SERVEUR
// ======================================

app.listen(PORT, () => {
    console.log(`[SERVER] KAYSEUR MDX lancé sur le port ${PORT}`);
});

// ======================================
// TELEGRAM OPTIONNEL
// ======================================

if (telegramBot && typeof telegramBot.launch === 'function') {
    telegramBot.launch()
        .then(() => {
            console.log('[TELEGRAM] Bot démarré.');
        })
        .catch(error => {
            console.error('[TELEGRAM ERROR]', error.message);
        });
} else {
    console.log('[TELEGRAM] Désactivé. WhatsApp continue normalement.');
}

// ======================================
// DÉMARRAGE WHATSAPP
// ======================================

async function startWhatsAppBot() {
    if (startingWhatsApp) return;

    startingWhatsApp = true;

    try {
        const sessionPath = path.join(__dirname, 'session');

        if (!fs.existsSync(sessionPath)) {
            fs.mkdirSync(sessionPath, {
                recursive: true
            });
        }

        const { state, saveCreds } =
            await useMultiFileAuthState(sessionPath);

        latestQR = null;
        clearPairingData();

        resetPairingReadiness();

        const sock = makeWASocket({
            logger: pino({
                level: 'silent'
            }),

            printQRInTerminal: false,

            auth: state,

            browser: [
                'Ubuntu',
                'Chrome',
                '20.0.04'
            ],

            markOnlineOnConnect: false,
            syncFullHistory: false
        });

        waSock = sock;

        sock.ev.on('creds.update', saveCreds);

        // ======================================
        // CONNEXION
        // ======================================

        sock.ev.on('connection.update', async update => {
            const {
                connection,
                lastDisconnect,
                qr
            } = update;

            if (qr) {
                latestQR = qr;
                resolvePairingReadiness(true);

                console.log('[WHATSAPP] QR disponible.');
            }

            if (connection === 'connecting') {
                console.log('[WHATSAPP] Connexion en cours...');
            }

            if (connection === 'open') {
                latestQR = null;

                clearPairingData();
                resolvePairingReadiness(false);

                console.log('[WHATSAPP] KAYSEUR MDX connecté !');
                console.log('[WHATSAPP] Connexion WhatsApp réussie.');
            }

            if (connection === 'close') {
                const statusCode =
                    lastDisconnect?.error instanceof Boom
                        ? lastDisconnect.error.output?.statusCode
                        : lastDisconnect?.error?.output?.statusCode ||
                          lastDisconnect?.error?.statusCode;

                const shouldReconnect =
                    statusCode !== DisconnectReason.loggedOut;

                console.log(
                    '[WHATSAPP] Connexion fermée :',
                    statusCode || 'raison inconnue'
                );

                latestQR = null;

                if (waSock === sock) {
                    waSock = null;
                }

                clearPairingData();
                resolvePairingReadiness(false);

                if (shouldReconnect && !reconnectTimer) {
                    console.log('[WHATSAPP] Reconnexion dans 3 secondes...');

                    reconnectTimer = setTimeout(() => {
                        reconnectTimer = null;
                        startWhatsAppBot();
                    }, 3000);

                } else if (!shouldReconnect) {
                    console.log(
                        '[WHATSAPP] Session déconnectée. Une nouvelle connexion est nécessaire.'
                    );
                }
            }
        });

        // ======================================
        // MESSAGES ET COMMANDES
        // ======================================

        sock.ev.on('messages.upsert', async ({ messages }) => {
            if (!Array.isArray(messages)) return;

            for (const mek of messages) {
                try {
                    if (!mek || !mek.message) continue;

                    const remoteJid = mek.key?.remoteJid;

                    if (
                        !remoteJid ||
                        remoteJid === 'status@broadcast'
                    ) {
                        continue;
                    }

                    if (mek.key?.fromMe) continue;

                    const body = extractMessageBody(mek.message);

                    if (!body || typeof body !== 'string') continue;

                    const cleanBody = body.trim();

                    if (!cleanBody) continue;

                    const prefixes = [
                        config.prefix,
                        '🍓',
                        '.'
                    ].filter(Boolean);

                    const uniquePrefixes = [
                        ...new Set(prefixes)
                    ].sort((a, b) => b.length - a.length);

                    const usedPrefix = uniquePrefixes.find(prefix =>
                        cleanBody.startsWith(prefix)
                    );

                    if (!usedPrefix) continue;

                    const commandText = cleanBody
                        .slice(usedPrefix.length)
                        .trim();

                    if (!commandText) continue;

                    const parts = commandText.split(/\s+/);

                    const command = parts.shift().toLowerCase();
                    const args = parts;

                    if (!command) continue;

                    const pushName = mek.pushName || 'UTILISATEUR';

                    console.log(`[COMMAND] ${command} | ${remoteJid}`);

                    await handleCommand(
                        sock,
                        mek,
                        body,
                        command,
                        args,
                        pushName
                    );

                    console.log(`[COMMAND OK] ${command}`);

                } catch (error) {
                    console.error(
                        '[COMMAND ERROR]',
                        error.stack || error.message
                    );
                }
            }
        });

        // ======================================
        // WELCOME / GOODBYE — KAYSEUR MDX
        // ======================================

        sock.ev.on('group-participants.update', async update => {
            const { id, participants, action } = update;

            try {
                if (!id || !Array.isArray(participants)) return;
                if (action !== 'add' && action !== 'remove') return;

                const metadata = await sock.groupMetadata(id);

                const groupName = metadata.subject || 'GROUPE';
                const groupDescription =
                    metadata.desc || 'Aucune description définie';

                const membersCount = metadata.participants.length;

                const channelLink = config.channelLink || '';

                const buttons = /^https?:\/\//i.test(channelLink)
                    ? [{
                        index: 1,
                        urlButton: {
                            displayText: '📢 VOIR NOTRE CHAÎNE',
                            url: channelLink
                        }
                    }]
                    : [];

                for (const user of participants) {
                    const phone = user.split('@')[0];

                    let profilePicture = null;

                    try {
                        profilePicture = await sock.profilePictureUrl(
                            user,
                            'image'
                        );
                    } catch {
                        try {
                            profilePicture = await sock.profilePictureUrl(
                                id,
                                'image'
                            );
                        } catch {
                            profilePicture = null;
                        }
                    }

                    const isWelcome = action === 'add';

                    const title = isWelcome
                        ? 'WELCOME TO THE FAMILY'
                        : 'GOODBYE MEMBER';

                    const details = [
                        '╭━━〔 KAYSEUR MDX 〕━━╮',
                        '',
                        isWelcome
                            ? '✦ UN NOUVEAU MEMBRE NOUS REJOINT'
                            : '✦ UN MEMBRE NOUS QUITTE',
                        '',
                        `👤 MEMBRE : @${phone}`,
                        `👑 GROUPE : ${groupName}`,
                        `👥 MEMBRES : ${membersCount}`,
                        '',
                        '📜 DESCRIPTION DU GROUPE :',
                        groupDescription,
                        '',
                        isWelcome
                            ? '🔥 RESPECTE LES RÈGLES ET PROFITE DE LA FAMILLE !'
                            : '🖤 MERCI POUR TON PASSAGE. BONNE CONTINUATION !',
                        '',
                        '╰━━〔 MR KING KAYSEUR 〕━━╯'
                    ];

                    const caption = boxText(title, details);

                    if (profilePicture) {
                        const message = {
                            image: { url: profilePicture },
                            caption,
                            mentions: [user]
                        };

                        if (buttons.length) {
                            message.templateButtons = buttons;
                        }

                        await sock.sendMessage(id, message);

                    } else {
                        const message = {
                            text: caption,
                            mentions: [user]
                        };

                        if (buttons.length) {
                            message.templateButtons = buttons;
                        }

                        await sock.sendMessage(id, message);
                    }
                }

            } catch (error) {
                console.error(
                    '[WELCOME / GOODBYE ERROR]',
                    error.stack || error.message
                );
            }
        });

    } catch (error) {
        console.error(
            '[WHATSAPP START ERROR]',
            error.stack || error.message
        );

        waSock = null;
        resolvePairingReadiness(false);

        if (!reconnectTimer) {
            reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                startWhatsAppBot();
            }, 5000);
        }

    } finally {
        startingWhatsApp = false;
    }
}

// ======================================
// LANCEMENT FINAL
// ======================================

startWhatsAppBot();
