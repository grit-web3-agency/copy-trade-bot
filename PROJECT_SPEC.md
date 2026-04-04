# PROJECT SPEC — Copy-Trade Bot MVP (Solana)

**⚠️ ทุก Agent ต้องอ่านไฟล์นี้ก่อนเริ่มงาน — ห้ามทำอะไรที่ไม่ได้ระบุในนี้**

---

## 1. Overview

| Field | Value |
|-------|-------|
| ชื่อโปรเจค | Copy-Trade Bot MVP |
| ประเภท | **internal** — โปรเจคภายในทดสอบระบบ |
| ลูกค้า | ไม่มี (ของเราเอง) |
| Owner | Jack (Manager) |
| Dev | Claude |
| Research | Kimi |
| Deadline | 1 สัปดาห์ |
| Budget | ฿0 (ใช้ free tier ทั้งหมด) |
| เป้าหมาย | ทดสอบ workflow ทีม + ได้ product ขายจริง |

---

## 2. Requirements

### ต้องทำ (Must Have)
- [ ] Telegram bot ที่ user interact ได้ (/start, /watch, /copy, /balance)
- [ ] Monitor whale wallet address บน Solana (websocket)
- [ ] เมื่อ whale ซื้อ token → bot ซื้อตามอัตโนมัติ (ผ่าน Jupiter API)
- [ ] เมื่อ whale ขาย → bot ขายตาม
- [ ] User สร้าง wallet ใน bot ได้
- [ ] ตั้ง max trade size + slippage ได้
- [ ] Unit tests ผ่าน
- [ ] Demo dry-run ทำงานได้

### ถ้ามีเวลา (Nice to Have)
- [ ] Real devnet trading
- [ ] PnL tracking
- [ ] Multi-whale support
- [ ] Payment module (ค่าสมาชิก)

### ห้ามทำ (Out of Scope)
- ❌ Frontend web (ใช้ Telegram bot เท่านั้น)
- ❌ Mobile app
- ❌ EVM chain support (Solana เท่านั้นตอนนี้)
- ❌ Real money trading (devnet เท่านั้นตอน MVP)

---

## 3. Tech Stack

| Component | Technology | หมายเหตุ |
|-----------|-----------|---------|
| Language | TypeScript / Node.js | |
| Bot | grammy (Telegram Bot API) | |
| Blockchain | @solana/web3.js | Solana |
| DEX | Jupiter Aggregator API | swap tokens |
| RPC | Helius (free tier 100K req/day) | websocket + HTTP |
| Database | SQLite | users, wallets, trades |
| Testing | vitest | |
| Deploy | PM2 บน VPS (อนาคต) | ตอนนี้รัน local |

---

## 4. Repository

| Field | Value |
|-------|-------|
| GitHub Repo | **grit-web3-agency/copy-trade-bot** |
| Branch strategy | main (stable) / dev (development) |
| **ห้าม PR ไปที่ repo อื่น** | ✅ repo ของเราเท่านั้น |

---

## 5. Architecture

```
User (Telegram)
  → grammy Bot (commands: /start /watch /copy /balance)
    → Wallet Manager (create/encrypt/store keypairs)
    → Whale Listener (Helius websocket → parse txs)
    → Copy Policy (filter: token match, size limit, slippage)
    → Trade Executor (Jupiter swap API → sign + submit)
    → SQLite DB (users, wallets, trades, settings)
```

---

## 6. Sprint Plan

### Sprint 1: Scaffold + Listener (วันที่ 1-2)
- [ ] Project scaffold (package.json, tsconfig, folder structure)
- [ ] Telegram bot basic (/start, /help)
- [ ] Whale listener (websocket connect + parse transactions)
- [ ] Unit tests for listener
- [ ] README.md

### Sprint 2: Wallet + Executor (วันที่ 3-4)
- [ ] Wallet create/encrypt/store
- [ ] /balance command
- [ ] Jupiter swap integration (dry-run)
- [ ] Trade executor (sign + submit skeleton)
- [ ] Unit tests

### Sprint 3: Copy Logic + Demo (วันที่ 5-6)
- [ ] Copy policy (when whale buys → bot buys)
- [ ] /watch [address] command
- [ ] /copy on/off command
- [ ] E2E demo (devnet dry-run)
- [ ] PROOFS.md with demo evidence

### Sprint 4: Polish + Deploy (วันที่ 7)
<<<<<<< HEAD
- [x] Error handling
- [x] /settings command (max size, slippage)
- [x] Documentation
- [x] Deploy instructions (PM2)
=======
- [ ] Error handling
- [ ] /settings command (max size, slippage)
- [ ] Documentation
- [ ] Deploy instructions (PM2)
>>>>>>> ed57db3 (Sprint 4: settings, retry, error handling, docs, and tests)

---

## 7. Testing

| ประเภท | เครื่องมือ | เกณฑ์ผ่าน |
|--------|----------|----------|
| Unit test | vitest | ทุก module ต้องมี test |
| E2E test | devnet dry-run | demo flow ทำงานได้ |
| Manual test | Telegram | /start → /watch → /copy → เห็น trade |

---

## 8. Deployment

| ขั้นตอน | วิธี |
|---------|------|
| Build | `npm run build` (tsc) |
| Run local | `npm run dev` |
| Deploy | PM2 บน VPS (Bitlaunch USDT) — อนาคต |
| Monitor | PM2 logs + Telegram alerts |

---

## 9. Delivery

| Field | Value |
|-------|-------|
| ส่งงานที่ | **grit-web3-agency/copy-trade-bot** GitHub repo |
| ใครตรวจ | Claude cross-review + บอสตรวจ |
| **ห้าม PR ไปที่ repo ที่ไม่ใช่ grit-web3-agency/** | ✅ |

---

## 10. กฎสำคัญ

- ✅ ทำตาม spec นี้เท่านั้น
- ✅ อัปเดต Discord #kanban-board ทุก task
- ✅ อัปเดต Dashboard Job #21 ทุกการเปลี่ยนสถานะ
- ✅ Push code ไปที่ grit-web3-agency/copy-trade-bot เท่านั้น
- ❌ ห้ามส่ง PR ไปที่ repo คนอื่น
- ❌ ห้ามเพิ่ม feature นอก scope
- ❌ ห้ามใช้ real money (devnet เท่านั้น)
