import type { ClientMessage } from "./messages.js";

/**
 * Повідомлення, яке очікує підтвердження від сервера.
 *
 * Використовується для ACK + Retry.
 */
export interface IPendingMessage {
  // Початкове повідомлення для повторного надсилання.
  message: ClientMessage;

  // Таймер очікування MESSAGE_ACK.
  ackTimeout: ReturnType<typeof setTimeout>;

  // Кількість спроб надсилання.
  attemptNumber: number;
}
