
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

fs.mkdirSync(SESSION_DIR, {
    recursive: true,
    mode: 0o700
});

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
                path.join(
                    SESSION_DIR,
                    entry.name,
                    'session.json'
                )
            );
    }).length;
}

function saveMetadata(session) {
    const file = path.join(
        session.path,
        'session.json'
    );

    fs.writeFileSync(
        file,
        JSON.stringify({
            id: session.id,
            accessToken: session.accessToken,
            createdAt: session.createdAt
        }, null, 2),
        { mode: 0o600 }
    );

    try {
        fs.chmodSync(file, 0o600);
        fs.chmodSync(session.path, 0o700);
    } catch (_) {}
}

function prepareReadyPromise(session) {
    session.readyPromise = new Promise(resolve => {
        session.resolveReady = resolve;
    });
}

function resolveReady(session, result) {
    if (session.resolveReady) {
        session.resolveReady(result);
        session.resolveReady = null;
    }
}

function scheduleReconnect(session, onSocket, delay = 3000) {
    if (
        session.stopped ||
        session.status === 'logged_out' ||
        session.reconnectTimer ||
        !sessions.has(session.id)
    ) {
        return;
    }

    session.reconnectTimer = setTimeout(async () => {
        session.reconnectTimer = null;

        if (
            session.stopped ||
            !sessions.has(session.id)
        ) {
            return;
        }

        try {
            await startSocket(session, onSocket);
            console.log('[SESSION RECONNECTED]', session.id);

        } catch (error) {
            session.status = 'error';

            console.error(
                '[SESSION RECONNECT ERROR]',
                session.id,
                error.message
            );

            scheduleReconnect(session, onSocket, 5000);
        }
    }, delay);

    session.reconnectTimer.unref?.();
}

async function startSocket(session, onSocket) {
    if (session.stopped) {
        throw new Error('SESSION_STOPPED');
    }

    if (session.starting) {
        return session.socket;
    }

    session.starting = true;

    try {
        const { state, saveCreds } =
            await useMultiFileAuthState(session.path);

        if (session.stopped) {
            throw new Error('SESSION_STOPPED');
        }

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
            if (session.socket !== sock) return;

            try {
                await saveCreds();
                session.registered = Boolean(state.creds.registered);

            } catch (error) {
                console.error(
                    '[SESSION SAVE ERROR]',
                    error.message
                );
            }
        });

        sock.ev.on('connection.update', update => {
            if (session.socket !== sock) return;
            if (session.stopped) return;

            if (update.qr) {
                session.qr = update.qr;
                session.status = 'waiting_scan';
                resolveReady(session, true);
            }

            if (update.connection === 'connecting') {
                session.status = 'connecting';
            }

            if (update.connection === 'open') {
                session.qr = null;
                session.pairingCode = null;
                session.registered = true;
                session.status = 'connected';

                resolveReady(session, true);

                console.log(
                    '[SESSION CONNECTED]',
                    session.id
                );
            }

            if (update.connection === 'close') {
                const statusCode =
                    update.lastDisconnect?.error?.output?.statusCode;

                session.qr = null;

                resolveReady(session, false);

                if (statusCode === DisconnectReason.loggedOut) {
                    session.status = 'logged_out';

                    console.log(
                        '[SESSION LOGGED OUT]',
                        session.id
                    );

                    return;
                }

                session.status = 'disconnected';

                console.log(
                    '[SESSION DISCONNECTED]',
                    session.id
                );

                scheduleReconnect(session, onSocket);
            }
        });

        if (typeof onSocket === 'function') {
            await onSocket(sock, session);
        }

        return sock;

    } finally {
        session.starting = false;
    }
}

function createSessionObject(
    id,
    accessToken,
    sessionPath,
    createdAt
) {
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

        reconnectTimer: null,
        starting: false,
        stopped: false
    };
}

async function createSession(onSocket) {
    // La vérification et la création sont synchrones
    // avant le premier await : protection dans un processus Node.js.

    if (countStoredSessions() >= MAX_SESSIONS) {
        throw new Error('LIMIT_100_SESSIONS');
    }

    const id = generateId();
    const accessToken = generateAccessToken();

    const sessionPath = path.join(
        SESSION_DIR,
        id
    );

    fs.mkdirSync(sessionPath, {
        recursive: true,
        mode: 0o700
    });

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

        session.stopped = true;

        try {
            session.socket?.end(undefined);
        } catch (_) {}

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

        const sessionPath = path.join(
            SESSION_DIR,
            entry.name
        );

        const metadataPath = path.join(
            sessionPath,
            'session.json'
        );

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

                console.log(
                    '[SESSION RESTORED]',
                    session.id
                );

            } catch (error) {
                session.status = 'error';

                console.error(
                    '[SESSION RESTORE ERROR]',
                    session.id,
                    error.message
                );

                scheduleReconnect(session, onSocket, 5000);
            }

        } catch (error) {
            console.error(
                '[SESSION METADATA ERROR]',
                error.message
            );
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

    if (!session || typeof token !== 'string') {
        return null;
    }

    const expected = Buffer.from(session.accessToken);
    const received = Buffer.from(token);

    if (expected.length !== received.length) {
        return null;
    }

    return crypto.timingSafeEqual(expected, received)
        ? session
        : null;
}

function getSessionCount() {
    return countStoredSessions();
}

function getActiveSessionCount() {
    return Array.from(sessions.values()).filter(session => {
        return !session.stopped &&
            session.status !== 'logged_out' &&
            session.status !== 'error';
    }).length;
}

async function stopSession(id) {
    const session = getSession(id);

    if (!session) return false;

    session.stopped = true;

    if (session.reconnectTimer) {
        clearTimeout(session.reconnectTimer);
        session.reconnectTimer = null;
    }

    resolveReady(session, false);

    try {
        session.socket?.end(undefined);
    } catch (error) {
        console.error(
            '[SESSION STOP ERROR]',
            error.message
        );
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
