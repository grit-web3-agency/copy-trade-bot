import { Bot, Context } from 'grammy';
import Database from 'better-sqlite3';
import {
  getOrCreateUser,
  setCopyEnabled,
  addWatchedWhale,
  getWatchedWhales,
  getWallet,
  setUserSettings,
  getUserSettings,
} from './db';
import { createAndStoreWallet, getBalance } from './wallet-manager';
import { Connection, PublicKey } from '@solana/web3.js';

export function createBot(token: string, database: Database.Database, rpcUrl?: string): Bot {
  const bot = new Bot(token);
  const connection = new Connection(rpcUrl || 'https://api.devnet.solana.com');

  // /start — register user and create wallet
  bot.command('start', async (ctx) => {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    try {
      const user = getOrCreateUser(database, telegramId, ctx.from?.username);
      const wallet = getWallet(database, telegramId);

      let pubkey: string;
      if (wallet) {
        pubkey = wallet.public_key;
      } else {
        pubkey = createAndStoreWallet(database, telegramId);
      }

      await ctx.reply(
        `Welcome to Copy-Trade Bot!\n\n` +
        `Your wallet: \`${pubkey}\`\n\n` +
        `Commands:\n` +
        `/watch [address] — Monitor a whale wallet\n` +
        `/copy on|off — Toggle copy trading\n` +
        `/balance — Check your wallet balance\n` +
        `/settings — Configure max trade size & slippage\n` +
        `/help — Show this message`,
        { parse_mode: 'Markdown' }
      );
    } catch (err: any) {
      console.error('[Bot] /start error:', err?.message || err);
      await ctx.reply('Something went wrong during registration. Please try again.');
    }
  });

  // /help
  bot.command('help', async (ctx) => {
    await ctx.reply(
      `Copy-Trade Bot Commands:\n\n` +
      `/start — Register & create wallet\n` +
      `/watch [address] — Monitor a whale wallet\n` +
      `/copy on|off — Toggle copy trading\n` +
      `/balance — Check your wallet balance\n` +
      `/settings — Configure max trade size & slippage`
    );
  });

  // /watch [address] — add whale address to monitoring
  bot.command('watch', async (ctx) => {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    try {
      getOrCreateUser(database, telegramId, ctx.from?.username);

      const text = ctx.message?.text || '';
      const parts = text.split(/\s+/);
      const address = parts[1];

      if (!address) {
        // Show current watched addresses
        const whales = getWatchedWhales(database, telegramId);
        if (whales.length === 0) {
          await ctx.reply('No whale addresses being watched.\nUsage: /watch [solana_address]');
        } else {
          const list = whales.map((w, i) => `${i + 1}. \`${w.whale_address}\``).join('\n');
          await ctx.reply(`Watched whales:\n${list}`, { parse_mode: 'Markdown' });
        }
        return;
      }

      // Validate Solana address format
      try {
        new PublicKey(address);
      } catch {
        await ctx.reply('Invalid Solana address. Please provide a valid base58 address.');
        return;
      }

      const whale = addWatchedWhale(database, telegramId, address);
      await ctx.reply(`Now watching whale: \`${address}\``, { parse_mode: 'Markdown' });
    } catch (err: any) {
      console.error('[Bot] /watch error:', err?.message || err);
      await ctx.reply('Failed to process watch command. Please try again.');
    }
  });

  // /copy on|off — toggle copy trading
  bot.command('copy', async (ctx) => {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    try {
      getOrCreateUser(database, telegramId, ctx.from?.username);

      const text = ctx.message?.text || '';
      const parts = text.split(/\s+/);
      const arg = parts[1]?.toLowerCase();

      if (arg === 'on') {
        setCopyEnabled(database, telegramId, true);
        await ctx.reply('Copy trading ENABLED. Bot will copy whale trades (dry-run mode).');
      } else if (arg === 'off') {
        setCopyEnabled(database, telegramId, false);
        await ctx.reply('Copy trading DISABLED.');
      } else {
        const user = getOrCreateUser(database, telegramId);
        const status = user.copy_enabled ? 'ON' : 'OFF';
        await ctx.reply(`Copy trading is currently: ${status}\nUsage: /copy on|off`);
      }
    } catch (err: any) {
      console.error('[Bot] /copy error:', err?.message || err);
      await ctx.reply('Failed to update copy trading status. Please try again.');
    }
  });

  // /balance — check wallet balance
  bot.command('balance', async (ctx) => {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const wallet = getWallet(database, telegramId);
    if (!wallet) {
      await ctx.reply('No wallet found. Use /start to create one.');
      return;
    }

    try {
      const balance = await getBalance(connection, wallet.public_key);
      await ctx.reply(
        `Wallet: \`${wallet.public_key}\`\nBalance: ${balance.toFixed(4)} SOL`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      await ctx.reply(`Wallet: \`${wallet.public_key}\`\nBalance: Unable to fetch (devnet)`, { parse_mode: 'Markdown' });
    }
  });

  // /settings — view or change user settings (max trade size, slippage)
  bot.command('settings', async (ctx) => {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    try {
      getOrCreateUser(database, telegramId, ctx.from?.username);

      const text = ctx.message?.text || '';
      const parts = text.split(/\s+/).slice(1);

      if (parts.length === 0) {
        const s = getUserSettings(database, telegramId);
        await ctx.reply(`Current settings:\n- max_trade_size_sol: ${s.max_trade_size_sol} SOL\n- slippage_bps: ${s.slippage_bps} bps`);
        return;
      }

      // parse commands: /settings max 0.2 | /settings slippage 150 | combinations
      let max: number | undefined;
      let slippage: number | undefined;
      const errors: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i].toLowerCase();
        if (p === 'max' && parts[i + 1]) {
          const v = parseFloat(parts[i + 1]);
          if (isNaN(v)) {
            errors.push('max must be a number');
          } else if (v < 0.001 || v > 10) {
            errors.push('max must be between 0.001 and 10 SOL');
          } else {
            max = v;
          }
          i++;
        } else if ((p === 'slippage' || p === 'slip') && parts[i + 1]) {
          const v = parseInt(parts[i + 1], 10);
          if (isNaN(v)) {
            errors.push('slippage must be a number');
          } else if (v < 1 || v > 5000) {
            errors.push('slippage must be between 1 and 5000 bps');
          } else {
            slippage = v;
          }
          i++;
        }
      }

      if (errors.length > 0) {
        await ctx.reply(`Validation error:\n${errors.join('\n')}`);
        return;
      }

      if (typeof max === 'undefined' && typeof slippage === 'undefined') {
        await ctx.reply('Usage: /settings [max <SOL>] [slippage <bps>]\nExample: /settings max 0.1 slippage 100');
        return;
      }

      setUserSettings(database, telegramId, { maxTradeSizeSol: max, slippageBps: slippage });
      const s = getUserSettings(database, telegramId);
      await ctx.reply(`Settings updated:\n- max_trade_size_sol: ${s.max_trade_size_sol} SOL\n- slippage_bps: ${s.slippage_bps} bps`);
    } catch (err: any) {
      console.error('[Bot] /settings error:', err?.message || err);
      await ctx.reply('Failed to update settings. Please try again.');
    }
  });

  return bot;
}
