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

// Encadrement royal épais
function boxText(title, lines = []) {
    const formattedTitle = `👑 ${toKayseurFont(title)} 👑`;

    const formattedLines = Array.isArray(lines)
        ? lines.map(line => `✦ ${toKayseurFont(line)}`)
        : [];

    const allLines = [formattedTitle, ...formattedLines];

    const width = Math.max(
        30,
        ...allLines.map(line => Array.from(line).length + 4)
    );

    const border = "━".repeat(width);

    const header =
        `╔═══〔 ✧ ${formattedTitle} ✧ 〕═══╗`;

    const body = formattedLines
        .map(line => `┃  ${line}`)
        .join("\n");

    const footer =
        `╚${border}╝`;

    return `${header}\n${body}\n${footer}`;
}

module.exports = {
    toKayseurFont,
    boxText
};