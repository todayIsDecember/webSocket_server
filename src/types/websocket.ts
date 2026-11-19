import type WebSocket from "ws";

/**
 * Розширюємо стандартний WebSocket
 * додатковими властивостями нашого застосунку.
 */
export interface UserWebSocket extends WebSocket {
  // Для перевірки активності з'єднання через heartbeat.
  isAlive: boolean;

  // Кімнати, до яких приєднана конкретна вкладка.
  joinedRoomIds: Set<number>;

  // Ідентифікатор підключеного користувача.
  userId: number;

  // Ім'я користувача.
  userName: string;
}
