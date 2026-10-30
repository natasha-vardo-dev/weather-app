import { cert, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging, type Messaging, type TopicMessage } from 'firebase-admin/messaging';
import { AppError, ProviderError } from '../errors.js';
import { ERROR_CODES } from '@weather/shared';
import type { PushMessage, PushSender } from './types.js';

/**
 * Push through Firebase Cloud Messaging (free). FCM keeps the topic subscriptions, which is
 * what lets this server work without a database. Messages are data-only: the service worker
 * builds the notification in the user's language.
 */
export class FcmSender implements PushSender {
  private readonly messaging: Messaging;

  /** `serviceAccount`: the JSON key of a Firebase service account (a secret, from the environment). */
  constructor(serviceAccount: Record<string, string>, app?: App) {
    this.messaging = getMessaging(app ?? initializeApp({ credential: cert(serviceAccount) }));
  }

  async subscribe(token: string, topics: string[]): Promise<void> {
    await manageTopics(topics, (topic) => this.messaging.subscribeToTopic([token], topic), 'subscribe');
  }

  async unsubscribe(token: string, topics: string[]): Promise<void> {
    await manageTopics(topics, (topic) => this.messaging.unsubscribeFromTopic([token], topic), 'unsubscribe');
  }

  async send(messages: PushMessage[]): Promise<number> {
    return sendMessages(messages, (batch) => this.messaging.sendEach(batch));
  }
}

type SendEach = (batch: TopicMessage[]) => Promise<{
  successCount: number;
  responses: { success: boolean; error?: { code: string; message: string } }[];
}>;

/**
 * Per-message errors that would fail the same way on every run (a malformed message). Any
 * other failure is retried, the warning next run: network errors and timeouts arrive here as
 * 'app/network-error' and the like, and recording a warning as sent when it wasn't is worse
 * than trying again (a credentials problem then fails every run, visibly in the scheduler).
 */
const PERMANENT =
  /invalid-argument|invalid-payload|payload-size-limit-exceeded|invalid-data-payload-key|invalid-options/;

/**
 * Sends in batches of 500 (sendEach's limit) and returns how many were accepted. sendEach
 * reports per-message failures instead of throwing, so any but a permanent one is turned
 * into an error here: otherwise a warning whose every message was rejected (FCM down, the
 * network, quota) would count as sent and never be retried. A retry resends the warning's accepted
 * messages too; they carry the same tag, so a device replaces the notification quietly.
 */
export async function sendMessages(messages: PushMessage[], sendEach: SendEach): Promise<number> {
  let accepted = 0;
  for (let i = 0; i < messages.length; i += 500) {
    const batch: TopicMessage[] = messages.slice(i, i + 500).map(({ topic, data, ttlSeconds }) => ({
      topic,
      data,
      webpush: { headers: { Urgency: 'high', TTL: String(ttlSeconds) } },
    }));
    let response;
    try {
      response = await sendEach(batch);
    } catch (err) {
      throw new ProviderError(`FCM send: ${(err as Error).message}`);
    }
    const retry = response.responses.find((r) => !r.success && !PERMANENT.test(r.error?.code ?? ''));
    if (retry) throw new ProviderError(`FCM send: ${retry.error?.code} ${retry.error?.message}`);
    accepted += response.successCount;
  }
  return accepted;
}

type TopicCall = (
  topic: string,
) => Promise<{ failureCount: number; errors: { error: { code: string; message: string } }[] }>;

/**
 * Subscribes or unsubscribes a token, topic by topic. A token FCM no longer knows (expired,
 * from another project) is a 400 when subscribing, so the client gets a new one; when
 * unsubscribing it is success: a dead token is subscribed to nothing, and failing there
 * would leave the user unable to turn notifications off.
 */
export async function manageTopics(
  topics: string[],
  call: TopicCall,
  action: 'subscribe' | 'unsubscribe',
): Promise<void> {
  for (const topic of topics) {
    let result;
    try {
      result = await call(topic);
    } catch (err) {
      throw new ProviderError(
        `FCM topics: ${(err as Error).message}`,
        'Could not change notifications. Try again later.',
      );
    }
    if (result.failureCount > 0) {
      const { code, message } = result.errors[0]!.error;
      if (/registration-token/.test(code)) {
        if (action === 'unsubscribe') return;
        throw new AppError('This device needs to turn notifications on again.', 400, ERROR_CODES.INVALID_REQUEST);
      }
      throw new ProviderError(`FCM topics: ${code} ${message}`, 'Could not change notifications. Try again later.');
    }
  }
}
