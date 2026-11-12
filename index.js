const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
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

app.get('/api/pairing', async (req, res) => {
    const phone = (req.query.phone || '').replace(/[^0-9]/g, '');
    if (!phone) return res.json({ error: "ɴᴜᴍᴇʀᴏ ʀᴇǫᴜɪs" });
    try {
        if (waSock && !waSock.authState.creds.registered) {
            let code = await waSock.requestPairingCode(phone);
            code = code?.match(/.{1,4}/g)?.join("-") || code;
            return res.json({ code });
        }
        res.json({ code: "ᴋᴀʏsᴇᴜʀ-999" });
    } catch (e) {
        res.json({ code: "ᴇʀʀᴇᴜʀ-ᴘᴀɪʀɪɴɢ" });
    }
});

app.get('/api/qr', async (req, res) => {
    if (latestQR) {
        const qrDataUrl = await QRCode.toDataURL(latestQR);
        return res.json({ qr: qrDataUrl });
    }
    res.json({ status: "ᴇɴ ᴀᴛᴛᴇɴᴛᴇ ᴅᴜ ǫʀ..." });
});

app.listen(PORT, () => {
    console.log(`[🚀 SERVER] ᴋᴀʏsᴇᴜʀ_ᴍᴅx ʟᴀɴᴄᴇ sᴜʀ ʟᴇ ᴘᴏʀᴛ ${PORT}`);
});

try {
    telegramBot.launch();
} catch (e) {}

async function startWhatsAppBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./session');

    waSock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state
    });

    waSock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) latestQR = qr;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startWhatsAppBot();
        } else if (connection === 'open') {
            latestQR = null;
            console.log('✅ [WHATSAPP] ᴋᴀʏsᴇᴜʀ_ᴍᴅx ᴄᴏɴɴᴇᴄᴛᴇ !');
        }
    });

    waSock.ev.on('creds.update', saveCreds);

    waSock.ev.on('messages.upsert', async ({ messages }) => {
        const mek = messages[0];
        if (!mek.message) return;

        const messageType = Object.keys(mek.message)[0];
        const body = messageType === 'conversation' ? mek.message.conversation :
                     messageType === 'extendedTextMessage' ? mek.message.extendedTextMessage.text :
                     messageType === 'imageMessage' ? mek.message.imageMessage.caption :
                     messageType === 'videoMessage' ? mek.message.videoMessage.caption : '';

        if (!body || !body.startsWith(config.prefix)) return;

        const args = body.slice(config.prefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        const pushName = mek.pushName || "ᴜᴛɪʟɪsᴀᴛᴇᴜʀ";

        await handleCommand(waSock, mek, body, command, args, pushName);
    });

    // Welcome & Goodbye encadrés avec icône du bot/groupe et lien chaîne
    waSock.ev.on('group-participants.update', async (update) => {
        const { id, participants, action } = update;
        try {
            const metadata = await waSock.groupMetadata(id);
            const groupIcon = await waSock.profilePictureUrl(id, 'image').catch(() => 'https://i.imgur.com/1Z2x3Y1.png');
            const botIcon = fs.existsSync(config.menuImage) ? fs.readFileSync(config.menuImage) : { url: groupIcon };
            const adminsCount = metadata.participants.filter(p => p.admin).length;

            for (let user of participants) {
                if (action === 'add') {
                    const welcomeCaption = boxText('ᴡᴇʟᴄᴏᴍᴇ', [
                        `ʙᴏᴛ : ᴋᴀʏsᴇᴜʀ_ᴍᴅx`,
                        `ʙɪᴇɴᴠᴇɴᴜᴇ : @${user.split('@')[0]}`,
                        `ᴅᴇsᴄʀɪᴘᴛɪᴏɴ : ʙɪᴇɴᴠᴇɴᴜᴇ ᴅᴀɴs ʟᴇ ɢʀᴏᴜᴘᴇ !`,
                        `ᴄʜᴀɪɴᴇ : ${config.channelLink}`
                    ]);
                    await waSock.sendMessage(id, {
                        image: botIcon,
                        caption: welcomeCaption,
                        mentions: [user],
                        buttons: [{ buttonId: 'voir_chaine', buttonText: { displayText: '📢 ᴠᴏɪʀ ʟᴀ ᴄʜᴀɪɴᴇ' }, type: 1 }]
                    });
                } else if (action === 'remove') {
                    const goodbyeCaption = boxText('ɢᴏᴏᴅʙʏᴇ', [
                        `ᴍᴇᴍʙʀᴇ : @${user.split('@')[0]}`,
                        `ᴀᴅᴍɪɴs ʀᴇsᴛᴀɴᴛs : ${adminsCount}`,
                        `ᴅᴇsᴄʀɪᴘᴛɪᴏɴ : ᴀᴜ ʀᴇᴠᴏɪʀ ᴇᴛ ʙᴏɴɴᴇ ᴄᴏɴᴛɪɴᴜᴀᴛɪᴏɴ !`,
                        `ᴄʜᴀɪɴᴇ : ${config.channelLink}`
                    ]);
                    await waSock.sendMessage(id, {
                        image: { url: groupIcon },
                        caption: goodbyeCaption,
                        mentions: [user],
                        buttons: [{ buttonId: 'voir_chaine', buttonText: { displayText: '📢 ᴠᴏɪʀ ʟᴀ ᴄʜᴀɪɴᴇ' }, type: 1 }]
                    });
                }
            }
        } catch (e) {
            console.log('Erreur welcome/goodbye:', e);
        }
    });
}

startWhatsAppBot();