import { ensureDb, addFollower, getFollower, updateFollower } from '../db';
import * as fs from 'fs';
import * as path from 'path';

describe('db', () => {
  const chatId = 'test-chat-1';
  const dbDir = path.resolve(process.cwd(), 'data');

  beforeAll(async () => {
    // clean
    if (fs.existsSync(dbDir)) fs.rmSync(dbDir, { recursive: true, force: true });
    await ensureDb();
  });

  it('adds and reads a follower record', async () => {
    await addFollower(chatId, { chatId, walletPath: './followers/test.json', copyEnabled: false, watched: [] });
    const f = await getFollower(chatId);
    expect(f).not.toBeNull();
    expect(f!.walletPath).toBe('./followers/test.json');
  });

  it('updates a follower record', async () => {
    const f = await getFollower(chatId);
    f!.watched.push('SomeAddr');
    await updateFollower(chatId, f!);
    const f2 = await getFollower(chatId);
    expect(f2!.watched).toContain('SomeAddr');
  });
});

