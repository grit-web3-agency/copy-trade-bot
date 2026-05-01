import { Bot, Context } from 'grammy';
import Database from 'better-sqlite3';
import {
  getOrCreateUser,
  setCopyEnabled,
  addWatchedWhale,
  removeWatchedWhale,
  getWatchedWhales,
  getWallet,
  setUserSettings,
  getUserSettings,
  setTradeMode,
  getTradeMode,
  getRecentTrades,
  isWhaleWatchedByAnyone,
} from './db';
import { getPnlSummary, formatPnlMessage } from './pnl';
import {
  PLANS,
  formatPlans,
  formatSubscriptionStatus,
  activateSubscription,
  getUserPlan,
  checkWhaleLimit,
  getTreasuryAddress,
} from './payment';
import { getActiveSubscription } from './db';
import type { TradeMode } from './db';
import { createAndStoreWallet, getBalance } from './wallet-manager';
import { Connection, PublicKey } from '@solana/web3.js';
import type { WhaleListener } from './whale-listener';

export function createBot(token: string, database: Database.Database, rpcUrl?: string, listener?: WhaleListener): Bot {
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
        `/watch [addr1] [addr2] ... — Monitor whale wallets\n` +
        `/unwatch [addr1] [addr2] ... — Stop monitoring\n` +
        `/copy on|off — Toggle copy trading\n` +
        `/mode dry-run|devnet — Switch trading mode\n` +
        `/balance — Check your wallet balance\n` +
        `/pnl — View profit & loss summary\n` +
        `/settings — Configure max trade size & slippage\n` +
        `/plans — View subscription plans\n` +
        `/subscribe [plan] [tx] — Activate subscription\n` +
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
      `/watch [addr1] [addr2] ... — Monitor whale wallets\n` +
      `/unwatch [addr1] [addr2] ... — Stop monitoring\n` +
      `/copy on|off — Toggle copy trading\n` +
      `/mode dry-run|devnet — Switch trading mode\n` +
      `/balance — Check your wallet balance\n` +
      `/pnl — View profit & loss summary\n` +
      `/settings — Configure max trade size & slippage\n` +
      `/plans — View subscription plans\n` +
      `/subscribe [plan] [tx] — Activate subscription`
    );
  });

  // /watch [address ...] — add one or more whale addresses to monitoring
  bot.command('watch', async (ctx) => {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    try {
      getOrCreateUser(database, telegramId, ctx.from?.username);

      const text = ctx.message?.text || '';
      const parts = text.split(/\s+/).slice(1); // skip command

      if (parts.length === 0) {
        // Show current watched addresses
        const whales = getWatchedWhales(database, telegramId);
        if (whales.length === 0) {
          await ctx.reply('No whale addresses being watched.\nUsage: /watch [address1] [address2] ...');
        } else {
          const list = whales.map((w, i) => `${i + 1}. \`${w.whale_address}\``).join('\n');
          await ctx.reply(`Watched whales:\n${list}`, { parse_mode: 'Markdown' });
        }
        return;
      }

      // Validate all addresses first
      const invalid: string[] = [];
      const valid: string[] = [];
      for (const addr of parts) {
        try {
          new PublicKey(addr);
          valid.push(addr);
        } catch {
          invalid.push(addr);
        }
      }

      if (invalid.length > 0) {
        await ctx.reply(`Invalid address(es): ${invalid.join(', ')}\nSkipped. Provide valid base58 Solana addresses.`);
        if (valid.length === 0) return;
      }

      // Add all valid addresses
      const added: string[] = [];
      for (const addr of valid) {
        addWatchedWhale(database, telegramId, addr);
        if (listener) listener.addAddress(addr);
        added.push(addr);
      }

      const list = added.map(a => `\`${a}\``).join('\n');
      await ctx.reply(`Now watching ${added.length} whale(s):\n${list}`, { parse_mode: 'Markdown' });
    } catch (err: any) {
      console.error('[Bot] /watch error:', err?.message || err);
      await ctx.reply('Failed to process watch command. Please try again.');
    }
  });

  // /unwatch [address ...] — remove one or more whale addresses
  bot.command('unwatch', async (ctx) => {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    try {
      getOrCreateUser(database, telegramId, ctx.from?.username);

      const text = ctx.message?.text || '';
      const parts = text.split(/\s+/).slice(1);

      if (parts.length === 0) {
        await ctx.reply('Usage: /unwatch [address1] [address2] ...');
        return;
      }

      const removed: string[] = [];
      const notFound: string[] = [];
      for (const addr of parts) {
        const ok = removeWatchedWhale(database, telegramId, addr);
        if (ok) {
          removed.push(addr);
          // Remove from listener if no other user watches this address
          if (listener && !isWhaleWatchedByAnyone(database, addr)) {
            listener.removeAddress(addr);
          }
        } else {
          notFound.push(addr);
        }
      }

      const lines: string[] = [];
      if (removed.length > 0) lines.push(`Unwatched: ${removed.map(a => `\`${a}\``).join(', ')}`);
      if (notFound.length > 0) lines.push(`Not found/already removed: ${notFound.join(', ')}`);
      await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
    } catch (err: any) {
      console.error('[Bot] /unwatch error:', err?.message || err);
      await ctx.reply('Failed to process unwatch command. Please try again.');
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
        const mode = getTradeMode(database, telegramId);
        await ctx.reply(
          `Current settings:\n- max_trade_size_sol: ${s.max_trade_size_sol} SOL\n- slippage_bps: ${s.slippage_bps} bps\n- mode: ${mode}`
        );
        return;
      }

      // /settings set-mode dry-run|devnet — alias for /mode command
      if (parts[0]?.toLowerCase() === 'set-mode' && parts[1]) {
        const modeArg = parts[1].toLowerCase();
        if (modeArg === 'dry-run' || modeArg === 'dryrun' || modeArg === 'dry' || modeArg === 'mock') {
          setTradeMode(database, telegramId, 'dry-run');
          await ctx.reply('Trading mode set to DRY-RUN (mock). Trades will be simulated.');
        } else if (modeArg === 'devnet' || modeArg === 'real') {
          setTradeMode(database, telegramId, 'devnet');
          await ctx.reply(
            'Trading mode set to DEVNET. Trades will be submitted to Solana devnet.\n' +
            'Make sure your wallet has devnet SOL (use a faucet).'
          );
        } else {
          await ctx.reply('Invalid mode. Usage: /settings set-mode dry-run|devnet');
        }
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

  // /mode dry-run|devnet — switch trading mode
  bot.command('mode', async (ctx) => {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    try {
      getOrCreateUser(database, telegramId, ctx.from?.username);

      const text = ctx.message?.text || '';
      const parts = text.split(/\s+/);
      const arg = parts[1]?.toLowerCase();

      if (arg === 'dry-run' || arg === 'dryrun' || arg === 'dry') {
        setTradeMode(database, telegramId, 'dry-run');
        await ctx.reply('Trading mode set to DRY-RUN. Trades will be simulated (no real transactions).');
      } else if (arg === 'devnet' || arg === 'real') {
        setTradeMode(database, telegramId, 'devnet');
        await ctx.reply(
          'Trading mode set to DEVNET. Trades will be submitted to Solana devnet.\n' +
          'Make sure your wallet has devnet SOL (use a faucet).'
        );
      } else {
        const current = getTradeMode(database, telegramId);
        await ctx.reply(
          `Current trading mode: ${current.toUpperCase()}\n` +
          `Usage: /mode dry-run|devnet`
        );
      }
    } catch (err: any) {
      console.error('[Bot] /mode error:', err?.message || err);
      await ctx.reply('Failed to update trading mode. Please try again.');
    }
  });

  // /pnl — show profit & loss summary
  bot.command('pnl', async (ctx) => {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    try {
      getOrCreateUser(database, telegramId, ctx.from?.username);

      const summary = await getPnlSummary(database, telegramId);
      const recent = getRecentTrades(database, telegramId, 5);
      const msg = formatPnlMessage(summary, recent);

      await ctx.reply(msg, { parse_mode: 'Markdown' });
    } catch (err: any) {
      console.error('[Bot] /pnl error:', err?.message || err);
      await ctx.reply('Failed to fetch PnL data. Please try again.');
    }
  });

  // /plans — show available subscription plans
  bot.command('plans', async (ctx) => {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    try {
      getOrCreateUser(database, telegramId, ctx.from?.username);
      const status = formatSubscriptionStatus(database, telegramId);
      const plans = formatPlans();
      const treasury = getTreasuryAddress();

      await ctx.reply(
        `${status}\n\n` +
        `Available Plans:\n\n${plans}\n\n` +
        `To subscribe, send SOL to:\n\`${treasury}\`\n` +
        `Then: /subscribe [plan] [tx_signature]`,
        { parse_mode: 'Markdown' }
      );
    } catch (err: any) {
      console.error('[Bot] /plans error:', err?.message || err);
      await ctx.reply('Failed to fetch plans. Please try again.');
    }
  });

  // /subscribe [plan] [tx_signature] — activate a subscription
  bot.command('subscribe', async (ctx) => {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    try {
      getOrCreateUser(database, telegramId, ctx.from?.username);

      const text = ctx.message?.text || '';
      const parts = text.split(/\s+/).slice(1);

      if (parts.length === 0) {
        const status = formatSubscriptionStatus(database, telegramId);
        await ctx.reply(
          `${status}\n\nUsage: /subscribe [plan] [tx_signature]\nPlans: free, basic, pro\n\nUse /plans to see details.`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      const planId = parts[0].toLowerCase();
      const txSig = parts[1] || null;

      if (!PLANS[planId]) {
        await ctx.reply(`Unknown plan: ${planId}\nAvailable: ${Object.keys(PLANS).join(', ')}`);
        return;
      }

      if (planId !== 'free' && !txSig) {
        const plan = PLANS[planId];
        const treasury = getTreasuryAddress();
        await ctx.reply(
          `To subscribe to *${plan.name}*, send ${plan.priceSol} SOL to:\n` +
          `\`${treasury}\`\n\n` +
          `Then run: /subscribe ${planId} [tx_signature]`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      const result = await activateSubscription(database, telegramId, planId, txSig);

      if (result.success) {
        const plan = PLANS[planId];
        await ctx.reply(
          `Subscription activated!\n\n` +
          `Plan: *${plan.name}*\n` +
          `Whales: ${plan.maxWhales}\n` +
          `Trades/day: ${plan.maxTradesPerDay === -1 ? 'unlimited' : plan.maxTradesPerDay}`,
          { parse_mode: 'Markdown' }
        );
      } else {
        await ctx.reply(`Subscription failed: ${result.error}`);
      }
    } catch (err: any) {
      console.error('[Bot] /subscribe error:', err?.message || err);
      await ctx.reply('Failed to process subscription. Please try again.');
    }
  });

  return bot;
}
