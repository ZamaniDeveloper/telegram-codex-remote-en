// Copyright (c) 2026 Mohsen Zamani / ZamaniDeveloper. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LABELS, mainKeyboard, UI_EDITION } from '../src/ui.mjs';
import { QuotaUi, quotaBody } from '../src/quota-ui.mjs';
test('English edition exposes English buttons and input hints', () => {
  assert.equal(UI_EDITION, 'en');
  assert.equal(LABELS.chats, '💬 Chats');
  assert.equal(LABELS.usage, '📈 Usage');
  assert.equal(mainKeyboard().input_field_placeholder, 'Write a message or use the buttons');
});
test('English usage uses Latin percentages, a UTC date and a matching timezone notice', async () => {
  const data = { planType: 'plus', rateLimits: { primary: {
    usedPercent: 76, windowDurationMins: 300, resetsAt: Date.UTC(2026, 9, 8, 22) / 1000,
  } }, rateLimitResetCredits: null };
  const body = quotaBody(data).text;
  assert.match(body, /24% remaining/);
  // Tehran has already crossed midnight at this instant; UTC is still October 8.
  assert.match(body, /10\/8\/26, 10:00 PM/);
  let sent;
  const ui = new QuotaUi({ chatId: 1, tg: { async send(_chat, card) { sent = card.text; } } }, { api: { async read() { return data; } } });
  await ui.show(); assert.match(sent, /Times are in UTC/);
});
