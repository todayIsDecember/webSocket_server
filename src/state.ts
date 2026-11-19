import type WebSocket from "ws";
import type { PrivateMessageRecord } from "./interfaces.js";
import type {
  RegisteredMessage,
  MessageDeliveryRecord,
} from "./types/index.js";

/**
 * Зберігає всі активні WebSocket-з'єднання користувачів.
 *
 * Key: userId
 * Value: Set<WebSocket>
 *
 * Використовуємо Set, оскільки один користувач
 * може одночасно мати декілька підключень:
 * наприклад, дві вкладки браузера.
 */
export const userConnections = new Map<number, Set<WebSocket>>();

/**
 * Зберігає учасників кожної кімнати.
 *
 * Key: roomId
 * Value: Set<userId>
 *
 * Дозволяє визначити, кому потрібно надсилати
 * публічні повідомлення конкретної кімнати.
 */
export const roomMembers = new Map<number, Set<number>>();

/**
 * Зберігає інформацію про приватні повідомлення,
 * для яких очікуємо підтвердження доставки.
 *
 * Використовується під час обробки DELIVERED_ACK,
 * щоб знайти відправника й повідомити його
 * через MESSAGE_DELIVERED.
 */

export const privateMessageRecords = new Map<string, PrivateMessageRecord>();

/**
 * Зберігає останній sequenceNumber кожного чату.
 *
 * Key: chatId
 * Value: останній виданий sequenceNumber
 *
 * Потрібно для генерації послідовних номерів
 * повідомлень у приватних чатах та кімнатах.
 */

export const chatSequences = new Map<string, number>();

/**
 * Інформація про вже зареєстроване повідомлення.
 *
 * chatId — чат, до якого належить повідомлення.
 * sequenceNumber — його порядковий номер у чаті.
 */

/**
 * Реєстр уже прийнятих повідомлень.
 *
 * Key: `${senderId}:${messageId}`
 * Value: RegisteredMessage
 *
 * Використовується для дедуплікації:
 * якщо клієнт повторно надішле повідомлення
 * через ACK + Retry, сервер зможе знайти
 * попередній запис і не створювати новий.
 *
 */

export const registeredMessages = new Map<string, RegisteredMessage>();

/**
 * Стан доставки повідомлень.
 * Використовується для DELIVERED_ACK.
 */

export const messageDeliveries = new Map<string, MessageDeliveryRecord>();
