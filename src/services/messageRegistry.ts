import { chatSequences, registeredMessages } from "../state.js";
import type { RegisteredMessage } from "../types/index.js";

/**
 * Створює унікальний ключ повідомлення.
 *
 * Поєднуємо ID відправника та ID повідомлення,
 * щоб розрізняти повідомлення різних користувачів.
 *
 * Наприклад: senderId = 10, messageId = "abc"
 * Результат: "10:abc"
 */

export const createMessageKey = (
  senderId: number,
  messageId: string,
): string => {
  return `${senderId}:${messageId}`;
};

/**
 * Перевіряє, чи було повідомлення зареєстроване раніше.
 *
 * Використовується для дедуплікації під час ACK + Retry.
 *
 * Якщо повідомлення знайдено — повертаємо його запис.
 * Якщо ні — undefined.
 */

export const findRegisteredMessage = (
  senderId: number,
  messageId: string,
): RegisteredMessage | undefined => {
  const key = createMessageKey(senderId, messageId);
  return registeredMessages.get(key);
};

/**
 * Реєструє нове повідомлення та призначає sequenceNumber.
 *
 * Важливо:
 * - кожен чат має власну послідовність номерів;
 * - повторна реєстрація не збільшує sequenceNumber;
 * - функцію викликаємо після перевірки доступу.
 */

export const registerMessage = (
  senderId: number,
  messageId: string,
  chatId: string,
) => {
  const key = createMessageKey(senderId, messageId);
  const existingMessage = registeredMessages.get(key);
  if (existingMessage) return existingMessage;
  const lastSequence = chatSequences.get(chatId) ?? 0;

  const sequenceNumber = lastSequence + 1;
  const record: RegisteredMessage = {
    chatId,
    sequenceNumber,
  };
  chatSequences.set(chatId, sequenceNumber);
  registeredMessages.set(key, record);

  return record;
};
