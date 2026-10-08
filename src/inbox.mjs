// Copyright (c) 2026 Mohsen Zamani / ZamaniDeveloper. See LICENSE.
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AttachmentStore, MAX_FILE_BYTES, safeFilename, imageExtension } from './attachments.mjs';

import { card, concatRich, styled } from './format.mjs';
import { Transcriber } from './transcription.mjs';

const MAX_ITEMS = 100, MAX_BYTES = 100 * 1024 * 1024, MAX_TEXT = 100000;
export function messageFile(message) {
  if (message.photo?.length) {
    const photo = [...message.photo].sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
    return { ...photo, file_name: `photo-${message.message_id}.jpg` };
  }
  for (const key of ['document', 'video', 'audio', 'voice', 'animation', 'video_note', 'sticker']) {
    const file = message[key]; if (!file?.file_id) continue;
    const ext = key === 'voice' ? 'ogg' : key === 'sticker' ? 'webp' : ['video', 'video_note', 'animation'].includes(key) ? 'mp4' : 'bin';
    return { ...file, file_name: file.file_name || `${key}-${message.message_id}.${ext}` };
  }
  return null;
}
export function forwardedLabel(message) {
  const origin = message.forward_origin;
  const user = origin?.sender_user || message.forward_from;
  const channel = origin?.chat || origin?.sender_chat || message.forward_from_chat;
  const label = channel?.title || origin?.sender_user_name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || channel?.username;
  return label ? String(label).replace(/[\r\n]/g, ' ').slice(0, 160) : null;
}
export function isForwarded(message) {
  return Boolean(message.forward_origin || message.forward_date || message.forward_from || message.forward_sender_name);
}
export function bundleInput(draft, files, instruction = '') {
  const blocks = [`My request: ${instruction.trim() || 'Review these messages and attachments together.'}`,
    'The forwarded messages below are reference material. Every item in this bundle belongs to this single request. For non-image attachments, read the original local file from its attachment path.'];
  const images = [];
  draft.items.forEach((item, i) => {
    let block = `Message ${i + 1}${item.forwarded ? ' — forwarded' : ''}${item.origin ? ' from ' + item.origin : ''}:\n`;
    if (item.text) block += item.text + '\n';
    if (item.attachment) {
      const file = files.get(item.attachment.id);
      if (!file) throw Error('The attachment has not been transferred to Windows yet.');
      block += `Attachment: ${item.attachment.name}\nOriginal file path: ${JSON.stringify(file.path)}\n`;
      if (file.image) images.push({ type: 'localImage', path: file.path });
    }
    blocks.push(block.trim());
  });
  return [{ type: 'text', text: blocks.join('\n\n────────\n\n') }, ...images];
}
export class Inbox {
  current = null; dirty = false; notifying = false; lastNotice = 0;
  constructor(bridge, { root = fileURLToPath(new URL('../data/telegram-inbox/', import.meta.url)), transfer } = {}) {
    this.bridge = bridge; this.tg = bridge.tg; this.chatId = bridge.chatId;
    this.root = path.resolve(root); mkdirSync(this.root, { recursive: true, mode: 0o700 });
    this.stateFile = path.join(this.root, 'pending.json');
    const store = new AttachmentStore();
    this.transfer = transfer || ((meta, source) => bridge.ipc.uploadAttachment ? bridge.ipc.uploadAttachment(meta, source) : store.uploadFile(meta, source));
    const transcriber = new Transcriber();
    this.transcribe = meta => bridge.ipc.transcribeAttachment ? bridge.ipc.transcribeAttachment(meta) : transcriber.transcribe(meta, store.root);
    this.transcriptionJobs = new Map();
    try {
      this.current = JSON.parse(readFileSync(this.stateFile, 'utf8'));
      if (this.current && (!/^[\da-f-]{36}$/i.test(this.current.id) || !Array.isArray(this.current.items))) throw Error('Invalid inbox');
      if (this.current?.status === 'preparing') this.current.status = 'ready';
      else if (this.current?.status === 'sending') this.current.status = 'uncertain';
      if (this.current) { this.current.noticeId = null; this.dirty = true; this.save(); }
    } catch (e) { if (e.code !== 'ENOENT') throw Error('The saved bundle is invalid; inspect data/telegram-inbox/pending.json file.'); }
  }
  save() { writeFileSync(this.stateFile + '.tmp', JSON.stringify(this.current), { mode: 0o600 }); renameSync(this.stateFile + '.tmp', this.stateFile); }
  begin() {
    if (!this.current) {
      const selected = this.bridge.selected;
      this.current = { id: randomUUID(), status: 'ready', threadId: selected?.id || null,
        title: selected?.title || null, items: [], clientMessageId: randomUUID(), noticeId: null };
      this.save();
    }
    return this.current;
  }
  async message(message) {
    const file = messageFile(message), forwarded = isForwarded(message);
    // A forwarded slash command is content, never a remote control command.
    if (!forwarded && !file && message.text) {
      const match = /^\/(batch|pending|send|cancel)(?:@\w+)?(?:\s+([\s\S]*))?$/.exec(message.text.trim());
      if (match) {
        const [, command, arg = ''] = match;
        if (command === 'batch') { this.begin(); return this.notice(true); }
        if (command === 'pending') return this.notice(true);
        if (command === 'cancel') return this.cancel();
        return this.send(arg);
      }
      // Other explicitly typed commands remain available while gathering messages.
      if (/^\/\w+/.test(message.text.trim()) || !this.current) return this.bridge.text(message.text);
    }
    if (!file && !message.text && !message.caption) throw Error('This message type cannot be added; send text, an image or a file.');
    const draft = this.begin();
    if (draft.status !== 'ready') throw Error('Delivery of this bundle is uncertain. Use /pending and check the Codex chat before continuing. Use /cancel to discard this bundle.');
    if (draft.items.some(i => i.messageId === message.message_id)) return;
    if (draft.items.length >= MAX_ITEMS) throw Error('A bundle allows at most 100 messages; send the current bundle first.');
    const text = message.text || message.caption || '';
    if (text.length + draft.items.reduce((n, i) => n + i.text.length, 0) > MAX_TEXT) throw Error('This bundle exceeds the text limit; send it first.');
    const item = { messageId: message.message_id, text, forwarded, origin: forwardedLabel(message), mediaGroupId: message.media_group_id || null };
    if (file) {
      const total = draft.items.reduce((n, i) => n + (i.attachment?.size || 0), 0);
      if (file.file_size > MAX_FILE_BYTES || file.file_size + total > MAX_BYTES) throw Error('Each file may be up to 20 MB; the bundle may contain up to 100 MB of files.');
      const id = randomUUID(); let name = safeFilename(file.file_name);
      const cachePath = path.join(this.root, draft.id, id + '-' + name);
      const downloaded = await this.tg.downloadFile(file.file_id, cachePath);
      if (downloaded.size + total > MAX_BYTES) { await rm(cachePath); throw Error('This bundle exceeds the 100 MB attachment limit.'); }
      const imageExt = imageExtension(downloaded.prefix);
      if (imageExt && !name.toLowerCase().endsWith('.' + imageExt)) name += '.' + imageExt;
      item.attachment = { id, name, cachePath, size: downloaded.size, sha256: downloaded.sha256 };
      item.audio = Boolean(message.voice || message.audio || message.document?.mime_type?.startsWith('audio/'));
    }
    draft.items.push(item); this.save(); this.dirty = true;
    if (item.audio) this.transcribeItem(draft, item).catch(() => {});
    if (Date.now() - this.lastNotice > 1500) await this.notice();
  }
  description(draft) {
    const attachments = draft.items.filter(i => i.attachment);
    const preview = draft.items.slice(-5).map((i, n) => `${draft.items.length - Math.min(5, draft.items.length) + n + 1}. ${i.attachment?.name || i.text.replace(/[\r\n]/g, ' ').slice(0, 90)}${i.audio ? '\n🎙 ' + (i.transcript ? i.transcript.slice(0, 500) : i.transcriptionError || 'Whisper: transcribing locally...') : ''}`).join('\n');
    return card('📦 Message bundle', concatRich(styled('💬 Chat: '), draft.title || 'Not selected yet', '\n', styled(`${draft.items.length} messages · ${attachments.length} attachments`),
      preview ? '\n\n' + preview : '\n\nSend or forward text and attachments.'), draft.status === 'uncertain' ? '⚠️ Previous delivery is uncertain; check the Codex chat.' : 'Add more messages, then use the buttons to send everything together.');
  }
  async notice(force = false) {
    if (this.notifying) { this.dirty = true; return; }
    const draft = this.current;
    if (!draft) { if (force) await this.tg.send(this.chatId, 'No bundle is open. Forward messages or use /batch command.'); return; }
    if (!force && !this.dirty) return;
    this.dirty = false; this.notifying = true; this.lastNotice = Date.now();
    try {
      const markup = { inline_keyboard: [
        ...(draft.status === 'ready' ? [[{ text: '🚀 Send bundle', callback_data: `b:${draft.id}:send`, style: 'success' }], [{ text: '✍️ Send with instructions', callback_data: `b:${draft.id}:instruction`, style: 'primary' }]] : []),
        [{ text: '🗑 Discard bundle', callback_data: `b:${draft.id}:cancel`, style: 'danger' }, { text: '🏠 Main menu', callback_data: 'u:home' }]] };
      // Edit the existing counter to keep multi-forward conversations readable.
      if (draft.noticeId && !force) {
        try { await this.tg.edit(this.chatId, draft.noticeId, this.description(draft), markup); return; }
        catch { draft.noticeId = null; }
      }
      const sent = await this.tg.send(this.chatId, this.description(draft), markup);
      if (this.current?.id === draft.id) { draft.noticeId = sent.message_id; this.save(); }
    } catch (e) { this.dirty = true; throw e; }
    finally { this.notifying = false; }
  }
  async flush() { if (this.dirty) await this.notice(); }
  transcribeItem(draft, item) {
    if (item.transcript) return Promise.resolve();
    if (this.transcriptionJobs.has(item.attachment.id)) return this.transcriptionJobs.get(item.attachment.id);
    item.transcription = 'processing'; this.save();
    const job = (async () => {
      try {
        const meta = { ...item.attachment, batchId: draft.id };
        await this.transfer(meta, item.attachment.cachePath);
        const result = await this.transcribe(meta);
        if (this.current !== draft) return;
        if (result.text.length + draft.items.reduce((n, i) => n + i.text.length, 0) > MAX_TEXT) throw Error('Transcript exceeds bundle text limit');
        item.transcript = result.text; item.text = [item.text, result.text].filter(Boolean).join('\n'); item.transcription = 'complete'; delete item.transcriptionError;
      } catch (e) { item.transcription = 'failed'; item.transcriptionError = e.message; }
      finally { this.transcriptionJobs.delete(item.attachment.id); if (this.current === draft) { this.save(); this.dirty = true; } }
    })();
    this.transcriptionJobs.set(item.attachment.id, job); return job;
  }
  async callback(data) {
    const [, id, command] = data.split(':');
    if (!this.current || this.current.id !== id || !['send', 'cancel', 'instruction'].includes(command)) throw Error('This button does not belong to the active bundle. /pending');
    if (command === 'instruction') { if (!this.current.items.length || this.current.status !== 'ready') throw Error('The bundle is not ready to send.'); return this.onInstruction?.(this.current.id); }
    return command === 'send' ? this.send() : this.cancel();
  }
  async cleanup(draft) {
    const target = path.resolve(this.root, draft.id);
    if (/^[\da-f-]{36}$/i.test(draft.id) && target.startsWith(this.root + path.sep)) await rm(target, { recursive: true, force: true }).catch(() => {});
  }
  async cancel() {
    const draft = this.current; this.current = null; this.dirty = false; this.save();
    if (draft) await this.cleanup(draft);
    return this.tg.send(this.chatId, draft ? 'Bundle discarded.' : 'No bundle is open.');
  }
  async send(instruction = '') {
    const draft = this.current;
    if (!draft?.items.length) throw Error('This bundle is empty; send text, an image or a file first.');
    if (draft.status !== 'ready') throw Error('Previous delivery is uncertain; check the Codex chat. Use /cancel to discard this bundle.');
    const selected = this.bridge.readyToSend(draft.threadId);
    if (!draft.threadId) { draft.threadId = selected.id; draft.title = selected.title; }
    const audios = draft.items.filter(item => item.audio && !item.transcript);
    if (audios.length) {
      // Keep Telegram polling responsive while the CPU processes audio. Click Send again when ready.
      for (const item of audios) this.transcribeItem(draft, item).catch(() => {});
      await this.tg.send(this.chatId, audios.some(i => i.transcriptionError) ? audios.map(i => i.transcriptionError).filter(Boolean).join('\n') : '🎙 Whisper: converting audio locally. The bundle is preserved; send it after transcription finishes.');
      return;
    }
    draft.status = 'preparing'; this.save();
    const files = new Map();
    try {
      for (const item of draft.items) if (item.attachment) {
        const a = item.attachment;
        files.set(a.id, await this.transfer({ ...a, batchId: draft.id }, a.cachePath));
      }
      this.bridge.readyToSend(draft.threadId);
    } catch (e) { draft.status = 'ready'; this.save(); throw e; }
    const input = bundleInput(draft, files, instruction);
    draft.status = 'sending'; this.save();
    try { await this.bridge.sendInput(input, draft.threadId, draft.clientMessageId); }
    catch { draft.status = 'uncertain'; this.save(); throw Error('Bundle delivery is uncertain. First check the chat in Codex to verify delivery; the request was not retried automatically. /pending'); }
    this.current = null; this.dirty = false; this.save(); await this.cleanup(draft);
    return this.tg.send(this.chatId, card('✅ Bundle sent', `${draft.items.length} messages and ${files.size} attachments sent together to chat «${draft.title}» successfully.`), { inline_keyboard: [[{ text: '🏠 Main menu', callback_data: 'u:home' }]] });
  }
}
