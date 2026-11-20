
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pino = require('pino');

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require('@whiskeysockets/baileys');

const MAX_SESSIONS = 100;
const SESSION_DIR = path.resolve(
    process.env.SESSION_DIR || './sessions'
);

const sessions = new Map();
const logger = pino({ level: 'silent' });

fs.mkdirSync(SESSION_DIR, { recursive: true });

function generateId() {
    return crypto.randomBytes(24).toString('hex');
}

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function getSessionFolder(id) {
    return path.join(SESSION_DIR, id);
}

function countStoredSessions() {
    if (!fs.existsSync(SESSION_DIR)) return 0;

    return fs.readdirSync(SESSION_DIR, {
        withFileTypes: true
    }).filter(item => {
        if (!item.isDirectory()) return false;

        const metadata = path.join(
            SESSION_DIR,
            item.name,
            'session.json'
        );

        return fs.existsSync(metadata);
    }).length;
}

function getSessionCount() {
    return countStoredSessions();
}

function getActiveSessionCount() {
    return [...sessions.values()].filter(session =>
        session.status === 'connected' ||
        session.status === 'qr' ||
        session.status === 'starting' ||
        session.status === 'reconnecting'
    ).length;
}

function resolveReady(session, value) {
    if (session.resolveReady) {
        session.resolveReady(value);
        session.resolveReady = null;
    }
}

function createReadyPromise(session) {
    session.readyPromise = new Promise(resolve => {
        session.resolveReady = resolve;
    });
}

function scheduleReconnect(session) {
    if (
        session.stopped ||
        session.status === 'logged_out' ||
        session.reconnectTimer
    ) {
        return;
    }

    session.status = 'reconnecting';

    session.reconnectTimer = setTimeout(async () => {
        session.reconnectTimer = null;

        try {
            await startSocket(
                session,
                session.attachSocketEvents
            );
        } catch (error) {
            console.error(
                'Erreur reconnexion session:',
                session.id,
                error.message
            );

            scheduleReconnect(session);
        }
    }, 5000);
}

async function startSocket(session, attachSocketEvents) {
    if (session.stopped) {
        throw new Error('Session arrêtée');
    }

    if (session.startPromise) {
        return session.startPromise;
    }

    session.attachSocketEvents =
        attachSocketEvents || session.attachSocketEvents;

    session.startPromise = (async () => {
        try {
            session.status = 'starting';
            session.qr = null;

            const folder = getSessionFolder(session.id);

            fs.mkdirSync(folder, { recursive: true });

            const {
                state,
                saveCreds
            } = await useMultiFileAuthState(folder);

            const sock = makeWASocket({
                auth: state,
                logger,
                printQRInTerminal: false,
                browser: [
                    'KAYSEUR MDX',
                    'Chrome',
                    '1.0.0'
                ],
                syncFullHistory: false,
                markOnlineOnConnect: false
            });

            session.socket = sock;
            session.registered = Boolean(
                state.creds.registered
            );

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', update => {
                if (
                    session.socket !== sock ||
                    session.stopped
                ) {
                    return;
                }

                const {
                    connection,
                    lastDisconnect,
                    qr
                } = update;

                if (qr) {
                    session.qr = qr;
                    session.status = 'qr';
                    resolveReady(session, true);
                }

                if (connection === 'open') {
                    session.status = 'connected';
                    session.registered = true;
                    session.qr = null;

                    resolveReady(session, true);

                    console.log(
                        'Session connectée:',
                        session.id
                    );
                }

                if (connection === 'close') {
                    const statusCode =
                        lastDisconnect?.error?.output?.statusCode;

                    session.qr = null;

                    if (
                        statusCode === DisconnectReason.loggedOut
                    ) {
                        session.status = 'logged_out';
                        session.registered = false;
                        resolveReady(session, false);

                        console.log(
                            'Session déconnectée:',
                            session.id
                        );
                    } else {
                        session.status = 'reconnecting';
                        scheduleReconnect(session);
                    }
                }
            });

            if (session.attachSocketEvents) {
                session.attachSocketEvents(sock, session);
            }

            return sock;
        } finally {
            session.startPromise = null;
        }
    })();

    return session.startPromise;
}

async function createSession(attachSocketEvents) {
    const currentCount = getSessionCount();

    if (currentCount >= MAX_SESSIONS) {
        throw new Error('Limite de 100 sessions atteinte');
    }

    const id = generateId();
    const accessToken = generateToken();
    const folder = getSessionFolder(id);

    const session = {
        id,
        accessToken,
        createdAt: Date.now(),
        status: 'starting',
        registered: false,
        qr: null,
        socket: null,
        reconnectTimer: null,
        startPromise: null,
        stopped: false,
        attachSocketEvents
    };

    createReadyPromise(session);

    fs.mkdirSync(folder, { recursive: true });

    try {
        const metadata = {
            id,
            accessToken,
            createdAt: session.createdAt
        };

        const metadataPath = path.join(
            folder,
            'session.json'
        );

        fs.writeFileSync(
            metadataPath,
            JSON.stringify(metadata, null, 2),
            { mode: 0o600 }
        );

        try {
            fs.chmodSync(metadataPath, 0o600);
        } catch (_) {}

        sessions.set(id, session);

        await startSocket(session, attachSocketEvents);

        return session;
    } catch (error) {
        sessions.delete(id);

        fs.rmSync(folder, {
            recursive: true,
            force: true
        });

        throw error;
    }
}

async function restoreSessions(attachSocketEvents) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });

    const folders = fs.readdirSync(SESSION_DIR, {
        withFileTypes: true
    }).filter(item => item.isDirectory());

    for (const item of folders) {
        const folder = path.join(
            SESSION_DIR,
            item.name
        );

        const metadataPath = path.join(
            folder,
            'session.json'
        );

        if (!fs.existsSync(metadataPath)) continue;

        try {
            const metadata = JSON.parse(
                fs.readFileSync(metadataPath, 'utf8')
            );

            if (
                !metadata.id ||
                !metadata.accessToken ||
                metadata.id !== item.name
            ) {
                continue;
            }

            if (sessions.has(metadata.id)) continue;

            const session = {
                id: metadata.id,
                accessToken: metadata.accessToken,
                createdAt: metadata.createdAt || Date.now(),
                status: 'starting',
                registered: false,
                qr: null,
                socket: null,
                reconnectTimer: null,
                startPromise: null,
                stopped: false,
                attachSocketEvents
            };

            createReadyPromise(session);
            sessions.set(session.id, session);

        } catch (error) {
            console.error(
                'Métadonnées invalides:',
                item.name
            );
        }
    }

    const restored = [...sessions.values()];

    await Promise.allSettled(
        restored.map(session =>
            startSocket(session, attachSocketEvents)
                .catch(error => {
                    console.error(
                        'Restauration impossible:',
                        session.id,
                        error.message
                    );

                    scheduleReconnect(session);
                })
        )
    );

    console.log(
        `Sessions restaurées: ${sessions.size}/${MAX_SESSIONS}`
    );
}

function getSession(id) {
    return sessions.get(id) || null;
}

function authenticateSession(id, token) {
    const session = getSession(id);

    if (!session || !token) return null;

    const savedToken = Buffer.from(session.accessToken);
    const receivedToken = Buffer.from(String(token));

    if (savedToken.length !== receivedToken.length) {
        return null;
    }

    if (!crypto.timingSafeEqual(savedToken, receivedToken)) {
        return null;
    }

    return session;
}

function stopSession(id) {
    const session = getSession(id);

    if (!session) return false;

    session.stopped = true;
    session.status = 'stopped';

    if (session.reconnectTimer) {
        clearTimeout(session.reconnectTimer);
        session.reconnectTimer = null;
    }

    resolveReady(session, false);

    try {
        session.socket?.end(undefined);
    } catch (_) {}

    sessions.delete(id);

    return true;
}

module.exports = {
    MAX_SESSIONS,
    createSession,
    restoreSessions,
    getSession,
    authenticateSession,
    getSessionCount,
    getActiveSessionCount,
    stopSession
};
