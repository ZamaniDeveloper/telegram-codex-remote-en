// Copyright (c) 2026 Mohsen Zamani / ZamaniDeveloper. See LICENSE.
import { card, concatRich, styled } from './format.mjs';
import { isForwarded, messageFile } from './inbox.mjs';
import { lastTurn, turnId } from './state.mjs';
import path from 'node:path';
import { QuotaUi } from './quota-ui.mjs';
import { Features, featureRows } from './features.mjs';
import { text as T } from './feature-text.mjs';

export const UI_REVISION = 7;
export const UI_EDITION = 'en';
export const LABELS = {
  chats: '💬 Chats', search: '🔎 Search', status: '📊 Status', history: '🗂 Recent replies',
  bundle: '📦 Group message sending', questions: '❓ Questions for Codex', home: '🏠 Main menu', help: 'ℹ️ Help',
  usage: '📈 Usage', queue: '⏳ Send queue',
};
export function button(text, callback_data, style) { return { text, callback_data, ...(style ? { style } : {}) }; }
export function mainKeyboard() {
  return { keyboard: [[LABELS.chats, LABELS.search], ...featureRows(), [LABELS.status, LABELS.history], [LABELS.bundle, LABELS.questions], [LABELS.usage, LABELS.help], [LABELS.queue], [LABELS.home]].map(row => row.map(text => ({ text }))),
    resize_keyboard: true, is_persistent: true, input_field_placeholder: 'Write a message or use the buttons' };
}
export function navKeyboard() { return { inline_keyboard: [[button('💬 Chats', 'u:chats', 'primary'), button('🏠 Main menu', 'u:home')]] }; }
export function chatKeyboard(threadId) {
  return { inline_keyboard: [
    [button('📊 Status', 'u:status'), button('🗂 Recent replies', 'u:history')],
    [button(T.last, threadId ? `u:last:${threadId}` : 'u:last'), button(LABELS.queue, 'u:queue')],
    [button(LABELS.bundle, 'u:bundle'), button('❓ Questions', 'u:questions', 'primary')],
    [button('📈 Usage and reset credits', 'u:usage', 'primary')],
    [button('✍️ Guide task', 'u:steer'), button('⏹ Stop', 'u:stop', 'danger')],
    [button('💬 Change chat', 'u:chats'), button('🏠 Main menu', 'u:home')],
  ] };
}
export class BotUi {
  input = null; replies = new Map();
  constructor(bridge, inbox) { this.bridge = bridge; this.inbox = inbox; this.tg = bridge.tg; this.chatId = bridge.chatId; this.quota = new QuotaUi(bridge, { stateFile: path.join(inbox.root, 'quota-reset.json') }); this.features = new Features(this); this.bridge.latestButton = row => button('🕘', this.features.action({ kind: 'last', row, offset: 0 })); }
  cancelInput() { if (this.input) this.input.used = true; this.input = null; }
  async home(updated = false) {
    this.cancelInput(); this.features.cancelInput(); const w = this.bridge.selected;
    const body = concatRich(updated ? 'The updated interface is ready ✨\n\n' : '',
      styled('💬 Active chat: '), w?.title || 'Not selected yet', '\n',
      styled('🔗 Connection: '), w?.synced ? 'Connected to Codex' : 'Select a chat using the «Chats» button', '\n',
      styled('📦 Group message sending: '), this.inbox.current ? `${this.inbox.current.items.length} messages ready` : 'No bundle is open',
      '\n\nSend messages and attachments; replies and questions from Codex appear here.');
    return this.tg.send(this.chatId, card('🤖 TeleCodex', body, 'Use the buttons below.'), mainKeyboard());
  }
  async help() {
    return this.tg.send(this.chatId, card('✨ Bot guide', concatRich(
      styled('1. Select chat\n'), 'Press «Chats» and select an existing chat.\n\n',
      styled('2. Send messages and files\n'), 'Ordinary messages go to the active chat. While it is working they wait in a durable FIFO queue and are sent after completion. Use Send queue to view or remove waiting requests. Forwarded messages, images and files are collected under Group message sending; send them together with the Send button.\n\n',
      styled('3. Task controls\n'), 'Stop and Guide task buttons appear below the live reply.\n\n',
      styled('4. Answer question\n'), 'Choose an option or Reply to the question and write your answer. Free-text answers are accepted without a command.\n\n',
      styled('5. Usage and resets\n'), 'Press Usage to see consumption and reset times. A reset button appears when credits are available; consuming a credit requires your confirmation.\n\n',
      'Per file: Up to 20 MB · Per bundle: 100 messages\nYour computer and Codex must be running.'
    ), 'Developed by Mohsen Zamani · ZamaniDeveloper'), navKeyboard());
  }
  async bundle() {
    if (this.inbox.current) return this.inbox.notice(true);
    return this.tg.send(this.chatId, card(LABELS.bundle, 'Send several texts, images and files as a single request.\n\nForwarded messages are collected automatically. To collect multiple direct messages, press New bundle.'),
      { inline_keyboard: [[button('➕ New bundle', 'u:batch', 'primary')], [button('🏠 Main menu', 'u:home')]] });
  }
  async prompt(kind, context = {}) {
    const descriptions = {
      search: ['🔎 Search chats', 'Enter a chat title or project path.', 'Chat title or project path'],
      steer: ['✍️ Guide task', 'Write your guidance; it will go to the same active task.', 'Write guidance'],
      instruction: ['🚀 Send bundle with instructions', 'Tell Codex what to do with this bundle\'s messages and attachments.', 'Write your instructions'],
    };
    const [title, body, placeholder] = descriptions[kind];
    const sent = await this.tg.send(this.chatId, card(title, body), { force_reply: true, input_field_placeholder: placeholder });
    this.input = { kind, ...context, messageId: sent.message_id, expires: Date.now() + 15 * 60 * 1000 };
    this.replies.set(sent.message_id, this.input); if (this.replies.size > 100) this.replies.delete(this.replies.keys().next().value);
  }
  async route(route) {
    this.cancelInput(); this.features.cancelInput();
    if (route === 'home' || route === 'start') return this.home();
    if (route === 'help') return this.help();
    if (route === 'usage') return this.quota.show();
    if (route === 'queue') {
      if (!this.bridge.outbox) throw Error('Send queue is unavailable.');
      return this.bridge.outbox.show(this.bridge);
    }
    if (route === 'chats') return this.bridge.chats();
    if (route === 'last') return this.features.showLast(this.bridge.selected || this.bridge.requireSelected());
    if (route === 'search') return this.prompt('search');
    if (route === 'status' || route === 'history' || route === 'stop') return this.bridge.text('/' + route);
    if (route === 'questions') return this.bridge.questions.show();
    if (route === 'bundle') return this.bundle();
    if (route === 'batch') { this.inbox.begin(); this.inbox.dirty = true; return this.inbox.notice(true); }
    if (route === 'instruction') {
      if (!this.inbox.current?.items.length) throw Error('This bundle is empty; send messages and attachments first.');
      return this.prompt('instruction', { batchId: this.inbox.current.id });
    }
    if (route === 'steer') {
      const w = this.bridge.requireSelected(); const turn = lastTurn(w.state);
      if (turn?.status !== 'inProgress') throw Error('This chat has no active task; send an ordinary message.');
      return this.prompt('steer', { threadId: w.id, turnId: turnId(turn) });
    }
    throw Error('Invalid button; open the main menu.');
  }
  async callback(data) {
    const last = /^u:last:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(data);
    if (last) {
      this.cancelInput(); this.features.cancelInput();
      return this.features.showLast(this.bridge.watched.get(last[1]) || { id: last[1] });
    }
    const route = data.slice(2);
    if (!['home', 'help', 'chats', 'last', 'queue', 'search', 'status', 'history', 'stop', 'questions', 'bundle', 'batch', 'instruction', 'steer', 'usage'].includes(route)) throw Error('Invalid button.');
    return this.route(route);
  }
  async consumePrompt(input, text) {
    if (input.expires < Date.now() || input.used) throw Error('This input is no longer active; press the corresponding button again.');
    if (!text.trim()) throw Error('Write a text answer.');
    input.used = true; if (this.input === input) this.input = null;
    if (input.kind === 'search') return this.bridge.chats(text.trim());
    if (input.kind === 'steer') return this.bridge.steer(text, input.threadId, input.turnId);
    if (this.inbox.current?.id !== input.batchId) throw Error('This bundle changed or was already sent.');
    return this.inbox.send(text);
  }
  async message(message) {
    if (!isForwarded(message) && !messageFile(message) && message.text) {
      const route = Object.keys(LABELS).find(key => LABELS[key] === message.text.trim());
      if (route) return this.route(route);
      if (['📦 Message bundles', '📦 Message bundle'].includes(message.text.trim())) return this.route('bundle');
      if (/^\/queue(?:@\w+)?\s*$/.test(message.text.trim())) return this.route('queue');
      if (/^\/(usage|quota)(?:@\w+)?\s*$/.test(message.text.trim())) return this.route('usage');
      if (/^\/(start|menu|home|help)(?:@\w+)?\s*$/.test(message.text.trim())) return this.route(message.text.trim().startsWith('/help') ? 'help' : 'home');
      if (await this.features.message(message)) return;
      const steer = /^\/steer(?:@\w+)?(?:\s+([\s\S]*))?$/.exec(message.text.trim());
      if (steer) {
        if (!steer[1]?.trim()) return this.route('steer');
        this.input = null;
        return this.bridge.text('/steer ' + steer[1]);
      }
      const replyId = message.reply_to_message?.message_id;
      if (replyId && this.replies.has(replyId)) return this.consumePrompt(this.replies.get(replyId), message.text);
      if (replyId && await this.bridge.questions.reply(message.text, replyId)) return;
      if (replyId && /^(❓ Codex question|✍️ Free-text answer)/.test(message.reply_to_message.text || '')) throw Error('This question belongs to an earlier bot session; press Questions for Codex and answer the current question.');
      if (!/^\/\w+/.test(message.text.trim())) {
        if (this.input && this.input.expires >= Date.now()) return this.consumePrompt(this.input, message.text);
        if (await this.bridge.questions.reply(message.text)) return;
      }
    }
    return this.inbox.message(message);
  }
}
