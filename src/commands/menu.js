
const config = require('../../config');

function getMenu(pushName) {
    const ownerName = config.ownerName || 'MR KING KAYSEUR THE GLITCH DEV';
    const prefix = config.prefix || '!';
    const userName = pushName || 'Utilisateur';

    return `> ╭━━━━━━━━━━━━━━━━━━━━━━╮
> ┃       *💀 KAYSEUR MDX*
> ╰━━━━━━━━━━━━━━━━━━━━━━╯

┏━━〔 👑 BOT INFORMATION 〕
┃
┃ ❖ OWNER : ${ownerName}
┃ ❖ USER : ${userName}
┃ ❖ PREFIX : ${prefix}
┃ ❖ CMDS : 100
┃ ❖ VERSION : v1
┃ ❖ STATUS : ONLINE 🟢
┃
┗━━━━━━━━━━━━━━━━━━━━━━

╭━━〔 👥 GROUP MENU (20) 〕
┃
┃ ❖ ${prefix}add
┃ ❖ ${prefix}kick
┃ ❖ ${prefix}purge
┃ ❖ ${prefix}promote
┃ ❖ ${prefix}demote
┃ ❖ ${prefix}open
┃ ❖ ${prefix}close
┃ ❖ ${prefix}mute
┃ ❖ ${prefix}unmute
┃ ❖ ${prefix}tagall
┃ ❖ ${prefix}hidetag
┃ ❖ ${prefix}link
┃ ❖ ${prefix}revoke
┃ ❖ ${prefix}setname
┃ ❖ ${prefix}setdesc
┃ ❖ ${prefix}ppgroup
┃ ❖ ${prefix}groupinfo
┃ ❖ ${prefix}del
┃ ❖ ${prefix}antilink
┃ ❖ ${prefix}antibot
╰━━━━━━━━━━━━━━━━━━━━━━

╭━━〔 📥 DOWNLOAD & MEDIA (20) 〕
┃
┃ ❖ ${prefix}play
┃ ❖ ${prefix}song
┃ ❖ ${prefix}ytmp3
┃ ❖ ${prefix}video
┃ ❖ ${prefix}ytmp4
┃ ❖ ${prefix}tiktok
┃ ❖ ${prefix}igdl
┃ ❖ ${prefix}fbdl
┃ ❖ ${prefix}spotify
┃ ❖ ${prefix}pinterest
┃ ❖ ${prefix}anime
┃ ❖ ${prefix}manga
┃ ❖ ${prefix}lyrics
┃ ❖ ${prefix}yts
┃ ❖ ${prefix}apk
┃ ❖ ${prefix}mediafire
┃ ❖ ${prefix}gdrive
┃ ❖ ${prefix}twitter
┃ ❖ ${prefix}snapchat
┃ ❖ ${prefix}sound
╰━━━━━━━━━━━━━━━━━━━━━━

╭━━〔 🧠 AI & TOOLS (20) 〕
┃
┃ ❖ ${prefix}ai
┃ ❖ ${prefix}gpt
┃ ❖ ${prefix}gemini
┃ ❖ ${prefix}imagine
┃ ❖ ${prefix}translate
┃ ❖ ${prefix}tts
┃ ❖ ${prefix}calc
┃ ❖ ${prefix}qr
┃ ❖ ${prefix}readqr
┃ ❖ ${prefix}google
┃ ❖ ${prefix}wiki
┃ ❖ ${prefix}define
┃ ❖ ${prefix}weather
┃ ❖ ${prefix}shorturl
┃ ❖ ${prefix}screenshot
┃ ❖ ${prefix}github
┃ ❖ ${prefix}npm
┃ ❖ ${prefix}encode
┃ ❖ ${prefix}decode
┃ ❖ ${prefix}password
╰━━━━━━━━━━━━━━━━━━━━━━

╭━━〔 🎨 STICKER & STYLE (15) 〕
┃
┃ ❖ ${prefix}sticker
┃ ❖ ${prefix}s
┃ ❖ ${prefix}asticker
┃ ❖ ${prefix}take
┃ ❖ ${prefix}steal
┃ ❖ ${prefix}toimg
┃ ❖ ${prefix}togif
┃ ❖ ${prefix}attp
┃ ❖ ${prefix}ttp
┃ ❖ ${prefix}emojimix
┃ ❖ ${prefix}font
┃ ❖ ${prefix}style
┃ ❖ ${prefix}fancy
┃ ❖ ${prefix}bold
┃ ❖ ${prefix}glitch
╰━━━━━━━━━━━━━━━━━━━━━━

╭━━〔 🎮 GAMES & FUN (15) 〕
┃
┃ ❖ ${prefix}dice
┃ ❖ ${prefix}coin
┃ ❖ ${prefix}8ball
┃ ❖ ${prefix}ship
┃ ❖ ${prefix}love
┃ ❖ ${prefix}gay
┃ ❖ ${prefix}quiz
┃ ❖ ${prefix}devinette
┃ ❖ ${prefix}trueorfalse
┃ ❖ ${prefix}roulette
┃ ❖ ${prefix}slot
┃ ❖ ${prefix}joke
┃ ❖ ${prefix}fact
┃ ❖ ${prefix}quote
┃ ❖ ${prefix}roast
╰━━━━━━━━━━━━━━━━━━━━━━

╭━━〔 👑 OWNER & BOT (10) 〕
┃
┃ ❖ ${prefix}menu
┃ ❖ ${prefix}help
┃ ❖ ${prefix}ping
┃ ❖ ${prefix}alive
┃ ❖ ${prefix}runtime
┃ ❖ ${prefix}owner
┃ ❖ ${prefix}public
┃ ❖ ${prefix}private
┃ ❖ ${prefix}block
┃ ❖ ${prefix}unblock
╰━━━━━━━━━━━━━━━━━━━━━━

> ╭━━━━━━━━━━━━━━━━━━━━━━╮
> ┃ 🍓 KAYSEUR MDX
> ┃ ⚡ THE GLITCH DEV
> ┃ 📢 WHATSAPP CHANNEL
> ╰━━━━━━━━━━━━━━━━━━━━━━`;
}

module.exports = { getMenu };
