// Copyright (c) 2026 Mohsen Zamani / ZamaniDeveloper. See LICENSE.
export const text = {
  refresh:'Refresh status and queue', confirmFinished:'This task ended; continue queue',
  needsReview:'Codex is idle, but completion identity for this legacy request was not found. Confirm only after verifying that it finished or was cancelled.',
  confirmReview:'Your confirmation retires this legacy wait record and permits the next queued request. It does not resend or stop the old request. Confirm only if the task finished or was cancelled.',
  recovered:'You confirmed the legacy task ended; the queue will be checked.', busyRecovery:'Codex is active or fresh state is unavailable; refresh the queue again.',
  chatCount: '⏳ Waiting messages in this chat', totalCount: '📬 Waiting messages in all queues',
  title: '⏳ Send queue', queued: '⏳ Message queued', waiting: 'It will be sent to this conversation in order after the current task finishes.',
  sent: '📨 Queued message sent', empty: 'The send queue is empty.', cancel: '🗑 Remove from queue', cancelled: 'Message removed from the queue.',
  uncertain: '⚠️ Delivery is uncertain. This conversation queue is paused; check Codex first. The message will not be resent automatically.',
  removeUncertain: '🗑 Remove uncertain message after checking', busyCancel: 'This message is being sent or has already been accepted; only waiting messages can be removed.',
  limit: 'The queue is full; review waiting messages first.', stale: 'This message is no longer in the queue.', unavailable: 'Send queue is unavailable.',
  queuedStatus: 'Waiting to send', awaitingStatus: 'Accepted; waiting for task completion', uncertainStatus: 'Uncertain delivery; queue paused', dispatchingStatus: 'Sending',
  previous: '⬅️ Previous', next: 'Next ➡️', home: '🏠 Main menu',
  uncertainError: 'Delivery is uncertain; open Send queue and check Codex.',
};
