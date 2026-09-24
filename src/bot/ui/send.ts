/** Rich-first delivery with a legacy Bot API fallback and live progress drafts. */
import { Bot, Context, GrammyError, InputFile } from "grammy";
import type { Screen, ProgressData } from "./templates.js";
import { progressScreen } from "./templates.js";
import { hasAsset, readAsset, type ScreenImage } from "./images.js";

function isRichUnsupported(err: unknown): boolean {
  if (err instanceof GrammyError) {
    return err.error_code === 404 || /rich|not implemented|unknown method|method not found/i.test(err.description);
  }
  const candidate = err as { error_code?: unknown; description?: unknown };
  return candidate.error_code === 404 || /rich|not implemented|unknown method|method not found/i.test(String(candidate.description ?? ""));
}

export class Sender {
  private richOk: boolean | null = null;

  constructor(private readonly bot: Bot) {}

  get richSupported(): boolean {
    return this.richOk !== false;
  }

  forceLegacy(): void {
    this.richOk = false;
  }

  private richMedia(image?: ScreenImage): unknown[] | undefined {
    return image && hasAsset(image.file) ? [image.media] : undefined;
  }

  private richPayload(screen: Screen): Record<string, unknown> {
    const media = this.richMedia(screen.image);
    return {
      markdown: screen.rich,
      ...(media ? { media } : {}),
    };
  }

  /** Send a screen by chat id; this is also safe to call from a background job. */
  async sendTo(chatId: number | string, screen: Screen): Promise<void> {
    if (this.richSupported) {
      try {
        await this.bot.api.sendRichMessage(chatId, this.richPayload(screen) as never, {
          ...(screen.kb ? { reply_markup: screen.kb } : {}),
        });
        this.richOk = true;
        return;
      } catch (err) {
        if (!isRichUnsupported(err)) throw err;
        this.richOk = false;
      }
    }

    if (screen.image && hasAsset(screen.image.file)) {
      await this.bot.api.sendPhoto(chatId, new InputFile(readAsset(screen.image.file), screen.image.file));
    }
    await this.bot.api.sendMessage(chatId, screen.plain, {
      parse_mode: "HTML",
      ...(screen.kb ? { reply_markup: screen.kb } : {}),
    });
  }

  async sendScreen(ctx: Context, screen: Screen): Promise<void> {
    if (!ctx.chat) throw new Error("cannot send a screen without a chat");
    await this.sendTo(ctx.chat.id, screen);
  }

  /** Morph a callback message, using ephemeral rich replacement when available. */
  async morph(
    ctx: Context,
    screen: Screen,
    callback: { id: string; from: { id: number } },
  ): Promise<void> {
    if (!ctx.chat) throw new Error("cannot morph without a chat");
    if (this.richSupported) {
      try {
        await this.bot.api.sendRichMessage(ctx.chat.id, this.richPayload(screen) as never, {
          ...(screen.kb ? { reply_markup: screen.kb } : {}),
          ephemeral_message_parameters: {
            receiver_user_id: callback.from.id,
            callback_query_id: callback.id,
            replace_callback_query_message: true,
          },
        });
        return;
      } catch (err) {
        // Older Bot API servers do not know ephemeral rich replacement.
        if (isRichUnsupported(err)) this.forceLegacy();
      }
    }
    if (screen.image && hasAsset(screen.image.file)) {
      try {
        await ctx.deleteMessage();
      } catch {
        // If deletion is not allowed, the new screen is still useful.
      }
      await this.sendTo(ctx.chat.id, screen);
      return;
    }
    try {
      await ctx.editMessageText(screen.plain, {
        parse_mode: "HTML",
        ...(screen.kb ? { reply_markup: screen.kb } : {}),
      });
    } catch (err) {
      // Ignore Telegram's "message is not modified" error on redundant clicks
      const msg = String((err as Error)?.message || "");
      if (!msg.includes("message is not modified")) {
        throw err;
      }
    }
  }

  /** In-place edit helper for smooth text transitions. */
  async editScreen(ctx: Context, screen: Screen): Promise<void> {
    if (!ctx.chat) throw new Error("cannot edit without a chat");
    try {
      await ctx.editMessageText(screen.plain, {
        parse_mode: "HTML",
        ...(screen.kb ? { reply_markup: screen.kb } : {}),
      });
    } catch (err) {
      const msg = String((err as Error)?.message || "");
      if (msg.includes("message is not modified")) return;
      await this.sendScreen(ctx, screen);
    }
  }
}

export interface ProgressTargetSeed {
  display: string;
}

export interface ProgressSnapshot {
  done: number;
  hits: number;
  perTargetHits: Record<string, number>;
  startedAt: number;
}

export class ProgressStreamer {
  private mode: "draft" | "edit" | "off" = "off";
  private msgId: number | undefined;
  private timer: NodeJS.Timeout | undefined;
  private spin = 0;
  private snapshot: ProgressSnapshot;
  readonly draftId: number;
  readonly total: number;

  constructor(
    private readonly bot: Bot,
    private readonly sender: Sender,
    private readonly chatId: number,
    private readonly userId: number,
    private readonly targets: ProgressTargetSeed[],
    total: number,
  ) {
    this.draftId = 1 + Math.floor(Math.random() * 0xffffffff);
    this.total = total;
    this.snapshot = { done: 0, hits: 0, perTargetHits: {}, startedAt: Date.now() };
  }

  private render(now: number): string {
    const targetCount = Math.max(1, this.targets.length);
    const donePerTarget = Math.floor(this.snapshot.done / targetCount);
    const data: ProgressData = {
      total: this.total,
      done: this.snapshot.done,
      hits: this.snapshot.hits,
      startedAt: this.snapshot.startedAt,
      now,
      targets: this.targets.map((target) => ({
        display: target.display,
        done: donePerTarget,
        hits: this.snapshot.perTargetHits[target.display] ?? 0,
      })),
    };
    return progressScreen(data, this.spin);
  }

  async start(): Promise<void> {
    const text = this.render(Date.now());
    if (this.sender.richSupported) {
      try {
        await this.bot.api.sendRichMessageDraft(this.chatId, this.draftId, { markdown: text }, { can_stop: true });
        this.mode = "draft";
      } catch (err) {
        if (isRichUnsupported(err)) this.sender.forceLegacy();
        else throw err;
      }
    }
    if (this.mode === "off") {
      const response = await this.bot.api.sendMessage(this.chatId, text);
      this.msgId = response.message_id;
      this.mode = "edit";
    }
    this.timer = setInterval(() => void this.tick(), 1_000);
  }

  update(snapshot: ProgressSnapshot): void {
    this.snapshot = snapshot;
  }

  private async tick(): Promise<void> {
    this.spin += 1;
    const text = this.render(Date.now());
    try {
      if (this.mode === "draft") {
        await this.bot.api.sendRichMessageDraft(this.chatId, this.draftId, { markdown: text }, { can_stop: false });
      } else if (this.mode === "edit" && this.msgId !== undefined) {
        await this.bot.api.editMessageText(this.chatId, this.msgId, text);
      }
    } catch {
      // A single missed tick is harmless; the next tick retries.
    }
  }

  async finish(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.mode = "off";
  }
}
