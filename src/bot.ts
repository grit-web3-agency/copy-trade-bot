import { Bot } from 'grammy';
import dotenv from 'dotenv';

dotenv.config();
const token = process.env.TELEGRAM_BOT_TOKEN;

export function makeBot() {
  if (!token) {
    // return a stub for tests
    const stub: any = { start: async () => {}, stop: async () => {}, api: {}, command: () => {} };
    return stub;
  }
  const bot = new Bot(token);
  bot.command('start', ctx => ctx.reply('Copy-Trade Bot (MVP) — use /help to see commands'));
  bot.command('help', ctx => ctx.reply('/start - boot\n/help - commands\n/watch <address> - watch a wallet (coming soon)'));
  return bot;
}

export async function startBot() {
  const bot = makeBot();
  if (bot && bot.start) {
    try {
      await bot.start();
    } catch (e) {
      console.warn('bot start failed', (e as any)?.message || e);
    }
  }
  return bot;
}

if (require.main === module) {
  startBot();
}
