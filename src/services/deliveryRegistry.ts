import { messageDeliveries } from "../state.js";

import type { MessageDeliveryRecord } from "../types/state.js";

import { createMessageKey } from "./messageRegistry.js";

/**
 * Реєструє повідомлення, для якого потрібно
 * відстежувати підтвердження доставки.
 *
 * Працює з приватними та публічними повідомленнями.
 *
 * Для приватного повідомлення recipientIds
 * міститиме одного користувача.
 *
 * Для публічного — декількох учасників кімнати.
 */

export const registerDelivery = (
  senderId: number,
  messageId: string,
  chatId: string,
  recipientIds: number[],
): MessageDeliveryRecord => {
  const key = createMessageKey(senderId, messageId);
  const existing = messageDeliveries.get(key);
  if (existing) return existing;
  const record: MessageDeliveryRecord = {
    senderId,
    chatId,
    messageId,
    pendingRecipients: new Set(recipientIds.filter((id) => id !== senderId)),
    deliveredRecipients: new Set<number>(),
  };

  messageDeliveries.set(key, record);
  return record;
};

/**
 * Підтверджує отримання повідомлення користувачем.
 *
 * Повертає true, якщо підтвердження нове та коректне.
 *
 * Повертає false, якщо:
 * - повідомлення не знайдено;
 * - користувач не був серед отримувачів;
 * - користувач уже підтвердив доставку.
 */

export const confirmDelivery = (
  senderId: number,
  messageId: string,
  recipientId: number,
): boolean => {
  const key = createMessageKey(senderId, messageId);

  const record = messageDeliveries.get(key);

  if (!record) return false;

  if (!record.pendingRecipients.has(recipientId)) return false;
  if (record.deliveredRecipients.has(recipientId)) return false;

  record.pendingRecipients.delete(recipientId);
  record.deliveredRecipients.add(recipientId);
  return true;
};

/**
 * Повертає поточний стан доставки повідомлення.
 *
 * Може знадобитися для:
 * - перевірки доставки всім учасникам;
 * - відображення статусу повідомлення;
 * - майбутньої синхронізації після reconnect.
 */

export const getDeliveryRecord = (
  senderId: number,
  messageId: string,
): MessageDeliveryRecord | undefined => {
  const key = createMessageKey(senderId, messageId);
  return messageDeliveries.get(key);
};
