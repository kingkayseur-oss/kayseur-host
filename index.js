
const express = require('express');
const path = require('path');
const fs = require('fs');

const QRCode = require('qrcode');

const { Boom } = require('@hapi/boom');
const { DisconnectReason } = require('@whiskeysockets/baileys');

const config = require('./config');
const { boxText } = require('./src/font');
const { handleCommand } = require('./src/commands/handler');
const telegramBot = require('./src/telegram');

const {
    MAX_SESSIONS,
    createSession,
    restoreSessions,
    authenticateSession,
    getSessionCount,
    getActiveSessionCount
} = require('./src/sessionManager');

const app = express();
const PORT = process.env.PORT || 3000;

const PAIRING_READY_TIMEOUT = 20000;
const PAIRING_CACHE_TIME = 45000;

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

    res.send('KAYSEUR MDX is running.');
});

// ======================================
// LIMITATION DES CRÉATIONS
// ======================================

const creationRequests = new Map();

function creationRateLimit(req, res, next) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const windowTime = 60 * 60 * 1000;
    const maxRequests = 5;

    let data = creationRequests.get(ip);

    if (!data || now - data.startedAt > windowTime) {
        data = {
            startedAt: now,
            count: 0
        };
    }

    data.count++;
    creationRequests.set(ip, data);

    if (data.count > maxRequests) {
        return res.status(429).json({
            error: 'TROP DE DEMANDES',
            details: 'Réessaie plus tard.'
        });
    }

    next();
}

// ======================================
// AUTHENTIFICATION DES SESSIONS
// ======================================

function getAuthorizedSession(req) {
    const id = req.params.id;

    const authorization = String(
        req.headers.authorization || ''
    );

    const bearer = authorization.startsWith('Bearer ')
        ? authorization.slice(7)
        : '';

    const token = String(
        req.headers['x-session-token'] || bearer
    );

    return authenticateSession(id, token);
}

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
// ÉVÉNEMENTS DE CHAQUE SESSION
// ======================================

async function attachSocketEvents(sock, session) {

    // ======================================
    // CONNEXION
    // ======================================

    sock.ev.on('connection.update', update => {
        const { connection, lastDisconnect } = update;

        if (connection === 'connecting') {
            console.log(
                '[WHATSAPP]',
                session.id,
                'Connexion en cours...'
            );
        }

        if (connection === 'open') {
            console.log(
                '[WHATSAPP]',
                session.id,
                'Connecté !'
            );
        }

        if (connection === 'close') {
            const statusCode =
                lastDisconnect?.error instanceof Boom
                    ? lastDisconnect.error.output?.statusCode
                    : lastDisconnect?.error?.output?.statusCode ||
                      lastDisconnect?.error?.statusCode;

            if (statusCode === DisconnectReason.loggedOut) {
                console.log(
                    '[WHATSAPP]',
                    session.id,
                    'Session déconnectée définitivement.'
                );
            } else {
                console.log(
                    '[WHATSAPP]',
                    session.id,
                    'Connexion interrompue.'
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

                console.log(
                    `[COMMAND] ${session.id} | ${command} | ${remoteJid}`
                );

                await handleCommand(
                    sock,
                    mek,
                    body,
                    command,
                    args,
                    pushName
                );

                console.log(
                    `[COMMAND OK] ${session.id} | ${command}`
                );

            } catch (error) {
                console.error(
                    '[COMMAND ERROR]',
                    session.id,
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
                session.id,
                error.stack || error.message
            );
        }
    });
}

// ======================================
// CRÉER UNE NOUVELLE SESSION
// ======================================

app.post('/api/sessions', creationRateLimit, async (req, res) => {
    res.set('Cache-Control', 'no-store');

    try {
        if (getSessionCount() >= MAX_SESSIONS) {
            return res.status(503).json({
                error: 'LIMITE DE 100 SESSIONS ATTEINTE'
            });
        }

        const session = await createSession(attachSocketEvents);

        console.log('[SESSION CREATED]', session.id);

        return res.status(201).json({
            sessionId: session.id,
            token: session.accessToken,
            status: session.status,
            message: 'SESSION CRÉÉE. CONSERVE TON JETON PRIVÉ.'
        });

    } catch (error) {
        console.error(
            '[CREATE SESSION ERROR]',
            error.message
        );

        return res.status(500).json({
            error: error.message || 'SESSION_CREATION_FAILED'
        });
    }
});

// ======================================
// ATTENDRE QUE WHATSAPP SOIT PRÊT
// ======================================

async function waitForSessionReady(session) {
    if (session.qr || session.status === 'connected') {
        return true;
    }

    if (!session.readyPromise) {
        return false;
    }

    let timeout;

    try {
        return await Promise.race([
            session.readyPromise,
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
// PAIRING CODE PAR SESSION
// ======================================

app.post('/api/sessions/:id/pairing', async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');

    const session = getAuthorizedSession(req);

    if (!session) {
        return res.status(401).json({
            error: 'ACCÈS REFUSÉ'
        });
    }

    const phone = String(req.body.phone || '')
        .replace(/\D/g, '');

    if (phone.length < 8 || phone.length > 15) {
        return res.status(400).json({
            error: 'NUMERO INVALIDE',
            details: 'Entre le numéro avec son indicatif international.'
        });
    }

    if (session.registered) {
        return res.status(409).json({
            error: 'WHATSAPP DEJA CONNECTE'
        });
    }

    if (
        session.pairingCode &&
        session.pairingPhone === phone &&
        Date.now() - session.pairingCodeTime < PAIRING_CACHE_TIME
    ) {
        return res.json({
            code: session.pairingCode
        });
    }

    if (session.pairingInProgress) {
        return res.status(409).json({
            error: 'PAIRING EN COURS'
        });
    }

    session.pairingInProgress = (async () => {
        const ready = await waitForSessionReady(session);

        if (!ready || !session.socket || session.registered) {
            throw new Error('WHATSAPP_NOT_READY');
        }

        const code = await session.socket.requestPairingCode(phone);

        if (!code || typeof code !== 'string') {
            throw new Error('EMPTY_PAIRING_CODE');
        }

        session.pairingPhone = phone;

        session.pairingCode =
            code.match(/.{1,4}/g)?.join('-') || code;

        session.pairingCodeTime = Date.now();

        return session.pairingCode;
    })();

    try {
        const code = await session.pairingInProgress;

        return res.json({ code });

    } catch (error) {
        console.error(
            '[PAIRING ERROR]',
            session.id,
            error.message
        );

        return res.status(503).json({
            error: 'ERREUR DE PAIRING',
            details: error.message
        });

    } finally {
        session.pairingInProgress = null;
    }
});

// ======================================
// QR CODE PAR SESSION
// ======================================

app.get('/api/sessions/:id/qr', async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');

    const session = getAuthorizedSession(req);

    if (!session) {
        return res.status(401).json({
            error: 'ACCÈS REFUSÉ'
        });
    }

    if (!session.qr) {
        return res.json({
            status: session.status
        });
    }

    try {
        const qr = await QRCode.toDataURL(session.qr);

        return res.json({ qr });

    } catch (error) {
        console.error('[QR ERROR]', error.message);

        return res.status(500).json({
            error: 'QR_GENERATION_ERROR'
        });
    }
});

// ======================================
// STATUT D'UNE SESSION
// ======================================

app.get('/api/sessions/:id/status', (req, res) => {
    res.set('Cache-Control', 'no-store');

    const session = getAuthorizedSession(req);

    if (!session) {
        return res.status(401).json({
            error: 'ACCÈS REFUSÉ'
        });
    }

    return res.json({
        status: session.status,
        registered: session.registered
    });
});

// ======================================
// STATUT GÉNÉRAL DU SERVEUR
// ======================================

app.get('/api/status', (req, res) => {
    res.set('Cache-Control', 'no-store');

    res.json({
        server: 'online',
        sessions: getActiveSessionCount(),
        storedSessions: getSessionCount(),
        maxSessions: MAX_SESSIONS,
        telegram: telegramBot ? 'configured' : 'disabled'
    });
});

// ======================================
// SERVEUR
// ======================================

const server = app.listen(PORT, () => {
    console.log(
        `[SERVER] KAYSEUR MDX lancé sur le port ${PORT}`
    );
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
    console.log(
        '[TELEGRAM] Désactivé. WhatsApp continue normalement.'
    );
}

// ======================================
// RESTAURATION DES SESSIONS
// ======================================

async function restoreWhatsAppSessions() {
    try {
        await restoreSessions(attachSocketEvents);

        console.log(
            `[SESSIONS] ${getSessionCount()} session(s) enregistrée(s).`
        );

    } catch (error) {
        console.error(
            '[SESSION RESTORE ERROR]',
            error.stack || error.message
        );
    }
}

restoreWhatsAppSessions();

// ======================================
// ARRÊT DU SERVEUR
// ======================================

async function shutdown() {
    console.log('[SERVER] Arrêt demandé...');

    server.close();

    if (telegramBot && typeof telegramBot.stop === 'function') {
        try {
            telegramBot.stop('SIGTERM');
        } catch (_) {}
    }

    process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
