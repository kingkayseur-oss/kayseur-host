
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

const PAIRING_CACHE_TIME = 45000;

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

    // Réutiliser le code déjà généré pour ce numéro
    if (
        pairingCode &&
        pairingPhone === phone &&
        Date.now() - pairingCodeTime < PAIRING_CACHE_TIME
    ) {
        return res.json({ code: pairingCode });
    }

    // Éviter plusieurs demandes simultanées
    if (pairingInProgress) {
        return res.status(409).json({
            error: 'ᴅᴇᴍᴀɴᴅᴇ ᴅᴇ ᴘᴀɪʀɪɴɢ ᴇɴ ᴄᴏᴜʀs'
        });
    }

    pairingInProgress = (async () => {
        try {
            if (!waSock || waSock.authState.creds.registered) {
                throw new Error('SESSION_NOT_AVAILABLE');
            }

            const currentSocket = waSock;

            const code = await currentSocket.requestPairingCode(phone);

            if (!code) {
                throw new Error('EMPTY_PAIRING_CODE');
            }

            // Vérifier que le socket n'a pas changé pendant la demande
            if (currentSocket !== waSock) {
                throw new Error('SOCKET_CHANGED');
            }

            pairingPhone = phone;
            pairingCode = code.match(/.{1,4}/g)?.join('-') || code;
            pairingCodeTime = Date.now();

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

app.get('/api/qr', async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (latestQR) {
        try {
            const qrDataUrl = await QRCode.toDataURL(latestQR);
            return res.json({ qr: qrDataUrl });
        } catch (error) {
            console.log('[QR ERROR]', error);
            return res.status(500).json({
                error: 'QR_GENERATION_ERROR'
            });
        }
    }

    return res.json({
        status: 'ᴇɴ ᴀᴛᴛᴇɴᴛᴇ ᴅᴜ ǫʀ...'
    });
});

app.listen(PORT, () => {
    console.log(
        `[🚀 SERVER] ᴋᴀʏsᴇᴜʀ_ᴍᴅx ʟᴀɴᴄᴇ sᴜʀ ʟᴇ ᴘᴏʀᴛ ${PORT}`
    );
});

// Telegram
if (telegramBot && typeof telegramBot.launch === 'function') {
    telegramBot.launch().catch(error => {
        console.log('[TELEGRAM ERROR]', error);
    });
}

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

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                latestQR = qr;
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

                console.log(
                    '✅ [WHATSAPP] ᴋᴀʏsᴇᴜʀ_ᴍᴅx ᴄᴏɴɴᴇᴄᴛᴇ !'
                );
            }

            if (connection === 'close') {
                const statusCode =
                    lastDisconnect?.error instanceof Boom
                        ? lastDisconnect.error.output?.statusCode
                        : lastDisconnect?.error?.output?.statusCode;

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

        // Réception et traitement des messages
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

                if (!body || !body.startsWith(config.prefix)) {
                    continue;
                }

                const args = body
                    .slice(config.prefix.length)
                    .trim()
                    .split(/ +/);

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

        // Welcome & Goodbye encadrés avec icône du bot/groupe et lien chaîne
        sock.ev.on('group-participants.update', async (update) => {
            const { id, participants, action } = update;

            try {
                const metadata = await sock.groupMetadata(id);

                const groupIcon = await sock
                    .profilePictureUrl(id, 'image')
                    .catch(() => 'https://i.imgur.com/1Z2x3Y1.png');

                const botIcon = fs.existsSync(config.menuImage)
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
                            `ᴅᴇsᴄʀɪᴘᴛɪᴏɴ : ᴀᴜ ʀᴇᴠᴏɪʀ ᴇᴛ ʙᴏɴɴᴇ ᴄᴏɴᴛɪɴᴜᴀᴛɪᴏɴ !`,
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

startWhatsAppBot();
