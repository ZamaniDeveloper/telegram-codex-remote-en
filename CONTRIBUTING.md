# Contributing

This is the English edition of TeleCodex. Keep bot text, scripts, tests and
documentation in English. `npm run check` checks the edition language. Apply
shared behavior and security fixes to the [Persian edition](https://github.com/ZamaniDeveloper/telegram-codex-remote)
as well, and run each edition's tests before releasing matching versions.

Developed by **Mohsen Zamani / ZamaniDeveloper**. Read [LICENSE](LICENSE) before
using or redistributing this code. Contributions are submitted under those terms.

Use Node.js 24.17.0+ and PowerShell 7.3+ for Windows scripts. Run:

```sh
npm ci --ignore-scripts
npm run verify
```

The tests use temporary directories, fake Telegram responses and loopback HTTP
servers. They must not log into OpenAI, consume quota-reset credits, contact a real
Telegram bot or send diagnostic messages to working chats. Never load production
`.env` files in automated tests. Windows installers are syntax-checked in CI;
CI does not install tasks or claim to test the real desktop.

Keep changes focused. Add regression coverage for changed control, transport,
permission and recovery behavior. Document any version-specific desktop protocol
change and verify it against an explicitly authorized disposable chat.

Never commit `.env`, `.connector.env`, `data/`, `.deploy/`, logs, SSH keys or private
chat screenshots. Open issues and pull requests with redacted diagnostics only.
