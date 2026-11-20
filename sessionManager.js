

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pino = require('pino');

const {
    default: makeWASocket,
    useMultiFileAuthState
} = require('@whiskeysockets/baileys');

const MAX_SESSIONS = 100;

const SESSION_DIR = path.resolve(
    process.env.SESSION_DIR || './sessions'
);

const sessions = new Map();

fs.mkdirSync(SESSION_DIR, { recursive: true });

function countStoredSessions() {
    return fs.readdirSync(SESSION_DIR, {
        withFileTypes: true
    }).filter(entry => entry.isDirectory()).length;
}

function generateId() {
    return crypto.randomBytes(24).toString('hex');
}

function generateAccessToken() {
    return crypto.randomBytes(32).toString('hex');
}

async function createSession() {
    if (sessions.size >= MAX_SESSIONS ||
        countStoredSessions() >= MAX_SESSIONS) {
        throw new Error('LIMIT_100_SESSIONS');
    }

    const id = generateId();
    const accessToken = generateAccessToken();
    const sessionPath = path.join(SESSION_DIR, id);

    fs.mkdirSync(sessionPath, { recursive: true });

    try {
        const { state, saveCreds } =
            await useMultiFileAuthState(sessionPath);

        const session = {
            id,
            accessToken,
            path: sessionPath,
            socket: null,
            status: 'connecting',
            qr: null,
            pairingCode: null,
            registered: Boolean(state.creds.registered),
            createdAt: Date.now(),
            ready: false,
            resolveReady: null,
            readyPromise: null
        };

        session.readyPromise = new Promise(resolve => {
            session.resolveReady = resolve;
        });

        const sock = makeWASocket({
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: state,
            browser: ['KAYSEUR MDX', 'Chrome', '1.0.0'],
            markOnlineOnConnect: false,
            syncFullHistory: false
        });

        session.socket = sock;
        session.saveCreds = saveCreds;

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
                session.ready = true;

                if (session.resolveReady) {
                    session.resolveReady(true);
                    session.resolveReady = null;
                }
            }

            if (update.connection === 'connecting') {
                session.status = 'connecting';
            }

            if (update.connection === 'open') {
                session.qr = null;
                session.pairingCode = null;
                session.registered = true;
                session.status = 'connected';
                session.ready = true;

                if (session.resolveReady) {
                    session.resolveReady(true);
                    session.resolveReady = null;
                }
            }

            if (update.connection === 'close') {
                session.qr = null;
                session.status = 'disconnected';

                if (session.resolveReady) {
                    session.resolveReady(false);
                    session.resolveReady = null;
                }
            }
        });

        sessions.set(id, session);

        return session;

    } catch (error) {
        try {
            fs.rmSync(sessionPath, {
                recursive: true,
                force: true
            });
        } catch (_) {}

        throw error;
    }
}

function getSession(id) {
    return sessions.get(id) || null;
}

function authenticateSession(id, token) {
    const session = getSession(id);

    if (!session || !token) return null;

    const expected = Buffer.from(session.accessToken);
    const received = Buffer.from(String(token));

    if (expected.length !== received.length) return null;

    return crypto.timingSafeEqual(expected, received)
        ? session
        : null;
}

function getSessionCount() {
    return countStoredSessions();
}

async function stopSession(id) {
    const session = sessions.get(id);

    if (!session) return false;

    try {
        if (session.socket) {
            session.socket.end(undefined);
        }
    } catch (error) {
        console.error('[SESSION STOP ERROR]', error.message);
    }

    sessions.delete(id);

    return true;
}

module.exports = {
    MAX_SESSIONS,
    createSession,
    getSession,
    authenticateSession,
    getSessionCount,
    stopSession
};
