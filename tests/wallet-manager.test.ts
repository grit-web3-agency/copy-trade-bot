import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createWallet,
  encryptSecret,
  decryptSecret,
  createAndStoreWallet,
  getKeypair,
  getBalance,
} from '../src/wallet-manager';
import { createTestDb, getWallet } from '../src/db';
import { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import Database from 'better-sqlite3';

describe('wallet-manager', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    // ensure user row exists for FK
    db.prepare('INSERT OR IGNORE INTO users (telegram_id, username) VALUES (?, ?)').run('u1', 'testuser');
  });

  // --- createWallet ---
  describe('createWallet', () => {
    it('returns a valid Solana keypair', () => {
      const { publicKey, secretKey } = createWallet();
      expect(publicKey).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/); // base58
      expect(secretKey).toBeInstanceOf(Uint8Array);
      expect(secretKey.length).toBe(64);
      // round-trip: reconstruct keypair from secret
      const kp = Keypair.fromSecretKey(secretKey);
      expect(kp.publicKey.toBase58()).toBe(publicKey);
    });

    it('generates unique keypairs each call', () => {
      const a = createWallet();
      const b = createWallet();
      expect(a.publicKey).not.toBe(b.publicKey);
    });
  });

  // --- encrypt / decrypt ---
  describe('encryptSecret / decryptSecret', () => {
    it('round-trips a secret key correctly', () => {
      const { secretKey } = createWallet();
      const encrypted = encryptSecret(secretKey);
      expect(typeof encrypted).toBe('string');
      expect(encrypted).toContain(':'); // iv:ciphertext

      const decrypted = decryptSecret(encrypted);
      expect(decrypted).toEqual(secretKey);
    });

    it('produces different ciphertext each time (random IV)', () => {
      const secret = new Uint8Array(64).fill(42);
      const a = encryptSecret(secret);
      const b = encryptSecret(secret);
      expect(a).not.toBe(b); // different IVs
      // but both decrypt to same value
      expect(decryptSecret(a)).toEqual(secret);
      expect(decryptSecret(b)).toEqual(secret);
    });

    it('throws on corrupted ciphertext', () => {
      expect(() => decryptSecret('bad')).toThrow();
      expect(() => decryptSecret('0000:zzzz')).toThrow();
    });
  });

  // --- createAndStoreWallet ---
  describe('createAndStoreWallet', () => {
    it('creates wallet and stores in DB', () => {
      const pubkey = createAndStoreWallet(db, 'u1');
      expect(typeof pubkey).toBe('string');

      const row = getWallet(db, 'u1');
      expect(row).toBeDefined();
      expect(row!.public_key).toBe(pubkey);
      expect(row!.encrypted_secret).toContain(':');
    });

    it('overwrites wallet if called again (INSERT OR REPLACE)', () => {
      const pk1 = createAndStoreWallet(db, 'u1');
      const pk2 = createAndStoreWallet(db, 'u1');
      // second call replaces, so DB has the latest
      const row = getWallet(db, 'u1');
      expect(row!.public_key).toBe(pk2);
    });
  });

  // --- getKeypair ---
  describe('getKeypair', () => {
    it('returns Keypair from stored wallet', () => {
      const pubkey = createAndStoreWallet(db, 'u1');
      const kp = getKeypair(db, 'u1');
      expect(kp).not.toBeNull();
      expect(kp!.publicKey.toBase58()).toBe(pubkey);
    });

    it('returns null for non-existent user', () => {
      const kp = getKeypair(db, 'no-such-user');
      expect(kp).toBeNull();
    });
  });

  // --- getBalance ---
  describe('getBalance', () => {
    it('returns SOL balance from connection', async () => {
      const mockConnection = {
        getBalance: vi.fn().mockResolvedValue(2.5 * LAMPORTS_PER_SOL),
      } as unknown as Connection;

      const bal = await getBalance(mockConnection, 'So11111111111111111111111111111111111111112');
      expect(bal).toBeCloseTo(2.5);
      expect(mockConnection.getBalance).toHaveBeenCalledOnce();
    });

    it('throws on RPC error', async () => {
      const mockConnection = {
        getBalance: vi.fn().mockRejectedValue(new Error('RPC down')),
      } as unknown as Connection;

      await expect(getBalance(mockConnection, 'So11111111111111111111111111111111111111112'))
        .rejects.toThrow('RPC down');
    });
  });
});
