import WebSocket, { type RawData } from "ws";
import chalk from "chalk";
import type {
  ServerMessage,
  IPendingMessage,
  ClientMessage,
  UserWebSocket,
  ServerEvent,
} from "./interfaces.js";

import readline from "node:readline";
import crypto from "node:crypto";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const serverUrl = new URL("ws://localhost:3000");

const pendingAcknowledgments = new Map<string, IPendingMessage>();
const lastProcessedSequences = new Map<string, number>();
const messageBuffer = new Map<string, Map<number, ServerEvent>>();

const connectToServer = () => {
  const userId = Number(process.argv[2]);
  if (userId <= 0 || !Number.isSafeInteger(userId)) {
    return;
  }
  serverUrl.searchParams.set("userId", String(userId));
  let userName = process.argv[3];
  if (!userName || userName.trim().length === 0) {
    userName = `user ${userId}`;
  }
  serverUrl.searchParams.set("userName", userName);
  const socket = new WebSocket(serverUrl);
  const extendedSocket = socket as UserWebSocket;
  extendedSocket.userId = userId;
  extendedSocket.userName = userName;

  socket.on("open", () => handleConnectionOpen(extendedSocket));
  socket.on("message", (data) => handleIncomingMessage(data, extendedSocket));
  socket.on("close", (code, reason) => handleConnectionClose(code, reason));
  socket.on("error", (err) => handleConnectionError(err));
};

let reconnectAttempts: number = 0;
connectToServer();

const handleConnectionError = (err: Error) => {
  return console.log(
    `${chalk.bgRed(" ERROR ")} -> ${err.message ? err.message : "reconnect failed "} ${reconnectAttempts + 1}/5`,
  );
};

const handleIncomingMessage = (data: RawData, client: UserWebSocket): void => {
  try {
    const message = JSON.parse(data.toString()) as ServerMessage;
    switch (message.type) {
      case "ERROR":
        console.log(`${chalk.bgRed(" ERROR ")} -> ${message.message}`);
        break;
      case "SUCCESS":
        console.log(`${chalk.bgGreen(" SUCCESS ")} -> ${message.message}`);
        break;
      case "MESSAGE_ACK":
        const pendingMessage = pendingAcknowledgments.get(message.messageId);
        if (pendingMessage) {
          clearTimeout(pendingMessage.ackTimeout);
          pendingAcknowledgments.delete(message.messageId);
          console.log(
            `${chalk.bgGreen(" SUCCESS ")} -> ${message.messageId}: ${message.status}`,
          );
        }
        break;
      case "PUBLIC_MESSAGE_RECEIVED":
      case "PRIVATE_MESSAGE_RECEIVED":
        processMessageInOrder(message, client);
        break;

      case "MESSAGE_DELIVERED":
        console.log(
          `${chalk.bgGreen(" SUCCESS ")} -> Message ${message.messageId} delivered to user ${message.recipientId}`,
        );
    }
  } catch (error) {
    console.error(`${chalk.bgRed(" ERROR ")} -> Invalid server message`, error);
  }
};

const handleConnectionOpen = (client: UserWebSocket) => {
  console.log(
    `${chalk.bgGreen(" SUCCESS ")} -> connected succesfully userId ${client.userId}`,
  );
  rl.on("line", (input: string) => {
    const readyMessage = validateClientMessage(input);
    if (!readyMessage)
      return console.log(`${chalk.bgRed(" ERROR ")} -> SOMETHING WENT WRONG`);
    if (
      readyMessage.type === "PUBLIC_MESSAGE" ||
      readyMessage.type === "PRIVATE_MESSAGE"
    ) {
      readyMessage.senderName = client.userName;
      sendMessageWithRetry(client, readyMessage, readyMessage.messageId, 1);
    } else {
      client.send(JSON.stringify(readyMessage));
    }
  });
  reconnectAttempts = 0;
  if (pendingAcknowledgments.size > 0) {
    const pendingMessageIds = pendingAcknowledgments.keys();
    pendingMessageIds.forEach((messageId) => {
      const pendingMessage = pendingAcknowledgments.get(messageId);
      if (!pendingMessage) return;
      pendingMessage.attemptNumber++;
      if (pendingMessage.attemptNumber > 3) {
        console.log(`${chalk.bgRed(" ERROR ")} -> MESSAGE DELIVERY FAILED`);
        pendingAcknowledgments.delete(messageId);
        return;
      }
      sendMessageWithRetry(
        client,
        pendingMessage.message,
        messageId,
        pendingMessage.attemptNumber,
      );
    });
  }
};

const handleConnectionClose = (
  code: number,
  reason: Buffer<ArrayBufferLike>,
) => {
  console.log(
    `${chalk.bgCyan(" INFO ")} -> you are disconnected with code ${code} -> ${reason}`,
  );
  if (pendingAcknowledgments.size > 0) {
    const pendingMessageIds = pendingAcknowledgments.keys();
    pendingMessageIds.forEach((messageId) => {
      const ackTimeout = pendingAcknowledgments.get(messageId)?.ackTimeout;
      clearTimeout(ackTimeout);
    });
  }
  reconnectAttempts++;
  if (reconnectAttempts < 5) {
    return setTimeout(() => {
      connectToServer();
    }, 3000);
  }
  console.log(`${chalk.bgRed(" ERROR ")} -> reconnected failed`);
};

const sendMessageWithRetry = (
  client: WebSocket,
  message: ClientMessage,
  messageId: string,
  attemptNumber: number,
) => {
  if (client.readyState !== WebSocket.OPEN) return;
  const ackTimeout = setTimeout(() => {
    const pendingMessage = pendingAcknowledgments.get(messageId);
    if (!pendingMessage) {
      clearTimeout(ackTimeout);
      return;
    }
    let retryAttempt = pendingMessage.attemptNumber;
    retryAttempt++;
    if (retryAttempt <= 3) {
      console.log(
        `${chalk.bgRed(` ACK TIMEOUT  -> attempt ${retryAttempt}/3`)} -> ${messageId}`,
      );
      const messageToRetry = pendingMessage.message;
      if (client.readyState !== WebSocket.OPEN) {
        return;
      }
      return sendMessageWithRetry(
        client,
        messageToRetry,
        messageId,
        retryAttempt,
      );
    }
    console.log(`${chalk.bgRed(" ERROR ")} -> MESSAGE DELIVERY FAILED`);
    pendingAcknowledgments.delete(messageId);
  }, 5000);

  pendingAcknowledgments.set(messageId, {
    message: message,
    ackTimeout: ackTimeout,
    attemptNumber: attemptNumber,
  });
  client.send(JSON.stringify(message));
  console.log(
    `${chalk.bgGreen(" SEND ")} -> message ${messageId} (attempt ${attemptNumber}/3)`,
  );
};

const validateClientMessage = (message: string): ClientMessage | null => {
  const parts = message.trim().split(" ");
  const command = parts[0];
  if (
    command !== "/sendPrivate" &&
    command !== "/sendPublic" &&
    command !== "/join" &&
    command !== "/leave"
  ) {
    console.log(`${chalk.bgRed(" ERROR ")} -> BAD TYPE COMMAND`);
    return null;
  } else if (command === "/sendPrivate" || command === "/sendPublic") {
    const message = parts.slice(2).join(" ");
    if (typeof message !== "string" || message.trim().length === 0) {
      console.log(`${chalk.bgRed(" ERROR ")} -> BAD MESSAGE`);
      return null;
    } else if (command === "/sendPrivate") {
      const recipientId = Number(parts[1]);
      if (
        typeof recipientId !== "number" ||
        Number.isNaN(recipientId) ||
        recipientId <= 0 ||
        !Number.isSafeInteger(recipientId)
      ) {
        console.log(`${chalk.bgRed(" ERROR ")} -> BAD TYPE REPLICENT ID`);
        return null;
      }
      const messageId = crypto.randomUUID();
      return {
        type: "PRIVATE_MESSAGE",
        messageId,
        message,
        recipientId,
      };
    } else if (command === "/sendPublic") {
      const roomId = Number(parts[1]);
      if (
        typeof roomId !== "number" ||
        Number.isNaN(roomId) ||
        roomId <= 0 ||
        !Number.isSafeInteger(roomId)
      ) {
        console.log(`${chalk.bgRed(" ERROR ")} -> BAD TYPE ROOM ID`);
        return null;
      }
      const messageId = crypto.randomUUID();
      return {
        type: "PUBLIC_MESSAGE",
        messageId,
        message,
        roomId,
      };
    }
    return null;
  } else if (command === "/join" || command === "/leave") {
    const roomId = Number(parts[1]);
    if (
      typeof roomId !== "number" ||
      Number.isNaN(roomId) ||
      roomId <= 0 ||
      !Number.isSafeInteger(roomId)
    ) {
      console.log(`${chalk.bgRed(" ERROR ")} -> BAD TYPE ROOM ID`);
      return null;
    } else if (command === "/join") {
      return {
        type: "JOIN_ROOM",
        roomId,
      };
    }
    return {
      type: "LEAVE_ROOM",
      roomId,
    };
  }
  return null;
};

const processMessageInOrder = (
  message: ServerEvent,
  client: UserWebSocket,
): void => {
  const { chatId, sequenceNumber } = message;
  const lastProcessedSequence = lastProcessedSequences.get(chatId) ?? 0;
  const expectedSequence = lastProcessedSequence + 1;
  // Старе або повторне повідомлення
  if (sequenceNumber < expectedSequence) {
    console.log("DUBLICATE OR OLD MESSAGE");
    return;
  }
  // Повідомлення прийшло раніше за попередні
  if (sequenceNumber > expectedSequence) {
    let chatBuffer = messageBuffer.get(chatId);
    if (!chatBuffer) {
      chatBuffer = new Map<number, ServerEvent>();
      messageBuffer.set(chatId, chatBuffer);
    }
    chatBuffer.set(sequenceNumber, message);
    console.log(`MISSING MESSAGE: expected ${expectedSequence}`);
    return;
  }

  // Повідомлення прийшло в правильному порядку
  processRecievedMessage(message, client);

  lastProcessedSequences.set(chatId, sequenceNumber);

  const chatBuffer = messageBuffer.get(chatId);

  if (!chatBuffer) return;

  let nextSequence = sequenceNumber + 1;

  while (chatBuffer.has(nextSequence)) {
    const bufferedMessage = chatBuffer.get(nextSequence);
    if (!bufferedMessage) break;
    processRecievedMessage(message, client);
    lastProcessedSequences.set(chatId, nextSequence);
    chatBuffer.delete(nextSequence);
    nextSequence++;
  }
  if (chatBuffer.size === 0) {
    messageBuffer.delete(chatId);
  }
};

const processRecievedMessage = (
  message: ServerEvent,
  client: UserWebSocket,
): void => {
  switch (message.type) {
    case "PRIVATE_MESSAGE_RECEIVED":
      console.log("DEBUG MESSAGE:", {
        chatId: message.chatId,
        sequenceNumber: message.sequenceNumber,
        messageId: message.messageId,
      });
      console.log(
        `${chalk.bgMagenta(" PRIVATE ")} -> ${message.senderName}: ${message.message}`,
      );
      const deliveryAcknowledgment: ClientMessage = {
        type: "DELIVERED_ACK",
        messageId: message.messageId,
        senderId: client.userId,
      };
      client.send(JSON.stringify(deliveryAcknowledgment));
      break;

    case "PUBLIC_MESSAGE_RECEIVED":
      console.log(
        `${chalk.bgCyan(" PUBLIC ")} -> ${message.senderName}: ${message.message}`,
      );
      break;
  }
};
