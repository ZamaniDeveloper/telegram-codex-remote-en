// Copyright (c) 2026 Mohsen Zamani / ZamaniDeveloper. See LICENSE.
import { card, concatRich, styled } from './format.mjs';
import { isForwarded, messageFile } from './inbox.mjs';
import { lastTurn, turnId } from './state.mjs';
import path from 'node:path';
import { QuotaUi } from './quota-ui.mjs';
import { Features, featureRows } from './features.mjs';

export const UI_REVISION = 5;
export const UI_EDITION = 'en';
export const LABELS = {
  chats: '💬 Chats', search: '🔎 Search', status: '📊 Status', history: '🗂 Recent replies',
  bundle: '📦 Message bundles', questions: '❓ Questions for Codex', home: '🏠 Main menu', help: 'ℹ️ Help',
  usage: '📈 Usage',
};
export function button(text, callback_data, style) { return { text, callback_data, ...(style ? { style } : {}) }; }
export function mainKeyboard() {
  return { keyboard: [[LABELS.chats, LABELS.search], ...featureRows(), [LABELS.status, LABELS.history], [LABELS.bundle, LABELS.questions], [LABELS.usage, LABELS.help], [LABELS.home]].map(row => row.map(text => ({ text }))),
    resize_keyboard: true, is_persistent: true, input_field_placeholder: 'Write a message or use the buttons' };
}
export function navKeyboard() { return { inline_keyboard: [[button('💬 Chats', 'u:chats', 'primary'), button('🏠 Main menu', 'u:home')]] }; }
export function chatKeyboard() {
  return { inline_keyboard: [
    [button('📊 Status', 'u:status'), button('🗂 Recent replies', 'u:history')],
    [button('📦 Message bundles', 'u:bundle'), button('❓ Questions', 'u:questions', 'primary')],
    [button('📈 Usage and reset credits', 'u:usage', 'primary')],
    [button('✍️ Guide task', 'u:steer'), button('⏹ Stop', 'u:stop', 'danger')],
    [button('💬 Change chat', 'u:chats'), button('🏠 Main menu', 'u:home')],
  ] };
}
export class BotUi {
  input = null; replies = new Map();
  constructor(bridge, inbox) { this.bridge = bridge; this.inbox = inbox; this.tg = bridge.tg; this.chatId = bridge.chatId; this.quota = new QuotaUi(bridge, { stateFile: path.join(inbox.root, 'quota-reset.json') }); this.features = new Features(this); }
  async home(updated = false) {
    this.input = null; this.features.input = null; const w = this.bridge.selected;
    const body = concatRich(updated ? 'The updated interface is ready ✨\n\n' : '',
      styled('💬 Active chat: '), w?.title || 'Not selected yet', '\n',
      styled('🔗 Connection: '), w?.synced ? 'Connected to Codex' : 'Select a chat using the «Chats» button', '\n',
      styled('📦 Bundle: '), this.inbox.current ? `${this.inbox.current.items.length} messages ready` : 'No bundle is open',
      '\n\nSend messages and attachments; replies and questions from Codex appear here.');
    return this.tg.send(this.chatId, card('🤖 TeleCodex', body, 'Use the buttons below.'), mainKeyboard());
  }
  async help() {
    return this.tg.send(this.chatId, card('✨ Bot guide', concatRich(
      styled('1. Select chat\n'), 'Press «Chats» and select an existing chat.\n\n',
      styled('2. Send messages and files\n'), 'Ordinary messages are sent directly. Forwarded messages, images and files are collected in a bundle; press Send bundle to send everything together.\n\n',
      styled('3. Task controls\n'), 'Stop and Guide task buttons appear below the live reply.\n\n',
      styled('4. Answer question\n'), 'Choose an option or Reply to the question and write your answer. Free-text answers are accepted without a command.\n\n',
      styled('5. Usage and resets\n'), 'Press Usage to see consumption and reset times. A reset button appears when credits are available; consuming a credit requires your confirmation.\n\n',
      'Per file: Up to 20 MB · Per bundle: 100 messages\nYour computer and Codex must be running.'
    ), 'Developed by Mohsen Zamani · ZamaniDeveloper'), navKeyboard());
  }
  async bundle() {
    if (this.inbox.current) return this.inbox.notice(true);
    return this.tg.send(this.chatId, card('📦 Message bundles', 'Send several texts, images and files as a single request.\n\nForwarded messages are collected automatically. To collect multiple direct messages, press New bundle.'),
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
    this.input = null; this.features.input = null;
    if (route === 'home' || route === 'start') return this.home();
    if (route === 'help') return this.help();
    if (route === 'usage') return this.quota.show();
    if (route === 'chats') return this.bridge.chats();
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
    const route = data.slice(2);
    if (!['home', 'help', 'chats', 'search', 'status', 'history', 'stop', 'questions', 'bundle', 'batch', 'instruction', 'steer', 'usage'].includes(route)) throw Error('Invalid button.');
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
      if (await this.features.message(message)) return;
      const route = Object.keys(LABELS).find(key => LABELS[key] === message.text.trim());
      if (route) return this.route(route);
      if (/^\/(usage|quota)(?:@\w+)?\s*$/.test(message.text.trim())) return this.route('usage');
      if (/^\/(start|menu|help)(?:@\w+)?\s*$/.test(message.text.trim())) return this.route(message.text.startsWith('/help') ? 'help' : 'home');
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
