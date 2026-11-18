const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const styled = "𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙⓿❶❷❸❹❺❻❼❽❾";

function toKayseurFont(text) {
    if (!text) return "";
    let result = "";
    for (let char of String(text)) {
        const index = normal.indexOf(char);
        result += index !== -1 ? styled[index] : char;
    }
    return result;
}

function boxText(title, lines) {
    const header = `*┌─── 「 ${toKayseurFont(title)} 」 ───*`;
    const body = lines.map(line => `*│* ${toKayseurFont(line)}`).join("\n");
    const footer = `*└──────────────────────────*`;
    return `${header}\n${body}\n${footer}`;
}

module.exports = { toKayseurFont, boxText };