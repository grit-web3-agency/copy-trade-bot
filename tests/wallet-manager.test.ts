import { describe, it, expect, beforeEach } from 'vitest';
import {
  createWallet,
  encryptSecret,
  decryptSecret,
  createAndStoreWallet,
  getKeypair,
} from '../src/wallet-manager';
import { createTestDb, getWallet } from '../src/db';
import { Keypair } from '@solana/web3.js';
import Database from 'better-sqlite3';

describe('WalletManager', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    // Create a user for wallet operations
    db.prepare('INSERT INTO users (telegram_id, username) VALUES (?, ?)').run('user1', 'testuser');
  });

  describe('createWallet', () => {
    it('generates a valid Solana keypair', () => {
      const wallet = createWallet();
      expect(wallet.publicKey).toBeTruthy();
      expect(wallet.publicKey.length).toBeGreaterThan(30); // base58 Solana address
      expect(wallet.secretKey).toBeInstanceOf(Uint8Array);
      expect(wallet.secretKey.length).toBe(64); // ed25519 secret key
    });

    it('generates unique keypairs each time', () => {
      const w1 = createWallet();
      const w2 = createWallet();
      expect(w1.publicKey).not.toBe(w2.publicKey);
    });
  });

  describe('encrypt/decrypt', () => {
    it('encrypts and decrypts secret key correctly', () => {
      const { secretKey } = createWallet();
      const encrypted = encryptSecret(secretKey);

      expect(encrypted).toContain(':'); // iv:ciphertext format
      expect(encrypted).not.toBe(Buffer.from(secretKey).toString('hex'));

      const decrypted = decryptSecret(encrypted);
      expect(decrypted).toEqual(secretKey);
    });

    it('different encryptions of same key produce different ciphertext', () => {
      const { secretKey } = createWallet();
      const e1 = encryptSecret(secretKey);
      const e2 = encryptSecret(secretKey);
      // Different IVs should produce different ciphertext
      expect(e1).not.toBe(e2);
    });

    it('throws on invalid encrypted string', () => {
      expect(() => decryptSecret('invalid')).toThrow();
    });
  });

  describe('createAndStoreWallet', () => {
    it('creates wallet and stores it in DB', () => {
      const pubkey = createAndStoreWallet(db, 'user1');

      expect(pubkey).toBeTruthy();
      expect(pubkey.length).toBeGreaterThan(30);

      const stored = getWallet(db, 'user1');
      expect(stored).toBeDefined();
      expect(stored!.public_key).toBe(pubkey);
      expect(stored!.encrypted_secret).toBeTruthy();
    });
  });

  describe('getKeypair', () => {
    it('retrieves and decrypts stored keypair', () => {
      const pubkey = createAndStoreWallet(db, 'user1');
      const keypair = getKeypair(db, 'user1');

      expect(keypair).not.toBeNull();
      expect(keypair!.publicKey.toBase58()).toBe(pubkey);
    });

    it('returns null for non-existent user', () => {
      const keypair = getKeypair(db, 'nonexistent');
      expect(keypair).toBeNull();
    });
  });
});
