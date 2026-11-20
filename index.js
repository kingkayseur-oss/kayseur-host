
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

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

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
// EXTRACTION DES MESSAGES WHATSAPP
// ======================================

function extractMessageBody(message) {
    if (!message) return '';

    // Messages simples
    if (typeof message.conversation === 'string') {
        return message.conversation;
    }

    if (message.extendedTextMessage?.text) {
        return message.extendedTextMessage.text;
    }

    // Messages avec légende
    if (message.imageMessage?.caption) {
        return message.imageMessage.caption;
    }

    if (message.videoMessage?.caption) {
        return message.videoMessage.caption;
    }

    if (message.documentMessage?.caption) {
        return message.documentMessage.caption;
    }

    // Boutons et listes
    if (message.buttonsResponseMessage?.selectedButtonId) {
        return message.buttonsResponseMessage.selectedButtonId;
    }

    if (message.listResponseMessage?.singleSelectReply?.selectedRowId) {
        return message.listResponseMessage.singleSelectReply.selectedRowId;
    }

    if (message.templateButtonReplyMessage?.selectedId) {
        return message.templateButtonReplyMessage.selectedId;
    }

    // Messages interactifs
    if (message.interactiveResponseMessage?.body?.text) {
        return message.interactiveResponseMessage.body.text;
    }

    // Messages enveloppés par WhatsApp
    const wrappers = [
        'ephemeralMessage',
        'viewOnceMessage',
        'viewOnceMessageV2',
        'viewOnceMessageV2Extension',
        'documentWithCaptionMessage'
    ];

    for (const wrapper of wrappers) {
        if (message[wrapper]?.message) {
            const result = extractMessageBody(message[wrapper].message);
            if (result) return result;
        }
    }

    return '';
}

// ======================================
// PRÉPARATION DU PAIRING
// ======================================

function resetPairingReadiness() {
    pairingReadyPromise = new Promise(resolve => {
        pairingReadyResolver = resolve;
    });
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

// ======================================
// API PAIRING
// ======================================

app.get('/api/pairing', async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');

    const phone = String(req.query.phone || '').replace(/\D/g, '');

    if (!phone || phone.length < 8 || phone.length > 15) {
        return res.status(400).json({
            error: 'NUMERO INVALIDE'
        });
    }

    if (!waSock) {
        return res.status(503).json({
            error: 'WHATSAPP EN ATTENTE'
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
        return res.json({ code: pairingCode });
    }

    if (pairingCode && pairingPhone !== phone) {
        return res.status(409).json({
            error: 'UN CODE EXISTE DEJA',
            details: 'Redémarre le service pour utiliser un autre numéro.'
        });
    }

    if (pairingInProgress) {
        return res.status(409).json({
            error: 'DEMANDE DE PAIRING EN COURS'
        });
    }

    const currentSocket = waSock;

    pairingInProgress = (async () => {
        try {
            console.log('[PAIRING] Attente de WhatsApp...');

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
            console.log('[PAIRING ERROR]', error.message);

            pairingCode = null;
            pairingPhone = null;
            pairingCodeTime = 0;

            throw error;
        }
    })();

    try {
        const code = await pairingInProgress;
        return res.json({ code });

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
        return res.json({ qr: qrDataUrl });

    } catch (error) {
        console.log('[QR ERROR]', error.message);

        return res.status(500).json({
            error: 'QR_GENERATION_ERROR'
        });
    }
});

// ======================================
// SERVEUR EXPRESS
// ======================================

app.listen(PORT, () => {
    console.log(`[SERVER] KAYSEUR MDX lancé sur le port ${PORT}`);
});

// ======================================
// DÉMARRAGE TELEGRAM
// ======================================

if (telegramBot && typeof telegramBot.launch === 'function') {
    telegramBot.launch()
        .then(() => {
            console.log('[TELEGRAM] Bot démarré.');
        })
        .catch(error => {
            console.log('[TELEGRAM ERROR]', error.message);
        });
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
            fs.mkdirSync(sessionPath, { recursive: true });
        }

        const { state, saveCreds } =
            await useMultiFileAuthState(sessionPath);

        latestQR = null;
        pairingCode = null;
        pairingPhone = null;
        pairingCodeTime = 0;
        pairingInProgress = null;

        resetPairingReadiness();

        const sock = makeWASocket({
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: state,
            browser: ['Ubuntu', 'Chrome', '20.0.04'],
            markOnlineOnConnect: false,
            syncFullHistory: false
        });

        waSock = sock;

        sock.ev.on('creds.update', saveCreds);

        // ======================================
        // CONNEXION WHATSAPP
        // ======================================

        sock.ev.on('connection.update', async update => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                latestQR = qr;

                if (pairingReadyResolver) {
                    pairingReadyResolver(true);
                    pairingReadyResolver = null;
                }

                console.log('[WHATSAPP] QR disponible.');
            }

            if (connection === 'connecting') {
                console.log('[WHATSAPP] Connexion en cours...');
            }

            if (connection === 'open') {
                latestQR = null;

                pairingCode = null;
                pairingPhone = null;
                pairingCodeTime = 0;
                pairingInProgress = null;

                if (pairingReadyResolver) {
                    pairingReadyResolver(false);
                    pairingReadyResolver = null;
                }

                console.log('[WHATSAPP] KAYSEUR MDX connecté !');
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
                    statusCode
                );

                latestQR = null;

                if (waSock === sock) {
                    waSock = null;
                }

                pairingCode = null;
                pairingPhone = null;
                pairingCodeTime = 0;
                pairingInProgress = null;

                if (pairingReadyResolver) {
                    pairingReadyResolver(false);
                    pairingReadyResolver = null;
                }

                if (shouldReconnect && !reconnectTimer) {
                    reconnectTimer = setTimeout(() => {
                        reconnectTimer = null;
                        startWhatsAppBot();
                    }, 3000);

                } else if (!shouldReconnect) {
                    console.log(
                        '[WHATSAPP] Session déconnectée. Reconnexion nécessaire.'
                    );
                }
            }
        });

        // ======================================
        // RÉCEPTION ET TRAITEMENT DES COMMANDES
        // ======================================

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (!Array.isArray(messages)) return;

            for (const mek of messages) {
                try {
                    if (!mek || !mek.message) continue;

                    const remoteJid = mek.key?.remoteJid;

                    if (!remoteJid || remoteJid === 'status@broadcast') {
                        continue;
                    }

                    const body = extractMessageBody(mek.message);

                    if (!body || typeof body !== 'string') {
                        continue;
                    }

                    const cleanBody = body.trim();

                    if (!cleanBody) continue;

                    // Préfixes acceptés
                    const prefixes = [
                        config.prefix,
                        '🍓',
                        '.'
                    ].filter(Boolean);

                    const uniquePrefixes = [...new Set(prefixes)]
                        .sort((a, b) => b.length - a.length);

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

                    const pushName =
                        mek.pushName || 'UTILISATEUR';

                    console.log(
                        `[COMMAND] ${command} | chat=${remoteJid} | type=${type}`
                    );

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
                    console.log(
                        '[COMMAND ERROR]',
                        error.stack || error.message
                    );
                }
            }
        });

        // ======================================
        // WELCOME ET GOODBYE
        // ======================================

        sock.ev.on('group-participants.update', async update => {
            const { id, participants, action } = update;

            try {
                const metadata = await sock.groupMetadata(id);

                const groupIcon = await sock
                    .profilePictureUrl(id, 'image')
                    .catch(() => 'https://i.imgur.com/1Z2x3Y1.png');

                const botIcon =
                    config.menuImage &&
                    fs.existsSync(config.menuImage)
                        ? fs.readFileSync(config.menuImage)
                        : { url: groupIcon };

                const adminsCount = metadata.participants.filter(
                    participant => participant.admin
                ).length;

                for (const user of participants) {
                    if (action === 'add') {
                        const welcomeCaption = boxText('WELCOME', [
                            'BOT : KAYSEUR MDX',
                            `BIENVENUE : @${user.split('@')[0]}`,
                            'BIENVENUE DANS LE GROUPE !',
                            `CHAINE : ${config.channelLink}`
                        ]);

                        await sock.sendMessage(id, {
                            image: botIcon,
                            caption: welcomeCaption,
                            mentions: [user]
                        });

                    } else if (action === 'remove') {
                        const goodbyeCaption = boxText('GOODBYE', [
                            `MEMBRE : @${user.split('@')[0]}`,
                            `ADMINS RESTANTS : ${adminsCount}`,
                            'AU REVOIR ET BONNE CONTINUATION !',
                            `CHAINE : ${config.channelLink}`
                        ]);

                        await sock.sendMessage(id, {
                            image: { url: groupIcon },
                            caption: goodbyeCaption,
                            mentions: [user]
                        });
                    }
                }

            } catch (error) {
                console.log(
                    '[WELCOME ERROR]',
                    error.message
                );
            }
        });

    } catch (error) {
        console.log(
            '[WHATSAPP START ERROR]',
            error.stack || error.message
        );

        waSock = null;

        if (pairingReadyResolver) {
            pairingReadyResolver(false);
            pairingReadyResolver = null;
        }

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
// LANCEMENT DU BOT
// ======================================

startWhatsAppBot();
