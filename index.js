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

// Préparer l'attente du socket WhatsApp
function resetPairingReadiness() {
    pairingReadyPromise = new Promise(resolve => {
        pairingReadyResolver = resolve;
    });
}

// Attendre que Baileys soit prêt
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

// API PAIRING
app.get('/api/pairing', async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');

    const phone = String(req.query.phone || '').replace(/\D/g, '');

    if (!phone || phone.length < 8 || phone.length > 15) {
        return res.status(400).json({
            error: 'ɴᴜᴍᴇʀᴏ ɪɴᴠᴀʟɪᴅᴇ'
        });
    }

    if (!waSock) {
        return res.status(503).json({
            error: 'ᴡʜᴀᴛsᴀᴘᴘ ᴇɴ ᴀᴛᴛᴇɴᴛᴇ'
        });
    }

    if (waSock.authState.creds.registered) {
        return res.status(409).json({
            error: 'ᴡʜᴀᴛsᴀᴘᴘ ᴅᴇᴊᴀ ᴄᴏɴɴᴇᴄᴛᴇ'
        });
    }

    // Réutiliser le code déjà généré
    if (
        pairingCode &&
        pairingPhone === phone &&
        Date.now() - pairingCodeTime < PAIRING_CACHE_TIME
    ) {
        return res.json({ code: pairingCode });
    }

    // Un socket ne doit pas recevoir plusieurs demandes de pairing
    if (pairingCode && pairingPhone !== phone) {
        return res.status(409).json({
            error: 'ᴜɴ ᴄᴏᴅᴇ ᴇxɪsᴛᴇ ᴅᴇᴊᴀ',
            details: 'Redémarre le service pour demander un code pour un autre numéro.'
        });
    }

    // Éviter les demandes simultanées
    if (pairingInProgress) {
        return res.status(409).json({
            error: 'ᴅᴇᴍᴀɴᴅᴇ ᴅᴇ ᴘᴀɪʀɪɴɢ ᴇɴ ᴄᴏᴜʀs'
        });
    }

    const currentSocket = waSock;

    pairingInProgress = (async () => {
        try {
            console.log('[PAIRING] Attente de WhatsApp...');

            // IMPORTANT : attendre l'événement QR de Baileys
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

            console.log('[PAIRING] Génération du vrai code...');

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

            console.log('[PAIRING] Code généré avec succès.');

            return pairingCode;

        } catch (error) {
            console.log('[PAIRING ERROR]', error);

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
            error: 'ᴇʀʀᴇᴜʀ ᴅᴇ ᴘᴀɪʀɪɴɢ',
            details: error.message
        });

    } finally {
        pairingInProgress = null;
    }
});

// API QR
app.get('/api/qr', async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (!latestQR) {
        return res.json({
            status: 'ᴇɴ ᴀᴛᴛᴇɴᴛᴇ ᴅᴜ ǫʀ...'
        });
    }

    try {
        const qrDataUrl = await QRCode.toDataURL(latestQR);
        return res.json({ qr: qrDataUrl });

    } catch (error) {
        console.log('[QR ERROR]', error);

        return res.status(500).json({
            error: 'QR_GENERATION_ERROR'
        });
    }
});

// SERVEUR EXPRESS
app.listen(PORT, () => {
    console.log(
        `[🚀 SERVER] ᴋᴀʏsᴇᴜʀ_ᴍᴅx ʟᴀɴᴄᴇ sᴜʀ ʟᴇ ᴘᴏʀᴛ ${PORT}`
    );
});

// TELEGRAM
if (telegramBot && typeof telegramBot.launch === 'function') {
    telegramBot.launch().catch(error => {
        console.log('[TELEGRAM ERROR]', error);
    });
}

// DÉMARRAGE WHATSAPP
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

        // Réinitialiser le pairing pour cette connexion
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

        // Sauvegarder les identifiants
        sock.ev.on('creds.update', saveCreds);

        // ÉVÉNEMENTS DE CONNEXION
        sock.ev.on('connection.update', async update => {
            const { connection, lastDisconnect, qr } = update;

            // Baileys signale que le socket est prêt
            if (qr) {
                latestQR = qr;

                if (pairingReadyResolver) {
                    pairingReadyResolver(true);
                    pairingReadyResolver = null;
                }

                console.log('[WHATSAPP] QR disponible, socket prêt.');
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

                console.log(
                    '✅ [WHATSAPP] ᴋᴀʏsᴇᴜʀ_ᴍᴅx ᴄᴏɴɴᴇᴄᴛᴇ !'
                );
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
                        '[WHATSAPP] Session déconnectée. Authentification nécessaire.'
                    );
                }
            }
        });

        // RÉCEPTION DES MESSAGES (CORRIGÉ POUR PRENDRE EN COMPTE LE PRÉFIXE ET LA FRAISE 🍓)
        sock.ev.on('messages.upsert', async ({ messages }) => {
            for (const mek of messages) {
                if (!mek.message) continue;

                if (mek.key?.remoteJid === 'status@broadcast') {
                    continue;
                }

                const messageType = Object.keys(mek.message)[0];

                const body =
                    messageType === 'conversation'
                        ? mek.message.conversation
                        : messageType === 'extendedTextMessage'
                        ? mek.message.extendedTextMessage.text
                        : messageType === 'imageMessage'
                        ? mek.message.imageMessage.caption
                        : messageType === 'videoMessage'
                        ? mek.message.videoMessage.caption
                        : '';

                if (!body) continue;

                const cleanBody = body.trim();
                const activePrefix = config.prefix || '.';
                const hasValidPrefix = cleanBody.startsWith(activePrefix) || cleanBody.startsWith('🍓');

                if (!hasValidPrefix) {
                    continue;
                }

                const rawCommandText = cleanBody.startsWith('🍓') 
                    ? cleanBody.slice(1).trim() 
                    : cleanBody.slice(activePrefix.length).trim();

                const args = rawCommandText.split(/ +/);
                const command = args.shift()?.toLowerCase();

                if (!command) continue;

                const pushName = mek.pushName || 'ᴜᴛɪʟɪsᴀᴛᴇᴜʀ';

                try {
                    await handleCommand(
                        sock,
                        mek,
                        body,
                        command,
                        args,
                        pushName
                    );
                } catch (error) {
                    console.log('[COMMAND ERROR]', error);
                }
            }
        });

        // WELCOME & GOODBYE
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
                    p => p.admin
                ).length;

                for (const user of participants) {
                    if (action === 'add') {
                        const welcomeCaption = boxText('ᴡᴇʟᴄᴏᴍᴇ', [
                            `ʙᴏᴛ : ᴋᴀʏsᴇᴜʀ_ᴍᴅx`,
                            `ʙɪᴇɴᴠᴇɴᴜᴇ : @${user.split('@')[0]}`,
                            `ᴅᴇsᴄʀɪᴘᴛɪᴏɴ : ʙɪᴇɴᴠᴇɴᴜᴇ ᴅᴀɴs ʟᴇ ɢʀᴏᴜᴘᴇ !`,
                            `ᴄʜᴀɪɴᴇ : ${config.channelLink}`
                        ]);

                        await sock.sendMessage(id, {
                            image: botIcon,
                            caption: welcomeCaption,
                            mentions: [user],
                            buttons: [{
                                buttonId: 'voir_chaine',
                                buttonText: {
                                    displayText: '📢 ᴠᴏɪʀ ʟᴀ ᴄʜᴀɪɴᴇ'
                                },
                                type: 1
                            }]
                        });

                    } else if (action === 'remove') {
                        const goodbyeCaption = boxText('ɢᴏᴏᴅʙʏᴇ', [
                            `ᴍᴇᴍʙʀᴇ : @${user.split('@')[0]}`,
                            `ᴀᴅᴍɪɴs ʀᴇsᴛᴀɴᴛs : ${adminsCount}`,
                            `ᴅᴇsᴄʀɪᴘᴛɪᴏɴ : ᴀᴜ ʀᴇᴠᴏɪʀ ᴇᴛ ʙᴏɴɴᴇ ᴄᴏɴᴛɪɴᴜᴀᴛɪ𝙤ɴ !`,
                            `ᴄʜᴀɪɴᴇ : ${config.channelLink}`
                        ]);

                        await sock.sendMessage(id, {
                            image: { url: groupIcon },
                            caption: goodbyeCaption,
                            mentions: [user],
                            buttons: [{
                                buttonId: 'voir_chaine',
                                buttonText: {
                                    displayText: '📢 ᴠᴏɪʀ ʟᴀ ᴄʜᴀɪɴᴇ'
                                },
                                type: 1
                            }]
                        });
                    }
                }

            } catch (error) {
                console.log('Erreur welcome/goodbye:', error);
            }
        });

    } catch (error) {
        console.log('[WHATSAPP START ERROR]', error);

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

// LANCER LE BOT
startWhatsAppBot();
