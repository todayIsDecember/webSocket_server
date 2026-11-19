/**
 * Зареєстроване повідомлення.
 *
 * Використовується для дедуплікації
 * та збереження порядкового номера.
 */
export interface RegisteredMessage {
  chatId: string;
  sequenceNumber: number;
}

/**
 * Стан доставки приватного або публічного повідомлення.
 */
export interface MessageDeliveryRecord {
  senderId: number;
  messageId: string;
  chatId: string;

  // Від кого очікуємо підтвердження доставки.
  pendingRecipients: Set<number>;

  // Хто вже підтвердив отримання.
  deliveredRecipients: Set<number>;
}
