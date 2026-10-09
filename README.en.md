# TeleCodex — English edition

See [the English README](README.md) and [installation guide](docs/INSTALL.en.md).

### Send queue and Group message sending

Ordinary messages and submitted groups are stored in a durable FIFO queue while their conversation is working. After completion, requests are sent in order; each waits for the preceding request to finish. Switching chats keeps the original destination, and the queue survives bot restart. Use **Send queue** or `/queue` to browse and remove waiting requests. Question answers and `/steer` remain immediate. Forwarded messages and files are collected under **Group message sending**; `/send` submits them together as one request or queued entry.

The queue holds up to 100 requests / 8 MiB of message metadata; original attachments stay on Windows. Ambiguous delivery pauses that conversation without automatic replay: check Codex before removing the uncertain entry. Windows, Codex and the connector must be available to drain the queue.
