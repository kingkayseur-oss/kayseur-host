
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pino = require('pino');

const {
    default: makeWASocket,
    DisconnectReason,
    useMultiFileAuthState
} = require('@whiskeysockets/baileys');

const MAX_SESSIONS = 100;
const SESSION_DIR = path.resolve(
    process.env.SESSION_DIR || './sessions'
);

const sessions = new Map();

fs.mkdirSync(SESSION_DIR, { recursive: true });

function generateId() {
    return crypto.randomBytes(24).toString('hex');
}

function generateAccessToken() {
    return crypto.randomBytes(32).toString('hex');
}

function validId(id) {
    return typeof id === 'string' &&
        /^[a-f0-9]{48}$/.test(id);
}

function countStoredSessions() {
    return fs.readdirSync(SESSION_DIR, {
        withFileTypes: true
    }).filter(entry => {
        return entry.isDirectory() &&
            fs.existsSync(
                path.join(SESSION_DIR, entry.name, 'session.json')
            );
    }).length;
}

function saveMetadata(session) {
    const file = path.join(session.path, 'session.json');

    fs.writeFileSync(file, JSON.stringify({
        id: session.id,
        accessToken: session.accessToken,
        createdAt: session.createdAt
    }, null, 2), { mode: 0o600 });

    try {
        fs.chmodSync(file, 0o600);
    } catch (_) {}
}

function prepareReadyPromise(session) {
    session.readyPromise = new Promise(resolve => {
        session.resolveReady = resolve;
    });
}

async function startSocket(session, onSocket) {
    const { state, saveCreds } =
        await useMultiFileAuthState(session.path);

    prepareReadyPromise(session);

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        browser: ['KAYSEUR MDX', 'Chrome', '1.0.0'],
        markOnlineOnConnect: false,
        syncFullHistory: false
    });

    session.socket = sock;
    session.status = 'connecting';
    session.registered = Boolean(state.creds.registered);

    sock.ev.on('creds.update', async () => {
        try {
            await saveCreds();
            session.registered = Boolean(state.creds.registered);
        } catch (error) {
            console.error('[SESSION SAVE ERROR]', error.message);
        }
    });

    sock.ev.on('connection.update', update => {
        if (update.qr) {
            session.qr = update.qr;
            session.status = 'waiting_scan';
            session.resolveReady?.(true);
            session.resolveReady = null;
        }

        if (update.connection === 'connecting') {
            session.status = 'connecting';
        }

        if (update.connection === 'open') {
            session.qr = null;
            session.pairingCode = null;
            session.registered = true;
            session.status = 'connected';
            session.resolveReady?.(true);
            session.resolveReady = null;
        }

        if (update.connection === 'close') {
            const statusCode =
                update.lastDisconnect?.error?.output?.statusCode;

            session.qr = null;

            if (statusCode === DisconnectReason.loggedOut) {
                session.status = 'logged_out';
                session.resolveReady?.(false);
                session.resolveReady = null;
                return;
            }

            session.status = 'disconnected';
            session.resolveReady?.(false);
            session.resolveReady = null;

            if (!session.reconnectTimer) {
                session.reconnectTimer = setTimeout(async () => {
                    session.reconnectTimer = null;

                    if (!sessions.has(session.id)) return;

                    try {
                        await startSocket(session, onSocket);
                        console.log('[SESSION RECONNECTED]', session.id);
                    } catch (error) {
                        console.error(
                            '[SESSION RECONNECT ERROR]',
                            error.message
                        );
                    }
                }, 3000);

                session.reconnectTimer.unref?.();
            }
        }
    });

    if (typeof onSocket === 'function') {
        await onSocket(sock, session);
    }

    return sock;
}

function createSessionObject(id, accessToken, sessionPath, createdAt) {
    return {
        id,
        accessToken,
        path: sessionPath,
        socket: null,
        status: 'connecting',
        qr: null,
        pairingCode: null,
        registered: false,
        createdAt,
        resolveReady: null,
        readyPromise: null,
        reconnectTimer: null
    };
}

async function createSession(onSocket) {
    if (countStoredSessions() >= MAX_SESSIONS) {
        throw new Error('LIMIT_100_SESSIONS');
    }

    const id = generateId();
    const accessToken = generateAccessToken();
    const sessionPath = path.join(SESSION_DIR, id);

    fs.mkdirSync(sessionPath, { recursive: true });

    const session = createSessionObject(
        id,
        accessToken,
        sessionPath,
        Date.now()
    );

    try {
        saveMetadata(session);
        sessions.set(id, session);

        await startSocket(session, onSocket);

        return session;
    } catch (error) {
        sessions.delete(id);

        try {
            fs.rmSync(sessionPath, {
                recursive: true,
                force: true
            });
        } catch (_) {}

        throw error;
    }
}

async function restoreSessions(onSocket) {
    const entries = fs.readdirSync(SESSION_DIR, {
        withFileTypes: true
    });

    let restored = 0;

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (!validId(entry.name)) continue;
        if (restored >= MAX_SESSIONS) break;

        const sessionPath = path.join(SESSION_DIR, entry.name);
        const metadataPath = path.join(sessionPath, 'session.json');

        if (!fs.existsSync(metadataPath)) continue;

        try {
            const metadata = JSON.parse(
                fs.readFileSync(metadataPath, 'utf8')
            );

            if (
                metadata.id !== entry.name ||
                typeof metadata.accessToken !== 'string' ||
                !/^[a-f0-9]{64}$/.test(metadata.accessToken)
            ) {
                continue;
            }

            const session = createSessionObject(
                metadata.id,
                metadata.accessToken,
                sessionPath,
                metadata.createdAt || Date.now()
            );

            sessions.set(session.id, session);
            restored++;

            try {
                await startSocket(session, onSocket);
                console.log('[SESSION RESTORED]', session.id);
            } catch (error) {
                session.status = 'error';
                console.error(
                    '[SESSION RESTORE ERROR]',
                    session.id,
                    error.message
                );
            }
        } catch (error) {
            console.error('[SESSION METADATA ERROR]', error.message);
        }
    }

    return restored;
}

function getSession(id) {
    if (!validId(id)) return null;
    return sessions.get(id) || null;
}

function authenticateSession(id, token) {
    const session = getSession(id);

    if (!session || typeof token !== 'string') return null;

    const expected = Buffer.from(session.accessToken);
    const received = Buffer.from(token);

    if (expected.length !== received.length) return null;

    return crypto.timingSafeEqual(expected, received)
        ? session
        : null;
}

function getSessionCount() {
    return countStoredSessions();
}

function getActiveSessionCount() {
    return sessions.size;
}

async function stopSession(id) {
    const session = getSession(id);

    if (!session) return false;

    if (session.reconnectTimer) {
        clearTimeout(session.reconnectTimer);
    }

    try {
        session.socket?.end(undefined);
    } catch (error) {
        console.error('[SESSION STOP ERROR]', error.message);
    }

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
