// Copyright (c) 2026 Mohsen Zamani / ZamaniDeveloper. See LICENSE.
import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { card, concatRich, styled } from './format.mjs';
import { QuotaClient, validateReset } from './quota-client.mjs';

const button = (text, callback_data, style) => ({ text, callback_data, ...(style ? { style } : {}) });
const number = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
export function resetCount(data) { const n = data.rateLimitResetCredits?.availableCount; return Number.isInteger(n) && n >= 0 ? n : null; }
function date(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return 'Unknown';
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' }).format(new Date(seconds * 1000));
}
function windowLabel(minutes) {
  if (minutes === 300) return '5-hour'; if (minutes === 10080) return 'Weekly';
  if (minutes >= 1440) return `${number(minutes / 1440)} days`;
  if (minutes >= 60) return `${number(minutes / 60)} hours`;
  return Number.isFinite(minutes) ? `${number(minutes)} minutes` : 'Usage window';
}
function windowText(window) {
  if (!window) return 'Information for this window is unavailable.';
  const used = window.usedPercent;
  if (typeof used !== 'number' || !Number.isFinite(used)) return `${windowLabel(window.windowDurationMins)}: Usage unknown\nResets: ${date(window.resetsAt)}`;
  const remaining = Math.min(100, Math.max(0, 100 - used)), filled = Math.round(remaining / 10);
  return `${windowLabel(window.windowDurationMins)}\n${'▰'.repeat(filled)}${'▱'.repeat(10 - filled)}  ${number(remaining)}% remaining\nUsed: ${number(used)}% · Resets: ${date(window.resetsAt)}`;
}
export function quotaBody(data) {
  const buckets = data.rateLimitsByLimitId && Object.keys(data.rateLimitsByLimitId).length ? Object.entries(data.rateLimitsByLimitId) : data.rateLimits ? [[data.rateLimits.limitId || 'codex', data.rateLimits]] : [];
  let body = concatRich(styled('🧠 Plan: '), data.planType || data.rateLimits?.planType || 'Unknown', '\n\n');
  if (!buckets.length) body = concatRich(body, 'Usage information is unavailable.\n\n');
  for (const [id, bucket] of buckets.slice(0, 8)) {
    body = concatRich(body, styled(`📊 ${bucket.limitName || (id === 'codex' ? 'Codex' : id)}`), '\n', windowText(bucket.primary), bucket.secondary ? '\n\n' + windowText(bucket.secondary) : '', '\n\n');
    if (bucket.spendControlReached) body = concatRich(body, '⚠️ The workspace spending limit has been reached.\n\n');
    if (bucket.credits?.balance != null) body = concatRich(body, `💳 Usage credit balance: ${bucket.credits.balance}\n\n`);
  }
  const count = resetCount(data);
  body = concatRich(body, styled('♻️ Reset credits: '), count === null ? 'Information unavailable' : number(count));
  for (const credit of (data.rateLimitResetCredits?.credits || []).filter(c => c.status === 'available').slice(0, 5)) body = concatRich(body, `\n• ${credit.title || 'Reset usage'}${credit.expiresAt != null ? '\n  Expires: ' + date(credit.expiresAt) : ''}`);
  return body;
}
export class QuotaUi {
  actions = new Map(); current = null; busy = false;
  constructor(bridge, { stateFile, api } = {}) {
    this.tg = bridge.tg; this.chatId = bridge.chatId; this.stateFile = stateFile;
    this.api = api || (bridge.ipc.quotaRead ? { read: () => bridge.ipc.quotaRead(), consume: value => bridge.ipc.quotaReset(value) } : new QuotaClient());
    if (stateFile) try {
      this.current = JSON.parse(readFileSync(stateFile, 'utf8'));
      if (this.current) { validateReset(this.current.intent); this.current.status = 'uncertain'; this.save(); }
    } catch (e) { if (e.code !== 'ENOENT') throw Error('Saved reset state is invalid; inspect quota-reset.json file.'); }
  }
  save() { if (this.stateFile) { writeFileSync(this.stateFile + '.tmp', JSON.stringify(this.current), { mode: 0o600 }); renameSync(this.stateFile + '.tmp', this.stateFile); } }
  action(value) {
    const token = randomBytes(12).toString('hex'); this.actions.set(token, { ...value, expires: Date.now() + 10 * 60 * 1000 });
    if (this.actions.size > 100) this.actions.delete(this.actions.keys().next().value); return token;
  }
  resetButtons(data) {
    if (this.current || !data.accountId || !(resetCount(data) > 0)) return [];
    const credits = (data.rateLimitResetCredits?.credits || []).filter(c => c.status === 'available' && (c.expiresAt == null || c.expiresAt > Date.now() / 1000)).slice(0, 5);
    return (credits.length ? credits : [null]).map(credit => {
      const token = this.action({ kind: 'choose', expectedAccountId: data.accountId, creditId: credit?.id, title: credit?.title || 'Reset usage' });
      return [button(`♻️ ${credit?.title || 'Reset usage'}`.slice(0, 64), `r:${token}:choose`, 'primary')];
    });
  }
  async show() {
    const data = await this.api.read();
    const footer = 'Times are in UTC; usage is shared across other apps using the same account.';
    const rows = this.resetButtons(data);
    if (this.current) rows.push([button('🔎 Check previous reset result', `r:${this.action({ kind: 'retry', intent: this.current.intent })}:retry`, 'primary')]);
    rows.push([button('🔄 Refresh', 'u:usage'), button('🏠 Main menu', 'u:home')]);
    const body = concatRich(quotaBody(data), this.current ? '\n\n⚠️ The previous reset result is still uncertain. Checking retries the same request with the same ID.' : '');
    return this.tg.send(this.chatId, card('📈 Codex account usage', body, footer), { inline_keyboard: rows });
  }
  async callback(data) {
    const [, token, command] = data.split(':'); const a = this.actions.get(token);
    if (!a || a.expires < Date.now()) throw Error('This usage button has expired; reopen the usage page.');
    if (command === 'cancel' && a.kind === 'confirm') {
      this.actions.delete(token); return this.tg.send(this.chatId, card('Reset cancelled', 'No credit was consumed.'), { inline_keyboard: [[button('📈 Usage', 'u:usage')]] });
    }
    if (command === 'choose' && a.kind === 'choose') {
      if (this.current || this.busy) throw Error('Check the previous reset result first.');
      const fresh = await this.api.read();
      if (fresh.accountId !== a.expectedAccountId) throw Error('Codex Account has changed; reopen the usage page.');
      if (!(resetCount(fresh) > 0)) throw Error('No reset credit is available. Refresh the usage page.');
      if (a.creditId && !(fresh.rateLimitResetCredits?.credits || []).some(c => c.id === a.creditId && c.status === 'available' && (c.expiresAt == null || c.expiresAt > Date.now() / 1000))) throw Error('This credit is no longer available; refresh the usage page.');
      const intent = { expectedAccountId: a.expectedAccountId, idempotencyKey: randomUUID(), ...(a.creditId ? { creditId: a.creditId } : {}) };
      const confirm = this.action({ kind: 'confirm', intent }); this.actions.delete(token);
      return this.tg.send(this.chatId, card('♻️ Confirm usage reset', concatRich(styled(a.title), '\n\nConfirming consumes one reset credit from the current account. The reset scope depends on that credit and your account\'s eligibility.'), 'To consume the credit, press Confirm and reset.'),
        { inline_keyboard: [[button('✅ Confirm and reset', `r:${confirm}:confirm`, 'success')], [button('Cancel', `r:${confirm}:cancel`)]] });
    }
    if (command === 'confirm' && a.kind === 'confirm') {
      if (this.current || this.busy) throw Error('Another reset request is being checked.');
      this.actions.clear(); this.current = { intent: a.intent, status: 'sending' }; this.save();
      return this.dispatch();
    }
    if (command === 'retry' && a.kind === 'retry' && this.current?.intent.idempotencyKey === a.intent.idempotencyKey) {
      this.actions.delete(token); return this.dispatch();
    }
    throw Error('This reset button is no longer active.');
  }
  async dispatch() {
    if (this.busy || !this.current) throw Error('The reset request is being checked.'); this.busy = true;
    const wasUncertain = this.current.status === 'uncertain';
    let result;
    try {
      this.current.status = 'sending'; this.save();
      result = await this.api.consume(this.current.intent);
      if (!['reset', 'alreadyRedeemed', 'nothingToReset', 'noCredit', 'accountChanged'].includes(result?.outcome)) throw Error('unknown outcome');
    } catch {
      this.current.status = 'uncertain'; this.save(); this.busy = false;
      return this.tg.send(this.chatId, card('⚠️ Reset result uncertain', 'The request may have completed. Checking uses the same request ID; it does not create a new reset request.'),
        { inline_keyboard: [[button('🔎 Check the same request', `r:${this.action({ kind: 'retry', intent: this.current.intent })}:retry`, 'primary')], [button('📈 Usage', 'u:usage')]] });
    }
    if (result.outcome === 'accountChanged' && wasUncertain) {
      this.current.status = 'uncertain'; this.save(); this.busy = false;
      return this.tg.send(this.chatId, card('Codex Account has changed', 'No reset was performed on the new account. The previous outcome is still uncertain; return to the original account to check the same request.'), { inline_keyboard: [[button('📈 Usage', 'u:usage')]] });
    }
    this.current = null; this.save(); this.busy = false;
    const messages = { reset: ['✅ Usage reset', 'One reset credit was consumed.'], alreadyRedeemed: ['✅ Reset already completed', 'The same request was confirmed; no additional credit was consumed.'], nothingToReset: ['ℹ️ No eligible window to reset', 'The service found no eligible window for this reset.'], noCredit: ['ℹ️ No reset credit is available', 'The service found no usable credit.'], accountChanged: ['Codex Account has changed', 'Reset was not performed. Check the current account\'s usage again.'] };
    await this.tg.send(this.chatId, card(...messages[result.outcome]), { inline_keyboard: [[button('📈 Updated usage', 'u:usage')]] });
    try { await this.show(); } catch { await this.tg.send(this.chatId, 'The operation finished, but fresh usage could not be read; press Usage again.'); }
  }
}
