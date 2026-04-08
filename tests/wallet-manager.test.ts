import { describe, it, expect, beforeEach } from 'vitest';
import { createWallet, encryptSecret, decryptSecret, createAndStoreWallet, getKeypair, getBalance } from '../src/wallet-manager';
import { createTestDb, getOrCreateUser, getWallet } from '../src/db';
import Database from 'better-sqlite3';

describe('WalletManager', () => {
  describe('createWallet', () => {
    it('generates a valid Solana keypair', () => {
      const wallet = createWallet();
      expect(wallet.publicKey).toBeTruthy();
      expect(wallet.publicKey.length).toBeGreaterThanOrEqual(32);
      expect(wallet.secretKey).toBeInstanceOf(Uint8Array);
      expect(wallet.secretKey.length).toBe(64);
    });

    it('generates unique keypairs each call', () => {
      const w1 = createWallet();
      const w2 = createWallet();
      expect(w1.publicKey).not.toBe(w2.publicKey);
    });
  });

  describe('encrypt / decrypt', () => {
    it('round-trips secret key through encryption', () => {
      const { secretKey } = createWallet();
      const encrypted = encryptSecret(secretKey);
      const decrypted = decryptSecret(encrypted);
      expect(Buffer.from(decrypted)).toEqual(Buffer.from(secretKey));
    });

    it('produces different ciphertext each time (random IV)', () => {
      const { secretKey } = createWallet();
      const e1 = encryptSecret(secretKey);
      const e2 = encryptSecret(secretKey);
      expect(e1).not.toBe(e2); // Different IVs
    });

    it('encrypted format is iv:ciphertext hex', () => {
      const { secretKey } = createWallet();
      const encrypted = encryptSecret(secretKey);
      const parts = encrypted.split(':');
      expect(parts.length).toBe(2);
      expect(parts[0].length).toBe(32); // 16 bytes IV in hex
      expect(parts[1].length).toBeGreaterThan(0);
    });
  });

  describe('createAndStoreWallet', () => {
    let db: Database.Database;

    beforeEach(() => {
      db = createTestDb();
      getOrCreateUser(db, '200', 'bob');
    });

    it('creates wallet and stores in database', () => {
      const pubkey = createAndStoreWallet(db, '200');
      expect(pubkey).toBeTruthy();
      expect(pubkey.length).toBeGreaterThanOrEqual(32);

      const stored = getWallet(db, '200');
      expect(stored).toBeTruthy();
      expect(stored!.public_key).toBe(pubkey);
      expect(stored!.encrypted_secret).toBeTruthy();
    });

    it('stored keypair can be retrieved and matches', () => {
      const pubkey = createAndStoreWallet(db, '200');
      const keypair = getKeypair(db, '200');
      expect(keypair).not.toBeNull();
      expect(keypair!.publicKey.toBase58()).toBe(pubkey);
    });
  });

  describe('getKeypair', () => {
    let db: Database.Database;

    beforeEach(() => {
      db = createTestDb();
    });

    it('returns null for non-existent wallet', () => {
      getOrCreateUser(db, '999');
      const keypair = getKeypair(db, '999');
      expect(keypair).toBeNull();
    });
  });

  describe('getBalance', () => {
    it('throws when RPC is unavailable (mocked fetch rejects)', async () => {
      const { Connection } = await import('@solana/web3.js');
      const conn = new Connection('https://api.devnet.solana.com');
      // fetch is mocked to reject in setup.ts, so this should throw
      await expect(getBalance(conn, '11111111111111111111111111111111')).rejects.toThrow();
    });
  });
});
