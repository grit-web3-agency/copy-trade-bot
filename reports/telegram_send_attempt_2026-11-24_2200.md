Telegram send attempt — 2026-11-24 22:00 (Asia/Bangkok)

Draft used: copy-trade-bot/drafts/telegram_boss_status_2026-11-24_0825.txt

Result: FAILED
Error: Telegram API returned 403 Forbidden: bot is not a member of the channel/chat (bot may be blocked, removed, or lacks permission).

Details returned by message tool:
- "Telegram send failed: bot is not a member of the chat, was blocked, or was kicked (chat_id=-1004238577735). Telegram API said: Call to 'sendMessage' failed! (403: Forbidden: bot is not a member of the channel chat). Fix: Add the bot to the channel/group, or ensure it has not been removed/blocked/kicked by the user. Input was: \"telegram:@heartbeat\"."

Next steps:
1) Add the bot to the boss chat (or ensure the chat_id is correct and bot has not been blocked).
2) If preferred, provide a one-time BOT_TOKEN and numeric chat_id and instruct: "send telegram one-time" (not recommended in chat history). 
3) Confirm and I will retry sending.

Logged by automated handler.
