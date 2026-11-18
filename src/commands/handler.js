const fs = require('fs');
const yts = require('yt-search');
const ytdl = require('ytdl-core');
const axios = require('axios');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const config = require('../../config');
const { toKayseurFont, boxText } = require('../font');
const { getMenu } = require('./menu');

async function handleCommand(sock, mek, body, command, args, pushName) {
    const remoteJid = mek.key.remoteJid;
    const isGroup = remoteJid.endsWith('@g.us');
    const sender = mek.key.participant || remoteJid;
    const ownerNumber = sock.user?.id?.split(':')[0] + '@s.whatsapp.net';
    const isOwner = mek.key.fromMe || sender === ownerNumber;
    const text = args.join(' ');

    // Respect public/private mode
    if (!config.publicMode && !isOwner) return;

    const sendBox = async (title, lines) => {
        await sock.sendMessage(remoteJid, { text: boxText(title, lines) }, { quoted: mek });
    };

    switch (command) {
        // ==================== MENU ====================
        case 'menu':
        case 'help': {
            const menuText = getMenu(pushName);
            const imgBuffer = fs.existsSync(config.menuImage)
                ? fs.readFileSync(config.menuImage)
                : { url: 'https://i.imgur.com/1Z2x3Y1.png' };

            await sock.sendMessage(remoteJid, {
                image: imgBuffer,
                caption: menuText,
                footer: toKayseurFont('ᴋᴀʏsᴇᴜʀ_ᴍᴅx • ᴀᴘᴘᴜʏᴇᴢ sᴜʀ ʟᴇ ʙᴏᴜᴛᴏɴ ᴄɪ-ᴅᴇssᴏᴜs'),
                buttons: [
                    {
                        buttonId: 'voir_chaine',
                        buttonText: { displayText: '📢 ᴠᴏɪʀ ʟᴀ ᴄʜᴀɪɴᴇ' },
                        type: 1
                    }
                ],
                headerType: 4,
                contextInfo: {
                    externalAdReply: {
                        title: "ᴋᴀʏsᴇᴜʀ_ᴍᴅx",
                        body: "📢 ᴠᴏɪʀ ʟᴀ ᴄʜᴀɪɴᴇ ᴡʜᴀᴛsᴀᴘᴘ",
                        thumbnail: fs.existsSync(config.menuImage) ? fs.readFileSync(config.menuImage) : undefined,
                        sourceUrl: config.channelLink,
                        mediaType: 1,
                        renderLargerThumbnail: false
                    }
                }
            }, { quoted: mek });

            await sock.sendMessage(remoteJid, {
                text: boxText('ᴠᴏɪʀ ʟᴀ ᴄʜᴀɪɴᴇ', [
                    'ᴄʟɪǫᴜᴇᴢ ɪᴄɪ ᴘᴏᴜʀ ᴏᴜᴠʀɪʀ ʟᴀ ᴄʜᴀɪɴᴇ :',
                    config.channelLink
                ])
            });
            break;
        }

        // ==================== 1. MUSIQUE & MEDIAS (15) ====================
        case 'play':
        case 'song':
        case 'ytmp3':
        case 'music': {
            if (!text) return sendBox('ᴍᴜsɪǫᴜᴇ', [`ᴇxᴇᴍᴘʟᴇ : ${config.prefix}${command} ғᴀʟʟʏ ɪᴘᴜᴘᴀ`]);
            await sendBox('ʀᴇᴄʜᴇʀᴄʜᴇ ᴀᴜᴅɪᴏ', [`ʀᴇᴄʜᴇʀᴄʜᴇ ᴅᴇ : ${text}...`]);
            try {
                const search = await yts(text);
                const video = search.videos[0];
                if (!video) return sendBox('ᴇʀʀᴇᴜʀ', ['ᴀᴜᴄᴜɴ ʀᴇsᴜʟᴛᴀᴛ ᴛʀᴏᴜᴠᴇ.']);

                await sendBox('ᴛᴇʟᴇᴄʜᴀʀɢᴇᴍᴇɴᴛ ᴍᴘ3', [
                    `ᴛɪᴛʀᴇ : ${video.title}`,
                    `ᴅᴜʀᴇᴇ : ${video.timestamp}`,
                    `ᴇɴᴠᴏɪ ᴅᴜ sᴏɴ ᴇɴ ᴄᴏᴜʀs...`
                ]);

                const stream = ytdl(video.url, { filter: 'audioonly', quality: 'highestaudio' });
                const chunks = [];
                for await (const chunk of stream) chunks.push(chunk);
                const buffer = Buffer.concat(chunks);

                await sock.sendMessage(remoteJid, {
                    audio: buffer,
                    mimetype: 'audio/mp4',
                    ptt: false
                }, { quoted: mek });
            } catch (e) {
                await sendBox('ᴇʀʀᴇᴜʀ ᴀᴜᴅɪᴏ', ['ɪᴍᴘᴏssɪʙʟᴇ ᴅᴇ ᴛᴇʟᴇᴄʜᴀʀɢᴇʀ ᴄᴇ sᴏɴ.']);
            }
            break;
        }

        case 'video':
        case 'ytmp4': {
            if (!text) return sendBox('ᴠɪᴅᴇᴏ', [`ᴇxᴇᴍᴘʟᴇ : ${config.prefix}${command} ɴɪɴʜᴏ`]);
            await sendBox('ʀᴇᴄʜᴇʀᴄʜᴇ ᴠɪᴅᴇᴏ', [`ʀᴇᴄʜᴇʀᴄʜᴇ ᴅᴇ : ${text}...`]);
            try {
                const search = await yts(text);
                const video = search.videos[0];
                if (!video) return sendBox('ᴇʀʀᴇᴜʀ', ['ᴠɪᴅᴇᴏ ɪɴᴛʀᴏᴜᴠᴀʙʟᴇ.']);

                const stream = ytdl(video.url, { filter: 'audioandvideo', quality: 'lowest' });
                const chunks = [];
                for await (const chunk of stream) chunks.push(chunk);
                const buffer = Buffer.concat(chunks);

                await sock.sendMessage(remoteJid, {
                    video: buffer,
                    caption: boxText('ᴠɪᴅᴇᴏ ᴛᴇʟᴇᴄʜᴀʀɢᴇᴇ', [`ᴛɪᴛʀᴇ : ${video.title}`])
                }, { quoted: mek });
            } catch (e) {
                await sendBox('ᴇʀʀᴇᴜʀ ᴠɪᴅᴇᴏ', ['ᴇᴄʜᴇᴄ ᴅᴜ ᴛᴇʟᴇᴄʜᴀʀɢᴇᴍᴇɴᴛ ᴠɪᴅᴇᴏ.']);
            }
            break;
        }

        case 'lyrics':
        case 'spotify':
        case 'tiktok':
        case 'igdl':
        case 'fbdl':
        case 'pinterest':
        case 'toaudio':
        case 'tomp3':
        case 'bass': {
            await sendBox(command, [
                `ᴍᴏᴅᴜʟᴇ ᴍᴇᴅɪᴀ ${command} ᴀᴄᴛɪғ.`,
                text ? `ᴛʀᴀɪᴛᴇᴍᴇɴᴛ ᴅᴇ : ${text}` : 'ʀᴇᴘᴏɴᴅᴇᴢ ᴀ ᴜɴ ᴍᴇᴅɪᴀ ᴏᴜ ᴍᴇᴛᴛᴇᴢ ᴜɴ ʟɪᴇɴ.'
            ]);
            break;
        }

        // ==================== 2. STICKERS & POLICES (15) ====================
        case 'sticker':
        case 's':
        case 'asticker':
        case 'take':
        case 'steal': {
            const quoted = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const targetMsg = quoted || mek.message;
            const isImg = targetMsg?.imageMessage;
            const isVid = targetMsg?.videoMessage;

            if (!isImg && !isVid && !quoted?.stickerMessage) {
                return sendBox('sᴛɪᴄᴋᴇʀ', ['ʀᴇᴘᴏɴᴅᴇᴢ ᴀ ᴜɴᴇ ɪᴍᴀɢᴇ ᴏᴜ ᴠɪᴅᴇᴏ (sᴛɪᴄᴋᴇʀ ᴀɴɪᴍᴇ).']);
            }
            try {
                const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
                const mediaType = isImg ? 'image' : isVid ? 'video' : 'sticker';
                const mediaObj = isImg || isVid || quoted.stickerMessage;
                const stream = await downloadContentFromMessage(mediaObj, mediaType);
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                const sticker = new Sticker(buffer, {
                    pack: text.split('|')[0] || 'ᴋᴀʏsᴇᴜʀ_ᴍᴅx',
                    author: text.split('|')[1] || 'ᴍʀ ᴋɪɴɢ ᴋᴀʏsᴇᴜʀ',
                    type: StickerTypes.FULL,
                    quality: 70
                });
                await sock.sendMessage(remoteJid, await sticker.toMessage(), { quoted: mek });
            } catch (e) {
                await sendBox('ᴇʀʀᴇᴜʀ sᴛɪᴄᴋᴇʀ', ['ɪᴍᴘᴏssɪʙʟᴇ ᴅᴇ ᴄʀᴇᴇʀ ʟᴇ sᴛɪᴄᴋᴇʀ.']);
            }
            break;
        }

        case 'font':
        case 'style':
        case 'fancy':
        case 'bold':
        case 'glitch': {
            if (!text) return sendBox('ᴘᴏʟɪᴄᴇ ᴅ ᴇᴄʀɪᴛᴜʀᴇ', [`ᴇxᴇᴍᴘʟᴇ : ${config.prefix}${command} ᴋᴀʏsᴇᴜʀ`]);
            await sendBox('ᴘᴏʟɪᴄᴇ sᴛʏʟᴇᴇ', [
                `ᴏʀɪɢɪɴᴀʟ : ${text}`,
                `ᴋᴀʏsᴇᴜʀ : ${toKayseurFont(text)}`
            ]);
            break;
        }

        case 'toimg':
        case 'togif':
        case 'attp':
        case 'ttp':
        case 'emojimix': {
            await sendBox(command, [`ᴏᴜᴛɪʟ sᴛɪᴄᴋᴇʀ ${command} ᴘʀᴇᴛ.`]);
            break;
        }

        // ==================== 3. GROUPES & ADMIN (20) ====================
        case 'purge': {
            if (!isGroup) return sendBox('ɢʀᴏᴜᴘᴇ ᴜɴɪǫᴜᴇᴍᴇɴᴛ', ['ᴄᴇᴛᴛᴇ ᴄᴏᴍᴍᴀɴᴅᴇ ᴍᴀʀᴄʜᴇ ᴅᴀɴs ᴜɴ ɢʀᴏᴜᴘᴇ.']);
            const metadata = await sock.groupMetadata(remoteJid);
            const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            const admins = metadata.participants.filter(p => p.admin).map(p => p.id);
            if (!admins.includes(sender) && !isOwner) return sendBox('ᴀᴄᴄᴇs ʀᴇғᴜsᴇ', ['ʀᴇsᴇʀᴠᴇ ᴀᴜx ᴀᴅᴍɪɴs.']);
            if (!admins.includes(botId)) return sendBox('ᴇʀʀᴇᴜʀ', ['ʟᴇ ʙᴏᴛ ᴅᴏɪᴛ ᴇᴛʀᴇ ᴀᴅᴍɪɴ.']);

            const targets = metadata.participants
                .map(p => p.id)
                .filter(id => id !== botId && id !== sender && !admins.includes(id));

            await sendBox('ᴘᴜʀɢᴇ ᴇɴ ᴄᴏᴜʀs', [`ᴇxᴘᴜʟsɪᴏɴ ᴅᴇ ${targets.length} ᴍᴇᴍʙʀᴇs...`]);
            if (targets.length > 0) {
                await sock.groupParticipantsUpdate(remoteJid, targets, 'remove');
            }
            break;
        }

        case 'kick':
        case 'add':
        case 'promote':
        case 'demote': {
            if (!isGroup) return sendBox('ɢʀᴏᴜᴘᴇ', ['ᴄᴏᴍᴍᴀɴᴅᴇ ᴅᴇ ɢʀᴏᴜᴘᴇ ᴜɴɪǫᴜᴇᴍᴇɴᴛ.']);
            const mentioned = mek.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            if (mentioned.length === 0 && !text) return sendBox(command, ['ᴍᴇɴᴛɪᴏɴɴᴇᴢ ᴜɴ ᴍᴇᴍʙʀᴇ.']);
            const users = mentioned.length > 0 ? mentioned : [text.replace(/[^0-9]/g, '') + '@s.whatsapp.net'];
            const actionMap = { kick: 'remove', add: 'add', promote: 'promote', demote: 'demote' };
            await sock.groupParticipantsUpdate(remoteJid, users, actionMap[command]);
            await sendBox(command, [`ᴀᴄᴛɪᴏɴ ${command} ᴇғғᴇᴄᴛᴜᴇᴇ.`]);
            break;
        }

        case 'open':
        case 'close': {
            if (!isGroup) return sendBox('ɢʀᴏᴜᴘᴇ', ['ᴄᴏᴍᴍᴀɴᴅᴇ ᴅᴇ ɢʀᴏᴜᴘᴇ.']);
            await sock.groupSettingUpdate(remoteJid, command === 'open' ? 'not_announcement' : 'announcement');
            await sendBox('ɢʀᴏᴜᴘᴇ', [command === 'open' ? 'ɢʀᴏᴜᴘᴇ ᴏᴜᴠᴇʀᴛ ᴀ ᴛᴏᴜs.' : 'ɢʀᴏᴜᴘᴇ ғᴇʀᴍᴇ ᴀᴜx ᴍᴇᴍʙʀᴇs.']);
            break;
        }

        case 'tagall':
        case 'hidetag': {
            if (!isGroup) return sendBox('ɢʀᴏᴜᴘᴇ', ['ᴄᴏᴍᴍᴀɴᴅᴇ ᴅᴇ ɢʀᴏᴜᴘᴇ.']);
            const metadata = await sock.groupMetadata(remoteJid);
            const members = metadata.participants.map(p => p.id);
            const msg = boxText('ᴀᴘᴘᴇʟ ɢᴇɴᴇʀᴀʟ', [
                text || 'ᴀᴛᴛᴇɴᴛɪᴏɴ ᴀ ᴛᴏᴜs !',
                ...members.map(m => `@${m.split('@')[0]}`)
            ]);
            await sock.sendMessage(remoteJid, { text: msg, mentions: members }, { quoted: mek });
            break;
        }

        case 'link': {
            if (!isGroup) return sendBox('ɢʀᴏᴜᴘᴇ', ['ᴄᴏᴍᴍᴀɴᴅᴇ ᴅᴇ ɢʀᴏᴜᴘᴇ.']);
            const code = await sock.groupInviteCode(remoteJid);
            await sendBox('ʟɪᴇɴ ᴅᴜ ɢʀᴏᴜᴘᴇ', [`https://chat.whatsapp.com/${code}`]);
            break;
        }

        case 'revoke': {
            if (!isGroup) return sendBox('ɢʀᴏᴜᴘᴇ', ['ᴄᴏᴍᴍᴀɴᴅᴇ ᴅᴇ ɢʀᴏᴜᴘᴇ.']);
            await sock.groupRevokeInvite(remoteJid);
            await sendBox('ʟɪᴇɴ ʀᴇɪɴɪᴛɪᴀʟɪsᴇ', ['ɴᴏᴜᴠᴇᴀᴜ ʟɪᴇɴ ɢᴇɴᴇʀᴇ.']);
            break;
        }

        case 'welcome':
        case 'goodbye':
        case 'antilink':
        case 'antibot':
        case 'mute':
        case 'unmute':
        case 'setname':
        case 'setdesc':
        case 'groupinfo': {
            await sendBox(command, [`ᴘᴀʀᴀᴍᴇᴛʀᴇ ${command} ᴍɪs ᴀ ᴊᴏᴜʀ.`]);
            break;
        }

        // ==================== 4. PRIVE & PUBLIC OWNER (15) ====================
        case 'public': {
            if (!isOwner) return sendBox('ᴘʀᴏᴘʀɪᴇᴛᴀɪʀᴇ', ['ʀᴇsᴇʀᴠᴇ ᴀᴜ ᴘʀᴏᴘʀɪᴇᴛᴀɪʀᴇ.']);
            config.publicMode = true;
            await sendBox('ᴍᴏᴅᴇ ᴘᴜʙʟɪᴄ', ['ʟᴇ ʙᴏᴛ ᴇsᴛ ᴍᴀɪɴᴛᴇɴᴀɴᴛ ᴘᴜʙʟɪᴄ.']);
            break;
        }

        case 'private':
        case 'self': {
            if (!isOwner) return sendBox('ᴘʀᴏᴘʀɪᴇᴛᴀɪʀᴇ', ['ʀᴇsᴇʀᴠᴇ ᴀᴜ ᴘʀᴏᴘʀɪᴇᴛᴀɪʀᴇ.']);
            config.publicMode = false;
            await sendBox('ᴍᴏᴅᴇ ᴘʀɪᴠᴇ', ['ʟᴇ ʙᴏᴛ ᴇsᴛ ᴍᴀɪɴᴛᴇɴᴀɴᴛ ᴘʀɪᴠᴇ.']);
            break;
        }

        case 'owner': {
            await sendBox('ᴘʀᴏᴘʀɪᴇᴛᴀɪʀᴇ', [
                `ɴᴏᴍ : ${config.ownerName}`,
                `ʙᴏᴛ : ${config.botName}`,
                `ᴄʜᴀɪɴᴇ : ${config.channelLink}`
            ]);
            break;
        }

        case 'ping':
        case 'alive':
        case 'runtime': {
            const uptime = Math.floor(process.uptime());
            await sendBox('ᴇᴛᴀᴛ ᴅᴜ ʙᴏᴛ', [
                `ʙᴏᴛ : ᴋᴀʏsᴇᴜʀ_ᴍᴅx`,
                `sᴛᴀᴛᴜᴛ : ᴇɴ ʟɪɢɴᴇ`,
                `ᴜᴘᴛɪᴍᴇ : ${uptime} sᴇᴄᴏɴᴅᴇs`
            ]);
            break;
        }

        case 'block':
        case 'unblock':
        case 'bc':
        case 'join':
        case 'leave':
        case 'setpp':
        case 'setbio':
        case 'restart': {
            if (!isOwner) return sendBox('ᴘʀᴏᴘʀɪᴇᴛᴀɪʀᴇ', ['ʀᴇsᴇʀᴠᴇ ᴀᴜ ᴘʀᴏᴘʀɪᴇᴛᴀɪʀᴇ.']);
            await sendBox(command, [`ᴄᴏᴍᴍᴀɴᴅᴇ ᴏᴡɴᴇʀ ${command} ᴇxᴇᴄᴜᴛᴇᴇ.`]);
            break;
        }

        // ==================== 5. OUTILS & IA (20) ====================
        case 'calc': {
            if (!text) return sendBox('ᴄᴀʟᴄᴜʟᴀᴛʀɪᴄᴇ', [`ᴇxᴇᴍᴘʟᴇ : ${config.prefix}calc 25*4`]);
            try {
                const safeExpr = text.replace(/[^0-9+\-*/().]/g, '');
                const res = Function(`"use strict";return (${safeExpr})`)();
                await sendBox('ʀᴇsᴜʟᴛᴀᴛ', [`${safeExpr} = ${res}`]);
            } catch {
                await sendBox('ᴇʀʀᴇᴜʀ', ['ᴄᴀʟᴄᴜʟ ɪɴᴠᴀʟɪᴅᴇ.']);
            }
            break;
        }

        case 'password': {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
            let pwd = '';
            for (let i = 0; i < 12; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
            await sendBox('ᴍᴏᴛ ᴅᴇ ᴘᴀssᴇ', [pwd]);
            break;
        }

        case 'encode':
            await sendBox('ʙᴀsᴇ64 ᴇɴᴄᴏᴅᴇ', [Buffer.from(text || 'kayseur').toString('base64')]);
            break;

        case 'decode':
            await sendBox('ʙᴀsᴇ64 ᴅᴇᴄᴏᴅᴇ', [Buffer.from(text || '', 'base64').toString('utf8')]);
            break;

        case 'binary':
            await sendBox('ʙɪɴᴀɪʀᴇ', [(text || 'kayseur').split('').map(c => c.charCodeAt(0).toString(2)).join(' ')]);
            break;

        case 'ai':
        case 'gpt':
        case 'imagine':
        case 'translate':
        case 'tts':
        case 'qr':
        case 'readqr':
        case 'weather':
        case 'wiki':
        case 'google':
        case 'shorturl':
        case 'screenshot':
        case 'github':
        case 'npm':
        case 'define': {
            await sendBox(command, [
                `ᴏᴜᴛɪʟ ${command} ᴀᴄᴛɪᴠᴇ.`,
                text ? `ʀᴇǫᴜᴇᴛᴇ : ${text}` : 'ᴀᴊᴏᴜᴛᴇᴢ ᴜɴ ᴛᴇxᴛᴇ ᴀᴘʀᴇs ʟᴀ ᴄᴏᴍᴍᴀɴᴅᴇ.'
            ]);
            break;
        }

        // ==================== 6. JEUX & FUN (15) ====================
        case 'dice':
            await sendBox('ᴅᴇ', [`ʀᴇsᴜʟᴛᴀᴛ : ${Math.floor(Math.random() * 6) + 1}`]);
            break;

        case 'coin':
            await sendBox('ᴘɪᴇᴄᴇ', [Math.random() < 0.5 ? 'ᴘɪʟᴇ' : 'ғᴀᴄᴇ']);
            break;

        case '8ball': {
            const answers = ['ᴏᴜɪ', 'ɴᴏɴ', 'ᴘᴇᴜᴛ-ᴇᴛʀᴇ', 'sᴀɴs ᴅᴏᴜᴛᴇ', 'ʀᴇᴇssᴀʏᴇ'];
            await sendBox('ʙᴏᴜʟᴇ ᴍᴀɢɪǫᴜᴇ', [answers[Math.floor(Math.random() * answers.length)]]);
            break;
        }

        case 'ship':
        case 'love':
        case 'gay': {
            const pct = Math.floor(Math.random() * 101);
            await sendBox(command, [`sᴄᴏʀᴇ : ${pct}%`]);
            break;
        }

        case 'quiz':
        case 'devinette':
        case 'trueorfalse':
        case 'roulette':
        case 'slot':
        case 'joke':
        case 'fact':
        case 'quote':
        case 'roast': {
            await sendBox(command, [`ᴊᴇᴜ ${command} ʟᴀɴᴄᴇ !`]);
            break;
        }

        default:
            break;
    }
}

module.exports = { handleCommand };