import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestDb,
  getOrCreateUser,
  addWatchedWhale,
  getWatchedWhales,
  getAllWatchedAddresses,
  getUsersWatchingWhale,
  setCopyEnabled,
} from '../src/db';
import Database from 'better-sqlite3';

const WHALE_1 = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const WHALE_2 = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';

describe('/watch command DB operations', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('creates a user and adds a watched whale', () => {
    getOrCreateUser(db, '100', 'alice');
    const whale = addWatchedWhale(db, '100', WHALE_1, 'Big Whale');

    expect(whale.whale_address).toBe(WHALE_1);
    expect(whale.label).toBe('Big Whale');
    expect(whale.active).toBe(1);
  });

  it('returns watched whales for a user', () => {
    getOrCreateUser(db, '100', 'alice');
    addWatchedWhale(db, '100', WHALE_1);
    addWatchedWhale(db, '100', WHALE_2);

    const whales = getWatchedWhales(db, '100');
    expect(whales.length).toBe(2);
    expect(whales.map(w => w.whale_address)).toContain(WHALE_1);
    expect(whales.map(w => w.whale_address)).toContain(WHALE_2);
  });

  it('does not duplicate whale entries', () => {
    getOrCreateUser(db, '100', 'alice');
    addWatchedWhale(db, '100', WHALE_1);
    addWatchedWhale(db, '100', WHALE_1); // duplicate

    const whales = getWatchedWhales(db, '100');
    expect(whales.length).toBe(1);
  });

  it('returns all distinct watched addresses', () => {
    getOrCreateUser(db, '100', 'alice');
    getOrCreateUser(db, '200', 'bob');
    addWatchedWhale(db, '100', WHALE_1);
    addWatchedWhale(db, '200', WHALE_1); // same whale, different user
    addWatchedWhale(db, '200', WHALE_2);

    const addresses = getAllWatchedAddresses(db);
    expect(addresses.length).toBe(2);
  });

  it('finds users watching a specific whale with copy enabled', () => {
    getOrCreateUser(db, '100', 'alice');
    getOrCreateUser(db, '200', 'bob');
    addWatchedWhale(db, '100', WHALE_1);
    addWatchedWhale(db, '200', WHALE_1);
    setCopyEnabled(db, '100', true);
    // bob has copy_enabled = false (default)

    const users = getUsersWatchingWhale(db, WHALE_1);
    expect(users.length).toBe(1);
    expect(users[0].telegram_id).toBe('100');
  });
});

describe('/copy on|off DB operations', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('toggles copy enabled on', () => {
    getOrCreateUser(db, '100', 'alice');
    setCopyEnabled(db, '100', true);
    const user = getOrCreateUser(db, '100');
    expect(user.copy_enabled).toBe(1);
  });

  it('toggles copy enabled off', () => {
    getOrCreateUser(db, '100', 'alice');
    setCopyEnabled(db, '100', true);
    setCopyEnabled(db, '100', false);
    const user = getOrCreateUser(db, '100');
    expect(user.copy_enabled).toBe(0);
  });
});
