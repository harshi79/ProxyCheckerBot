/** All inline keyboards. Callback data is intentionally short and ASCII. */
import { InlineKeyboard } from "grammy";
import type { UserRow } from "../../store/db.js";

export function mainMenuKb(isAdmin = false): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text({ text: "↯ ᴅᴇᴠᴇʟᴏᴘᴇʀ", style: "primary" }, "dev")
    .text({ text: "⚙ ꜱᴇᴛ ᴜʀʟ", style: "primary" }, "setu")
    .text({ text: "◉ ᴘʀꜰɪʟᴇ", style: "primary" }, "prf");
  if (isAdmin) {
    kb.row().text({ text: "👑 ᴀᴅᴍɪɴ ᴄᴏɴꜱᴏʟᴇ", style: "primary" }, "adm_menu");
  }
  return kb;
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

/* ─────────────────────────── admin keyboards ─────────────────────────── */

export function adminDashboardKb(maintenance: boolean): InlineKeyboard {
  const maintLabel = maintenance ? "🚧 ᴍᴀɪɴᴛ: ON" : "🚧 ᴍᴀɪɴᴛ: OFF";
  const maintStyle = maintenance ? "danger" : "success";

  return new InlineKeyboard()
    .text({ text: "👥 ᴜꜱᴇʀꜱ", style: "primary" }, "adm_users:1")
    .text({ text: "📊 ꜱᴛᴀᴛꜱ", style: "primary" }, "adm_stats")
    .row()
    .text({ text: "📢 ʙʀᴏᴀᴅᴄᴀꜱᴛ", style: "primary" }, "adm_bcast")
    .text({ text: maintLabel, style: maintStyle }, "adm_maint")
    .row()
    .text({ text: "❓ ʜᴇʟᴘ", style: "primary" }, "adm_help")
    .text({ text: "🔄 ʀᴇꜰʀᴇꜱʜ", style: "primary" }, "adm_refresh")
    .row()
    .text("◁ ʙᴀᴄᴋ", "back");
}

export function adminStatsKb(): InlineKeyboard {
  return new InlineKeyboard()
    .text({ text: "🔄 ʀᴇꜰʀᴇꜱʜ", style: "primary" }, "adm_stats")
    .text("◁ ᴀᴅᴍɪɴ", "adm_menu");
}

export function adminUsersListKb(users: UserRow[], page: number, totalPages: number): InlineKeyboard {
  const kb = new InlineKeyboard();

  // 2 users per row
  for (let i = 0; i < users.length; i += 2) {
    const u1 = users[i];
    const u2 = users[i + 1];
    if (!u1) continue;

    const label1 = (u1.username ? `@${u1.username}` : u1.name || String(u1.id)).slice(0, 16);
    kb.text({ text: `👤 ${label1}`, style: u1.banned ? "danger" : "primary" }, `usr:${u1.id}`);
    if (u2) {
      const label2 = (u2.username ? `@${u2.username}` : u2.name || String(u2.id)).slice(0, 16);
      kb.text({ text: `👤 ${label2}`, style: u2.banned ? "danger" : "primary" }, `usr:${u2.id}`);
    }
    kb.row();
  }

  // Navigation row
  if (page > 1) {
    kb.text("◀ ᴘʀᴇᴠ", `adm_users:${page - 1}`);
  }
  kb.text(`📖 ${page}/${totalPages}`, "adm_noop");
  if (page < totalPages) {
    kb.text("ɴᴇxᴛ ▶", `adm_users:${page + 1}`);
  }
  kb.row();

  // Bottom action row
  kb.text({ text: "🔍 ꜱᴇᴀʀᴄʜ", style: "primary" }, "adm_find")
    .text("◁ ᴀᴅᴍɪɴ", "adm_menu");

  return kb;
}

export function adminUserDetailKb(targetUser: UserRow, isOwnerUser: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();

  if (!isOwnerUser) {
    if (targetUser.banned) {
      kb.text({ text: "✅ ᴜɴʙᴀɴ", style: "success" }, `u_unban:${targetUser.id}`);
    } else {
      kb.text({ text: "🔨 ʙᴀɴ", style: "danger" }, `u_ban:${targetUser.id}`);
    }
    kb.text({ text: "🗑 ᴄʟᴇᴀʀ ᴜʀʟꜱ", style: "danger" }, `u_clr:${targetUser.id}`);
    kb.row();

    kb.text({ text: "🔄 ʀᴇꜱᴇᴛ ꜱᴛᴀᴛꜱ", style: "danger" }, `u_rst:${targetUser.id}`);
    kb.text({ text: "✉️ ᴅᴍ ᴜꜱᴇʀ", style: "primary" }, `u_dm:${targetUser.id}`);
    kb.row();
  }

  kb.text("👥 ᴜꜱᴇʀꜱ ʟɪꜱᴛ", "adm_users:1")
    .text("◁ ᴀᴅᴍɪɴ", "adm_menu");

  return kb;
}

export function adminBackKb(): InlineKeyboard {
  return new InlineKeyboard().text("◁ ᴀᴅᴍɪɴ", "adm_menu");
}

export function broadcastDoneKb(): InlineKeyboard {
  return new InlineKeyboard()
    .text({ text: "📢 ɴᴇᴡ ʙʀᴏᴀᴅᴄᴀꜱᴛ", style: "primary" }, "adm_bcast")
    .text("◁ ᴀᴅᴍɪɴ", "adm_menu");
}
