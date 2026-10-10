# TeleCodex — English edition

See [the English README](README.md) and [installation guide](docs/INSTALL.en.md).

### Send queue and Group message sending

Ordinary messages and submitted groups are stored in a durable FIFO queue while their conversation is working. After completion, requests are sent in order; each waits for the preceding request to finish. Switching chats keeps the original destination, and the queue survives bot restart. Use **Send queue** or `/queue` to browse and remove waiting requests. Question answers and `/steer` remain immediate. Forwarded messages and files are collected under **Group message sending**; `/send` submits them together as one request or queued entry.

The queue holds up to 100 requests / 8 MiB of message metadata; original attachments stay on Windows. Ambiguous delivery pauses that conversation without automatic replay: check Codex before removing the uncertain entry. Windows, Codex and the connector must be available to drain the queue.

The main menu (`/menu`, Home and back buttons) attaches all navigation buttons directly to its message. Controls remain accessible when Telegram hides the quick-access reply keyboard. The main-menu Latest message button opens the conversation picker; the active-chat menu button stays bound to that chat.

## Accounts from Telegram (0.8.1)

Use Accounts or `/accounts` to add a ChatGPT login on your phone and manually switch the Windows account while retaining local projects. Update both components. See [account setup and recovery](docs/ACCOUNTS.en.md).

Closed Codex is reopened automatically while the Windows connector is running. Windows must remain awake, online and logged in. See [automatic desktop recovery](docs/INSTALL.en.md#automatic-desktop-recovery-082) for controls and SSH keepalives.

Live progress cards are automatically pinned silently. Updates and the final response edit the same message, so the result remains pinned after completion. Existing unrelated pins are retained. Pin failures do not stop response delivery and are retried with rate-limit-aware delays. History and final-only responses are not auto-pinned.

### Telegram Premium

Premium status is detected automatically for the paired owner. Use the **Telegram Premium** button or `/premium` to view status, refresh permission checks, or disable enhanced appearance. Premium users receive animated title emoji and inline button icons when the bot is permitted to send them. The bot uses the official forum-icon sticker catalog, with plain rendering after a rejected cosmetic request. Reply-keyboard labels, commands, question replies, live message edits and pins keep their existing behavior.

Send a direct private message with a Telegram effect to let the bot reuse that effect on short confirmation cards. Forwarded effects are ignored. Custom emoji permission depends on the bot owner's Premium status or an additional Fragment username, not solely the recipient's subscription. Premium does not raise the standard Bot API's 20 MB download limit or provide voice transcription to bots; local Whisper remains the transcription method. No paid broadcasts, Stars purchases or subscriptions are triggered.

See the official [User metadata](https://core.telegram.org/bots/api#user), [custom emoji and formatting rules](https://core.telegram.org/bots/api#formatting-options), [inline button icons](https://core.telegram.org/bots/api#inlinekeyboardbutton), [message effects](https://core.telegram.org/bots/api#sendmessage), and [file download limits](https://core.telegram.org/bots/api#getfile).

The Codex status card shows waiting request counts for the selected chat and all queues. The main menu shows the total, and queued-message receipts show both counts. Each group counts as one request; accepted, dispatching and uncertain requests are excluded. Reopen the status or main menu to see current counts.

### Graphical panel inside Telegram

An optional Mini App provides a live dashboard, searchable conversations, projects, queue controls and reported code diffs. Activate a chat, continue it, create a chat in an existing project, or guide/stop its current task. Configure an HTTPS URL and a loopback reverse proxy; see [Mini App setup and security](docs/MINIAPP.en.md). Owner-only Telegram authentication and durable mutation deduplication protect existing desktop sessions.
