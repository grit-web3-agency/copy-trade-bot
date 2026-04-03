import { Bot } from 'grammy';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { Keypair, Connection } from '@solana/web3.js';
import { ensureDb, addFollower, getFollower, updateFollower } from './db';

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

  bot.command('help', ctx =>
    ctx.reply('/start - boot\n/help - commands\n/createwallet - create follower wallet\n/watch <address> - watch a wallet\n/copy <on|off> - enable/disable copying\n/balance - show follower wallet balance')
  );

  bot.command('createwallet', async ctx => {
    const chatId = String(ctx.chat?.id || ctx.from?.id || 'unknown');
    await ensureDb();
    const kp = Keypair.generate();
    const outdir = path.resolve(process.cwd(), 'followers');
    if (!fs.existsSync(outdir)) fs.mkdirSync(outdir);
    const fname = path.join(outdir, `${chatId}.json`);
    fs.writeFileSync(fname, JSON.stringify(Array.from(kp.secretKey)));
    await addFollower(chatId, { chatId, walletPath: fname, copyEnabled: false, watched: [] });
    await ctx.reply(`Created wallet for you. Public key: ${kp.publicKey.toBase58()}`);
  });

  bot.command('watch', async ctx => {
    const chatId = String(ctx.chat?.id || ctx.from?.id || 'unknown');
    const parts = (ctx.message && 'text' in ctx.message && ctx.message.text) ? ctx.message.text.split(/\s+/) : [];
    const addr = parts[1];
    if (!addr) return ctx.reply('Usage: /watch <address>');
    await ensureDb();
    const f = await getFollower(chatId);
    if (!f) return ctx.reply('No follower wallet found. Run /createwallet first.');
    if (!f.watched.includes(addr)) {
      f.watched.push(addr);
      await updateFollower(chatId, f);
    }
    return ctx.reply(`Watching ${addr}`);
  });

  bot.command('copy', async ctx => {
    const chatId = String(ctx.chat?.id || ctx.from?.id || 'unknown');
    const parts = (ctx.message && 'text' in ctx.message && ctx.message.text) ? ctx.message.text.split(/\s+/) : [];
    const mode = parts[1];
    if (!mode || !['on', 'off'].includes(mode)) return ctx.reply('Usage: /copy <on|off>');
    await ensureDb();
    const f = await getFollower(chatId);
    if (!f) return ctx.reply('No follower wallet found. Run /createwallet first.');
    f.copyEnabled = mode === 'on';
    await updateFollower(chatId, f);
    return ctx.reply(`Copying turned ${f.copyEnabled ? 'ON' : 'OFF'}`);
  });

  bot.command('balance', async ctx => {
    const chatId = String(ctx.chat?.id || ctx.from?.id || 'unknown');
    await ensureDb();
    const f = await getFollower(chatId);
    if (!f) return ctx.reply('No follower wallet found. Run /createwallet first.');
    try {
      const raw = JSON.parse(fs.readFileSync(f.walletPath, 'utf-8')) as number[];
      const kp = Keypair.fromSecretKey(Uint8Array.from(raw));
      const rpc = process.env.RPC_URL || 'https://api.devnet.solana.com';
      const conn = new Connection(rpc, 'confirmed');
      const bal = await conn.getBalance(kp.publicKey);
      return ctx.reply(`Balance: ${bal / 1e9} SOL`);
    } catch (e: any) {
      return ctx.reply(`Failed to read wallet: ${e.message}`);
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
      console.warn('bot start failed', (e as any)?.message || e);
    }
  }
  return bot;
}

if (require.main === module) {
  startBot();
}
