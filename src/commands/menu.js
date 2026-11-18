const config = require('../../config');

function getMenu(pushName) {
    const ownerName = config.ownerName || 'MR KING KAYSEUR';
    const prefix = config.prefix || '🍓';

    return `┌───⟞ ⟨ KAYSEUR MDX ⟩
│
│  m> OWNER: ${ownerName}
│  m> PREFIX: ${prefix}
│  m> CMDS: 100
│  m> VERSION: v1
│
└───⟞ ⟨ 

*_GROUP MENU (20)_*
┌───────⟞
│ ❖ ${prefix}add
│ ❖ ${prefix}kick
│ ❖ ${prefix}kickall
│ ❖ ${prefix}promote
│ ❖ ${prefix}demote
│ ❖ ${prefix}open
│ ❖ ${prefix}close
│ ❖ ${prefix}mute
│ ❖ ${prefix}unmute
│ ❖ ${prefix}tagall
│ ❖ ${prefix}hidetag
│ ❖ ${prefix}link
│ ❖ ${prefix}revoke
│ ❖ ${prefix}setname
│ ❖ ${prefix}setdesc
│ ❖ ${prefix}ppgroup
│ ❖ ${prefix}groupinfo
│ ❖ ${prefix}del
│ ❖ ${prefix}antilink
│ ❖ ${prefix}antibot
└───────⟞

*_DOWNLOAD & MEDIA (20)_*
┌───────⟞
│ ❖ ${prefix}play
│ ❖ ${prefix}song
│ ❖ ${prefix}ytmp3
│ ❖ ${prefix}video
│ ❖ ${prefix}ytmp4
│ ❖ ${prefix}tiktok
│ ❖ ${prefix}igdl
│ ❖ ${prefix}fbdl
│ ❖ ${prefix}spotify
│ ❖ ${prefix}pinterest
│ ❖ ${prefix}anime
│ ❖ ${prefix}manga
│ ❖ ${prefix}lyrics
│ ❖ ${prefix}yts
│ ❖ ${prefix}apk
│ ❖ ${prefix}mediafire
│ ❖ ${prefix}gdrive
│ ❖ ${prefix}twitter
│ ❖ ${prefix}snapchat
│ ❖ ${prefix}sound
└───────⟞

*_AI & TOOLS (20)_*
┌───────⟞
│ ❖ ${prefix}ai
│ ❖ ${prefix}gpt
│ ❖ ${prefix}gemini
│ ❖ ${prefix}imagine
│ ❖ ${prefix}translate
│ ❖ ${prefix}tts
│ ❖ ${prefix}calc
│ ❖ ${prefix}qr
│ ❖ ${prefix}readqr
│ ❖ ${prefix}google
│ ❖ ${prefix}wiki
│ ❖ ${prefix}define
│ ❖ ${prefix}weather
│ ❖ ${prefix}shorturl
│ ❖ ${prefix}screenshot
│ ❖ ${prefix}github
│ ❖ ${prefix}npm
│ ❖ ${prefix}encode
│ ❖ ${prefix}decode
│ ❖ ${prefix}password
└───────⟞

*_STICKER & STYLE (15)_*
┌───────⟞
│ ❖ ${prefix}sticker
│ ❖ ${prefix}s
│ ❖ ${prefix}asticker
│ ❖ ${prefix}take
│ ❖ ${prefix}steal
│ ❖ ${prefix}toimg
│ ❖ ${prefix}togif
│ ❖ ${prefix}attp
│ ❖ ${prefix}ttp
│ ❖ ${prefix}emojimix
│ ❖ ${prefix}font
│ ❖ ${prefix}style
│ ❖ ${prefix}fancy
│ ❖ ${prefix}bold
│ ❖ ${prefix}glitch
└───────⟞

*_GAMES & FUN (15)_*
┌───────⟞
│ ❖ ${prefix}dice
│ ❖ ${prefix}coin
│ ❖ ${prefix}8ball
│ ❖ ${prefix}ship
│ ❖ ${prefix}love
│ ❖ ${prefix}gay
│ ❖ ${prefix}quiz
│ ❖ ${prefix}devinette
│ ❖ ${prefix}trueorfalse
│ ❖ ${prefix}roulette
│ ❖ ${prefix}slot
│ ❖ ${prefix}joke
│ ❖ ${prefix}fact
│ ❖ ${prefix}quote
│ ❖ ${prefix}roast
└───────⟞

*_OWNER & BOT (10)_*
┌───────⟞
│ ❖ ${prefix}menu
│ ❖ ${prefix}help
│ ❖ ${prefix}ping
│ ❖ ${prefix}alive
│ ❖ ${prefix}runtime
│ ❖ ${prefix}owner
│ ❖ ${prefix}public
│ ❖ ${prefix}private
│ ❖ ${prefix}block
│ ❖ ${prefix}unblock
└───────⟞`;
}

module.exports = { getMenu };
