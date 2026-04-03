import { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { saveWallet, getWallet } from './db';

const ENCRYPTION_KEY = crypto.randomBytes(32); // In production, derive from user password or env

export function createWallet(): { publicKey: string; secretKey: Uint8Array } {
  const keypair = Keypair.generate();
  return {
    publicKey: keypair.publicKey.toBase58(),
    secretKey: keypair.secretKey,
  };
}

export function encryptSecret(secret: Uint8Array): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(secret)), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decryptSecret(encryptedStr: string): Uint8Array {
  try {
    const [ivHex, encHex] = encryptedStr.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return new Uint8Array(decrypted);
  } catch (err) {
    console.error('[WalletManager] decryptSecret error:', err);
    throw err;
  }
}

export function createAndStoreWallet(database: Database.Database, telegramId: string): string {
  try {
    const { publicKey, secretKey } = createWallet();
    const encrypted = encryptSecret(secretKey);
    saveWallet(database, telegramId, publicKey, encrypted);
    return publicKey;
  } catch (err) {
    console.error('[WalletManager] createAndStoreWallet error:', err);
    throw err;
  }
}

export function getKeypair(database: Database.Database, telegramId: string): Keypair | null {
  try {
    const wallet = getWallet(database, telegramId);
    if (!wallet) return null;
    const secret = decryptSecret(wallet.encrypted_secret);
    return Keypair.fromSecretKey(secret);
  } catch (err) {
    console.error('[WalletManager] getKeypair error:', err);
    return null;
  }
}

export async function getBalance(connection: Connection, publicKey: string): Promise<number> {
  try {
    const balance = await connection.getBalance(new PublicKey(publicKey));
    return balance / LAMPORTS_PER_SOL;
  } catch (err) {
    console.error('[WalletManager] getBalance error:', err);
    throw err;
  }
}
