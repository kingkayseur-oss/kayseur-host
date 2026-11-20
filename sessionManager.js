
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

function generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
}

async function createSession(phone = null, onSocket = null) {
    if (sessions.size >= MAX_SESSIONS) {
        throw new Error('LIMITE DE 100 SESSIONS ATTEINTE');
    }

    if (phone && !/^\d{8,15}$/.test(String(phone))) {
        throw new Error('NUMERO INVALIDE');
    }

    const id = generateSessionId();
    const sessionPath = path.join(SESSION_DIR, id);

    fs.mkdirSync(sessionPath, { recursive: true });

    const { state, saveCreds } =
        await useMultiFileAuthState(sessionPath);

    const session = {
        id,
        phone,
        path: sessionPath,
        socket: null,
        qr: null,
        pairingCode: null,
        status: 'connecting',
        createdAt: Date.now()
    };

    sessions.set(id, session);

    try {
        const sock = makeWASocket({
            auth: state,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            browser: ['KAYSEUR MDX', 'Chrome', '1.0.0']
        });

        session.socket = sock;

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', update => {
            if (update.qr) {
                session.qr = update.qr;
                session.status = 'waiting_scan';
            }

            if (update.connection === 'open') {
                session.qr = null;
                session.pairingCode = null;
                session.status = 'connected';
            }

            if (update.connection === 'close') {
                session.qr = null;
                session.status = 'disconnected';
            }
        });

        if (typeof onSocket === 'function') {
            await onSocket(sock, session);
        }

        if (phone) {
            session.pairingCode =
                await sock.requestPairingCode(String(phone));
        }

        return session;

    } catch (error) {
        sessions.delete(id);

        try {
            if (session.socket) {
                session.socket.end(undefined);
            }
        } catch (_) {}

        throw error;
    }
}

function getSession(id) {
    return sessions.get(id) || null;
}

function getSessionCount() {
    return sessions.size;
}

function getSessionList() {
    return Array.from(sessions.values()).map(session => ({
        id: session.id,
        status: session.status,
        createdAt: session.createdAt
    }));
}

async function stopSession(id) {
    const session = sessions.get(id);

    if (!session) return false;

    try {
        if (session.socket) {
            session.socket.end(undefined);
        }
    } catch (error) {
        console.error('[SESSION STOP]', error.message);
    }

    sessions.delete(id);
    return true;
}

module.exports = {
    MAX_SESSIONS,
    createSession,
    getSession,
    getSessionCount,
    getSessionList,
    stopSession
};
