# TeleCodex — English edition

See [the English README](README.md) and [installation guide](docs/INSTALL.en.md).

### Send queue and Group message sending

Ordinary messages and submitted groups are stored in a durable FIFO queue while their conversation is working. After completion, requests are sent in order; each waits for the preceding request to finish. Switching chats keeps the original destination, and the queue survives bot restart. Use **Send queue** or `/queue` to browse and remove waiting requests. Question answers and `/steer` remain immediate. Forwarded messages and files are collected under **Group message sending**; `/send` submits them together as one request or queued entry.

The queue holds up to 100 requests / 8 MiB of message metadata; original attachments stay on Windows. Ambiguous delivery pauses that conversation without automatic replay: check Codex before removing the uncertain entry. Windows, Codex and the connector must be available to drain the queue.

The main menu (`/menu`, Home and back buttons) attaches all navigation buttons directly to its message. Controls remain accessible when Telegram hides the quick-access reply keyboard. The main-menu Latest message button opens the conversation picker; the active-chat menu button stays bound to that chat.

## Accounts from Telegram (0.8.1)

Use Accounts or `/accounts` to add a ChatGPT login on your phone and manually switch the Windows account while retaining local projects. Update both components. See [account setup and recovery](docs/ACCOUNTS.en.md).

Closed Codex is reopened automatically while the Windows connector is running. Windows must remain awake, online and logged in. See [automatic desktop recovery](docs/INSTALL.en.md#automatic-desktop-recovery-082) for controls and SSH keepalives.
