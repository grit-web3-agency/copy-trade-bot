import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestDb,
  getOrCreateUser,
  addWatchedWhale,
  getWatchedWhales,
  removeWatchedWhale,
  removeAllWatchedWhales,
  getAllWatchedAddresses,
} from '../src/db';
import Database from 'better-sqlite3';

const WHALE_A = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const WHALE_B = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';
const WHALE_C = 'FRhB8L7Y9Qq41qZXYLtC2nw8An1RJfLLxRF2ZdkNEay5';

describe('Unwatch functionality', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    getOrCreateUser(db, '100', 'testuser');
  });

  it('removes a specific watched whale', () => {
    addWatchedWhale(db, '100', WHALE_A);
    addWatchedWhale(db, '100', WHALE_B);

    const removed = removeWatchedWhale(db, '100', WHALE_A);
    expect(removed).toBe(true);

    const whales = getWatchedWhales(db, '100');
    expect(whales).toHaveLength(1);
    expect(whales[0].whale_address).toBe(WHALE_B);
  });

  it('returns false when whale not found', () => {
    const removed = removeWatchedWhale(db, '100', WHALE_A);
    expect(removed).toBe(false);
  });

  it('removes all watched whales', () => {
    addWatchedWhale(db, '100', WHALE_A);
    addWatchedWhale(db, '100', WHALE_B);
    addWatchedWhale(db, '100', WHALE_C);

    const count = removeAllWatchedWhales(db, '100');
    expect(count).toBe(3);

    const whales = getWatchedWhales(db, '100');
    expect(whales).toHaveLength(0);
  });

  it('returns 0 when no whales to remove', () => {
    const count = removeAllWatchedWhales(db, '100');
    expect(count).toBe(0);
  });

  it('does not affect other users watch list', () => {
    getOrCreateUser(db, '200', 'otheruser');
    addWatchedWhale(db, '100', WHALE_A);
    addWatchedWhale(db, '200', WHALE_A);

    removeWatchedWhale(db, '100', WHALE_A);

    const user100 = getWatchedWhales(db, '100');
    const user200 = getWatchedWhales(db, '200');
    expect(user100).toHaveLength(0);
    expect(user200).toHaveLength(1);
  });

  it('unwatched whale removed from global addresses only if no other user watches', () => {
    getOrCreateUser(db, '200', 'otheruser');
    addWatchedWhale(db, '100', WHALE_A);
    addWatchedWhale(db, '200', WHALE_A);
    addWatchedWhale(db, '100', WHALE_B);

    removeWatchedWhale(db, '100', WHALE_A);

    const allAddrs = getAllWatchedAddresses(db);
    // WHALE_A still watched by user 200
    expect(allAddrs).toContain(WHALE_A);
    expect(allAddrs).toContain(WHALE_B);
  });

  it('unwatched whale fully removed from global when no one watches', () => {
    addWatchedWhale(db, '100', WHALE_A);
    addWatchedWhale(db, '100', WHALE_B);

    removeWatchedWhale(db, '100', WHALE_A);

    const allAddrs = getAllWatchedAddresses(db);
    expect(allAddrs).not.toContain(WHALE_A);
    expect(allAddrs).toContain(WHALE_B);
  });
});
