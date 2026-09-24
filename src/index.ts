/** Yori Proxy Checker — entrypoint. */
import { config } from "./config.js";
import { createBot } from "./bot/bot.js";
import { closeDb } from "./store/db.js";

if (!config.botToken) {
  console.error("BOT_TOKEN is not set. Copy .env.example to .env and add your token from @BotFather.");
  process.exit(1);
}

const bot = createBot();

void bot
  .start({
    drop_pending_updates: true,
    onStart: (info) => console.log(`🕸  @${info.username} is up (api: ${config.apiBaseUrl})`),
  })
  .catch((error: unknown) => {
    console.error("[bot] fatal:", error);
    process.exitCode = 1;
  });

function shutdown(): void {
  console.log("[bot] shutting down…");
  bot.stop();
  closeDb();
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
