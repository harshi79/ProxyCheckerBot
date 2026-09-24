/** Yori Proxy Checker — entrypoint. */
import { config } from "./config.js";
import { createBot } from "./bot/bot.js";
import { closeDb } from "./store/db.js";
import { startHealthServer, type HealthServer } from "./health.js";

let health: HealthServer | undefined;
let bot: ReturnType<typeof createBot> | undefined;

async function main(): Promise<void> {
  // Bind a port first so PaaS readiness checks succeed even if Telegram is slow
  // or BOT_TOKEN is not yet configured.
  health = await startHealthServer(config.port);

  if (!config.botToken) {
    console.warn(
      "BOT_TOKEN is not set. Health server is up; Telegram polling is disabled. " +
        "Copy .env.example to .env and add your token from @BotFather.",
    );
    return;
  }

  bot = createBot();
  void bot
    .start({
      drop_pending_updates: true,
      onStart: (info) =>
        console.log(`🕸  @${info.username} is up (api: ${config.apiBaseUrl})`),
    })
    .catch((error: unknown) => {
      console.error("[bot] fatal:", error);
      process.exitCode = 1;
    });
}

function shutdown(): void {
  console.log("[bot] shutting down…");
  bot?.stop();
  closeDb();
  void health?.close().catch(() => {
    /* ignore close races on exit */
  });
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

main().catch((error: unknown) => {
  console.error("[boot] fatal:", error);
  process.exit(1);
});
