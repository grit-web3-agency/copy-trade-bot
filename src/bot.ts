import { Bot } from 'grammy';
import dotenv from 'dotenv';
import { DEFAULT_POLICY, PolicyConfig } from './policy';

dotenv.config();
const token = process.env.TELEGRAM_BOT_TOKEN;

/** Per-user settings stored in memory (MVP — no DB persistence) */
export interface UserSettings {
  maxTradeLamports: number;
  slippagePct: number;
  watchAddress: string | null;
  copyEnabled: boolean;
  posterEnabled: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  maxTradeLamports: DEFAULT_POLICY.maxPerWalletLamports,
  slippagePct: DEFAULT_POLICY.slippagePct,
  watchAddress: null,
  copyEnabled: false,
  posterEnabled: true,
};

/** In-memory user settings map (chatId → settings) */
export const userSettingsMap = new Map<number, UserSettings>();

export function getUserSettings(chatId: number): UserSettings {
  if (!userSettingsMap.has(chatId)) {
    userSettingsMap.set(chatId, { ...DEFAULT_SETTINGS });
  }
  return userSettingsMap.get(chatId)!;
}

export function makeBot() {
  if (!token) {
    // return a stub for tests
    const stub: any = {
      start: async () => {},
      stop: async () => {},
      api: {},
      command: () => {},
    };
    return stub;
  }

  const bot = new Bot(token);

  bot.command('start', (ctx) =>
    ctx.reply(
      'Copy-Trade Bot (MVP) — Solana devnet\n\n' +
        'Commands:\n' +
        '/help — show commands\n' +
        '/watch <address> — watch a whale wallet\n' +
        '/copy on|off — enable/disable copy trading\n' +
        '/balance — show wallet balance\n' +
        '/settings — view current settings\n' +
        '/settings max <SOL> — set max trade size\n' +
        '/settings slippage <pct> — set slippage %\n' +
        '/settings poster on|off — toggle activity posting'
    )
  );

  bot.command('help', (ctx) =>
    ctx.reply(
      '/start — boot\n' +
        '/help — commands\n' +
        '/watch <address> — watch a whale wallet\n' +
        '/copy on|off — toggle copy trading\n' +
        '/balance — show wallet info\n' +
        '/settings — view/change settings'
    )
  );

  bot.command('watch', (ctx) => {
    const chatId = ctx.chat.id;
    const addr = ctx.match?.trim();
    if (!addr) {
      return ctx.reply('Usage: /watch <solana address>');
    }
    // Basic validation: Solana addresses are base58 and 32-44 chars
    if (addr.length < 32 || addr.length > 44) {
      return ctx.reply('Invalid Solana address. Must be 32-44 characters.');
    }
    const settings = getUserSettings(chatId);
    settings.watchAddress = addr;
    return ctx.reply(`Now watching: ${addr}\nUse /copy on to start copy trading.`);
  });

  bot.command('copy', (ctx) => {
    const chatId = ctx.chat.id;
    const arg = ctx.match?.trim().toLowerCase();
    const settings = getUserSettings(chatId);

    if (arg === 'on') {
      if (!settings.watchAddress) {
        return ctx.reply('No wallet being watched. Use /watch <address> first.');
      }
      settings.copyEnabled = true;
      return ctx.reply('Copy trading ENABLED.');
    } else if (arg === 'off') {
      settings.copyEnabled = false;
      return ctx.reply('Copy trading DISABLED.');
    }
    return ctx.reply(`Copy trading is ${settings.copyEnabled ? 'ON' : 'OFF'}.\nUsage: /copy on|off`);
  });

  bot.command('balance', (ctx) => {
    // MVP: show settings summary (no real wallet connection without keypair)
    const settings = getUserSettings(ctx.chat.id);
    return ctx.reply(
      `Wallet: (connect keypair for live balance)\n` +
        `Watch: ${settings.watchAddress ?? 'none'}\n` +
        `Copy: ${settings.copyEnabled ? 'ON' : 'OFF'}\n` +
        `Max trade: ${settings.maxTradeLamports / 1e9} SOL\n` +
        `Slippage: ${settings.slippagePct}%`
    );
  });

  bot.command('settings', (ctx) => {
    const chatId = ctx.chat.id;
    const settings = getUserSettings(chatId);
    const args = ctx.match?.trim().split(/\s+/) ?? [];

    // /settings (no args) — show current
    if (!args[0]) {
      return ctx.reply(
        `Current settings:\n` +
          `  Max trade: ${settings.maxTradeLamports / 1e9} SOL\n` +
          `  Slippage: ${settings.slippagePct}%\n` +
          `  Poster: ${settings.posterEnabled ? 'ON' : 'OFF'}\n` +
          `  Watch: ${settings.watchAddress ?? 'none'}\n` +
          `  Copy: ${settings.copyEnabled ? 'ON' : 'OFF'}`
      );
    }

    const sub = args[0].toLowerCase();

    // /settings max <SOL>
    if (sub === 'max') {
      const val = parseFloat(args[1]);
      if (isNaN(val) || val <= 0) {
        return ctx.reply('Usage: /settings max <SOL amount>\nExample: /settings max 0.5');
      }
      settings.maxTradeLamports = Math.round(val * 1e9);
      return ctx.reply(`Max trade size set to ${val} SOL.`);
    }

    // /settings slippage <pct>
    if (sub === 'slippage') {
      const val = parseFloat(args[1]);
      if (isNaN(val) || val < 0 || val > 100) {
        return ctx.reply('Usage: /settings slippage <0-100>\nExample: /settings slippage 2');
      }
      settings.slippagePct = val;
      return ctx.reply(`Slippage set to ${val}%.`);
    }

    // /settings poster on|off
    if (sub === 'poster') {
      const flag = args[1]?.toLowerCase();
      if (flag === 'on') {
        settings.posterEnabled = true;
        return ctx.reply('Activity posting ENABLED.');
      } else if (flag === 'off') {
        settings.posterEnabled = false;
        return ctx.reply('Activity posting DISABLED.');
      }
      return ctx.reply('Usage: /settings poster on|off');
    }

    return ctx.reply(
      'Unknown setting. Available:\n' +
        '/settings max <SOL>\n' +
        '/settings slippage <pct>\n' +
        '/settings poster on|off'
    );
  });

  // Catch-all for unknown commands
  bot.on('message', (ctx) => {
    // Only respond to commands (messages starting with /)
    const text = ctx.message?.text ?? '';
    if (text.startsWith('/')) {
      return ctx.reply('Unknown command. Use /help to see available commands.');
    }
  });

  return bot;
}

export async function startBot() {
  const bot = makeBot();
  if (bot && bot.start) {
    try {
      await bot.start();
    } catch (e) {
      console.error('[BOT] Start failed:', (e as any)?.message || e);
    }
  }
  return bot;
}

if (require.main === module) {
  startBot();
}
