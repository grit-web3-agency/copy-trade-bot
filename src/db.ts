import * as fs from 'fs';
import * as path from 'path';

export interface FollowerRecord {
  chatId: string;
  walletPath: string;
  copyEnabled: boolean;
  watched: string[];
}

const DB_PATH = path.resolve(process.cwd(), 'data', 'db.json');

export async function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({ followers: {} }, null, 2));
}

function readDb(): any {
  if (!fs.existsSync(DB_PATH)) return { followers: {} };
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function writeDb(db: any) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

export async function addFollower(chatId: string, rec: FollowerRecord) {
  await ensureDb();
  const db = readDb();
  db.followers[chatId] = rec;
  writeDb(db);
}

export async function getFollower(chatId: string): Promise<FollowerRecord | null> {
  await ensureDb();
  const db = readDb();
  return db.followers[chatId] ?? null;
}

export async function updateFollower(chatId: string, rec: FollowerRecord) {
  await ensureDb();
  const db = readDb();
  db.followers[chatId] = rec;
  writeDb(db);
}

