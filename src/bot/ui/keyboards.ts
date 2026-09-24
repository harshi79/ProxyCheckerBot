/** All inline keyboards. Callback data is intentionally short and ASCII. */
import { InlineKeyboard } from "grammy";

export function mainMenuKb(): InlineKeyboard {
  return new InlineKeyboard()
    .text({ text: "↯ ᴅᴇᴠᴇʟᴏᴘᴇʀ", style: "primary" }, "dev")
    .text({ text: "⚙ ꜱᴇᴛ ᴜʀʟ", style: "primary" }, "setu")
    .text({ text: "◉ ᴘʀꜰɪʟᴇ", style: "primary" }, "prf");
}

export function developerKbFor(devUrl: string): InlineKeyboard {
  return new InlineKeyboard()
    .url({ text: "↯ ᴏᴘᴇɴ ᴅᴇᴠ", style: "primary" }, devUrl)
    .text("◁ ʙᴀᴄᴋ", "back");
}

export function manageUrlsKb(): InlineKeyboard {
  return new InlineKeyboard()
    .text({ text: "⚙ ꜱᴇᴛ", style: "primary" }, "set")
    .text({ text: "◉ ᴍᴀɴᴀɢᴇ", style: "primary" }, "mgr");
}

export function manageActionsKb(): InlineKeyboard {
  return new InlineKeyboard()
    .text({ text: "✕ ʀᴇᴍᴏᴠᴇ", style: "danger" }, "rmv")
    .text({ text: "📄 ꜱᴇᴇ", style: "success" }, "see")
    .text("◁ ʙᴀᴄᴋ", "back");
}

export function setUrlsPromptKb(): InlineKeyboard {
  return new InlineKeyboard().text("◁ ʙᴀᴄᴋ", "back");
}

export function checkKb(jobId: string, urlCount: number): InlineKeyboard {
  return new InlineKeyboard()
    .text({ text: `✅ ᴄʜᴇᴄᴋ (${urlCount} ᴜʀʟ${urlCount > 1 ? "ꜱ" : ""})`, style: "success" }, `chk:${jobId}`)
    .text({ text: "⚙ ᴄʜᴀɴɢᴇ ᴜʀʟꜱ", style: "primary" }, "setu")
    .text("◁ ʙᴀᴄᴋ", "back");
}

export function skipKb(jobId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text({ text: "⚙ ꜱᴇᴛ ᴜʀʟ", style: "primary" }, "setu")
    .text("⏭ ꜱᴋɪᴘ (ᴅᴇꜰᴀᴜʟᴛ)", `skip:${jobId}`);
}

export function resultKb(): InlineKeyboard {
  return new InlineKeyboard().text({ text: "↻ ᴄʜᴇᴄᴋ ᴀɢᴀɪɴ", style: "primary" }, "back");
}

export function backKb(): InlineKeyboard {
  return new InlineKeyboard().text("◁ ʙᴀᴄᴋ", "back");
}
