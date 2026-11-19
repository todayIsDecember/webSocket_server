import WebSocket, { WebSocketServer } from "ws";
import type {
  UserWebSocket,
  ClientMessage,
  ServerResponse,
  ServerEvent,
  PrivateMessageRecord,
} from "./interfaces.js";

const webSocketServer = new WebSocketServer({ port: 3000 });
const userConnections = new Map<number, Set<WebSocket>>();
const roomMembers = new Map<number, Set<number>>();
const processedMessageIds = new Set<string>();
const privateMessageRecords = new Map<string, PrivateMessageRecord>();
const chatSequences = new Map<string, number>();
const messageSequences = new Map<string, number>();

const handleClientMessage = (
  client: UserWebSocket,
  message: ClientMessage,
): void => {
  switch (message.type) {
    case "PRIVATE_MESSAGE":
      break;
    case "PUBLIC_MESSAGE":
      break;
    case "JOIN_ROOM":
      break;
    case "LEAVE_ROOM":
      break;
    case "DELIVERED_ACK":
      break;
  }
};

const handlerPrivateMessage = (
  client: UserWebSocket,
  message: Extract<ClientMessage, { type: "PRIVATE_MESSAGE" }>,
) => {
  const messageDeduplicationKey = `userId:${client.userId}-${message.messageId}`;
  const privateChannelId = `private:${[client.userId, message.recipientId].sort((a, b) => a - b).join(":")}`;
};

webSocketServer.on("connection", (clientSocket: UserWebSocket, request) => {
  if (!request.url) {
    clientSocket.close(1008, "Invalid URL");
    return;
  } else {
    if (clientSocket.readyState !== WebSocket.OPEN) {
      return;
    }
    clientSocket.isAlive = true;
    clientSocket.on("pong", () => {
      clientSocket.isAlive = true;
    });
    const requestUrl = new URL(request.url, "http://localhost:3000");
    clientSocket.userId = Number(requestUrl.searchParams.get("userId"));
    clientSocket.userName =
      requestUrl.searchParams.get("userName") || `user ${clientSocket.userId}`;
    if (
      clientSocket.userId <= 0 ||
      !Number.isSafeInteger(clientSocket.userId)
    ) {
      return clientSocket.close(1008, "Invalid userId");
    }
    const userSockets =
      userConnections.get(clientSocket.userId) || new Set<WebSocket>();
    userSockets.add(clientSocket);
    userConnections.set(clientSocket.userId, userSockets);
    clientSocket.joinedRoomIds = new Set<number>();
    clientSocket.send(
      serializeServerResponse({
        type: "SUCCESS",
        message: "Welcome to WebSocket Server!",
      }),
    );
    joinRoom(clientSocket, 1);
    console.log("client connected");
    clientSocket.on("message", (data) => {
      try {
        const message: ClientMessage = JSON.parse(data.toString());
        const validatedMessage = validateClientMessage(message);
        if (!validatedMessage) {
          clientSocket.send(
            serializeServerResponse({
              type: "ERROR",
              message: "wrong type message",
            }),
          );
          return;
        }
        if (validatedMessage.type === "PRIVATE_MESSAGE") {
          const messageDeduplicationKey = `userId:${clientSocket.userId}-${validatedMessage.messageId}`;
          const privateChannelId = `private:${[
            clientSocket.userId,
            validatedMessage.recipientId,
          ]
            .sort((a, b) => a - b)
            .join(":")}`;
          let messageSequence: number;
          const messageSequenceId = `${clientSocket.userId}:${validatedMessage.messageId}`;
          if (processedMessageIds.has(messageDeduplicationKey)) {
            messageSequence = messageSequences.get(messageSequenceId) as number;
            clientSocket.send(
              serializeServerResponse({
                type: "MESSAGE_ACK",
                messageId: validatedMessage.messageId,
                status: "ACCEPTED",
                chatId: privateChannelId,
                sequenceNumber: messageSequence,
              }),
            );
            return;
          }
          const recipientSockets = userConnections.get(
            validatedMessage.recipientId,
          );
          if (!recipientSockets) {
            clientSocket.send(
              serializeServerResponse({
                type: "ERROR",
                message: "Recipient is offline",
              }),
            );
            return;
          }
          if (messageSequences.has(messageSequenceId)) {
            messageSequence = messageSequences.get(messageSequenceId) as number;
          } else if (!chatSequences.has(privateChannelId)) {
            messageSequence = 1;
            chatSequences.set(privateChannelId, messageSequence);
            messageSequences.set(messageSequenceId, messageSequence);
          } else {
            messageSequence =
              (chatSequences.get(privateChannelId) as number) + 1;
            messageSequences.set(messageSequenceId, messageSequence);
            chatSequences.set(privateChannelId, messageSequence);
          }
          recipientSockets.forEach((connection) => {
            if (connection.readyState !== WebSocket.OPEN) {
              return;
            }
            connection.send(
              serializeServerEvent({
                type: "PRIVATE_MESSAGE_RECEIVED",
                messageId: validatedMessage.messageId,
                senderId: clientSocket.userId,
                message: validatedMessage.message,
                senderName:
                  validatedMessage.senderName || `${clientSocket.userName}`,
                sequenceNumber: messageSequence,
                chatId: privateChannelId,
              }),
            );
          });
          processedMessageIds.add(messageDeduplicationKey);
          const messageTrackingKey = `userId:${validatedMessage.recipientId}-${validatedMessage.messageId}`;
          privateMessageRecords.set(messageTrackingKey, {
            senderId: clientSocket.userId,
            recipientId: validatedMessage.recipientId,
            messageId: validatedMessage.messageId,
          });
          clientSocket.send(
            serializeServerResponse({
              type: "MESSAGE_ACK",
              messageId: validatedMessage.messageId,
              status: "ACCEPTED",
              chatId: privateChannelId,
              sequenceNumber: messageSequence,
            }),
          );
          return;
        } else if (validatedMessage.type === "JOIN_ROOM") {
          const roomId = Number(validatedMessage.roomId);
          if (
            Number.isNaN(roomId) ||
            !Number.isSafeInteger(roomId) ||
            roomId <= 0
          ) {
            return clientSocket.send(
              serializeServerResponse({
                type: "ERROR",
                message: "Wrong type message",
              }),
            );
          } else if (clientSocket.joinedRoomIds.has(roomId)) {
            return clientSocket.send(
              serializeServerResponse({
                type: "ERROR",
                message: "You are already in this room",
              }),
            );
          }
          return joinRoom(clientSocket, roomId);
        } else if (validatedMessage.type === "LEAVE_ROOM") {
          const roomId = Number(validatedMessage.roomId);
          if (
            Number.isNaN(roomId) ||
            !Number.isSafeInteger(roomId) ||
            roomId <= 0
          ) {
            return clientSocket.send(
              serializeServerResponse({
                type: "ERROR",
                message: "Wrong type message",
              }),
            );
          } else if (!clientSocket.joinedRoomIds.has(roomId)) {
            return clientSocket.send(
              serializeServerResponse({
                type: "ERROR",
                message: "You are not in this room",
              }),
            );
          }
          const roomMemberIds = roomMembers.get(roomId);
          if (!roomMemberIds) {
            return;
          }
          clientSocket.joinedRoomIds.delete(roomId);
          const hasOtherRoomConnections = [...userSockets].some((connection) =>
            (connection as UserWebSocket).joinedRoomIds.has(roomId),
          );
          if (!hasOtherRoomConnections) {
            roomMemberIds.delete(clientSocket.userId);
          }
          if (roomMemberIds.size === 0) {
            roomMembers.delete(roomId);
          }
          clientSocket.send(
            serializeServerResponse({
              type: "SUCCESS",
              message: "you left room " + roomId,
            }),
          );
          return;
        } else if (validatedMessage.type === "DELIVERED_ACK") {
          const messageTrackingKey = `userId:${validatedMessage.senderId}-${validatedMessage.messageId}`;
          const messageRecord = privateMessageRecords.get(messageTrackingKey);
          if (!messageRecord) return;
          const deliveryNotification: ServerResponse = {
            type: "MESSAGE_DELIVERED",
            messageId: messageRecord.messageId,
            recipientId: messageRecord.recipientId,
          };
          if (clientSocket.userId !== messageRecord.recipientId) return;
          userConnections.get(messageRecord.senderId)?.forEach((client) => {
            if (client.readyState !== WebSocket.OPEN) return;
            client.send(serializeServerResponse(deliveryNotification));
          });
          return;
        }
        if (!clientSocket.joinedRoomIds.has(validatedMessage.roomId)) {
          return clientSocket.send(
            serializeServerResponse({
              type: "ERROR",
              message: "You dont have access to this room",
            }),
          );
        }
        const publicChannelId = `room${validatedMessage.roomId}`;
        let messageSequence: number;
        const messageSequenceId = `${clientSocket.userId}:${validatedMessage.messageId}`;
        const messageDeduplicationKey = `userId:${clientSocket.userId}-${validatedMessage.messageId}`;
        if (processedMessageIds.has(messageDeduplicationKey)) {
          messageSequence = messageSequences.get(messageSequenceId) as number;
          clientSocket.send(
            serializeServerResponse({
              type: "MESSAGE_ACK",
              messageId: validatedMessage.messageId,
              status: "ACCEPTED",
              chatId: publicChannelId,
              sequenceNumber: messageSequence,
            }),
          );
          return;
        }
        const roomMemberIds = roomMembers.get(validatedMessage.roomId);
        if (!roomMemberIds) {
          return clientSocket.send(
            serializeServerResponse({
              type: "ERROR",
              message: "room doesnt exist",
            }),
          );
        }
        if (messageSequences.has(messageSequenceId)) {
          messageSequence = messageSequences.get(messageSequenceId) as number;
        } else if (!chatSequences.has(publicChannelId)) {
          messageSequence = 1;
          chatSequences.set(publicChannelId, messageSequence);
          messageSequences.set(messageSequenceId, messageSequence);
        } else {
          messageSequence = (chatSequences.get(publicChannelId) as number) + 1;
          messageSequences.set(messageSequenceId, messageSequence);
          chatSequences.set(publicChannelId, messageSequence);
        }
        roomMemberIds.forEach((memberId) => {
          const memberSockets = userConnections.get(memberId);
          if (!memberSockets) {
            return clientSocket.send(
              serializeServerResponse({
                type: "ERROR",
                message: "clients do not found",
              }),
            );
          }
          memberSockets.forEach((client) => {
            const extendedSocket = client as UserWebSocket;
            if (
              extendedSocket.readyState !== WebSocket.OPEN ||
              !extendedSocket.joinedRoomIds.has(validatedMessage.roomId)
            ) {
              return;
            }
            client.send(
              serializeServerEvent({
                type: "PUBLIC_MESSAGE_RECEIVED",
                messageId: validatedMessage.messageId,
                senderId: clientSocket.userId,
                roomId: validatedMessage.roomId,
                message: validatedMessage.message,
                senderName:
                  validatedMessage.senderName || `${clientSocket.userName}`,
                chatId: publicChannelId,
                sequenceNumber: messageSequence,
              }),
            );
          });
        });
        processedMessageIds.add(messageDeduplicationKey);
        clientSocket.send(
          serializeServerResponse({
            type: "MESSAGE_ACK",
            messageId: validatedMessage.messageId,
            status: "ACCEPTED",
            chatId: publicChannelId,
            sequenceNumber: messageSequence,
          }),
        );
      } catch (error) {
        console.log(error);
        clientSocket.send(
          serializeServerResponse({
            type: "ERROR",
            message: "wrong type message",
          }),
        );
      }
    });

    clientSocket.on("close", (code, reason) => {
      const client = clientSocket as UserWebSocket;
      userSockets.delete(client);
      for (const roomId of client.joinedRoomIds) {
        const roomMemberIds = roomMembers.get(roomId);
        if (!roomMemberIds) continue;

        const hasOtherRoomConnections = [...userSockets].some((connection) =>
          (connection as UserWebSocket).joinedRoomIds.has(roomId),
        );

        if (!hasOtherRoomConnections) {
          roomMemberIds.delete(clientSocket.userId);

          if (roomMemberIds.size === 0) {
            roomMembers.delete(roomId);
          }
        }
      }
      if (userSockets.size === 0) {
        userConnections.delete(clientSocket.userId);
      }
    });

    clientSocket.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  }
});

const heartbeatInterval = setInterval(() => {
  webSocketServer.clients.forEach((socket) => {
    const client = socket as UserWebSocket;
    if (client.isAlive === false) {
      return client.terminate();
    }
    client.isAlive = false;
    client.ping();
  });
}, 30000);

webSocketServer.on("listening", () => {
  console.log(`Server started on port 3000`);
});

webSocketServer.on("close", () => {
  clearInterval(heartbeatInterval);
});

const validateClientMessage = (data: ClientMessage) => {
  if (
    typeof data !== "object" ||
    data === null ||
    Array.isArray(data) ||
    !data
  ) {
    return null;
  } else if (
    data.type !== "PRIVATE_MESSAGE" &&
    data.type !== "PUBLIC_MESSAGE" &&
    data.type !== "JOIN_ROOM" &&
    data.type !== "LEAVE_ROOM" &&
    data.type !== "DELIVERED_ACK"
  ) {
    return null;
  } else if (data.type === "JOIN_ROOM" || data.type === "LEAVE_ROOM") {
    if (typeof data.roomId !== "number") {
      return null;
    } else if (data.roomId < 1 || !Number.isSafeInteger(data.roomId)) {
      return null;
    } else {
      return data;
    }
  } else if (data.type === "DELIVERED_ACK") {
    if (typeof data.messageId !== "string") {
      return null;
    } else if (data.messageId.trim().length === 0) {
      return null;
    } else if (data.senderId <= 0 || !Number.isSafeInteger(data.senderId)) {
      return null;
    }
  } else if (
    typeof data.message !== "string" ||
    typeof data.messageId !== "string"
  ) {
    return null;
  } else if (
    data.message.trim().length === 0 ||
    data.messageId.trim().length === 0
  ) {
    return null;
  } else if (data.type === "PRIVATE_MESSAGE") {
    if (typeof data.recipientId !== "number") {
      return null;
    } else if (
      data.recipientId < 1 ||
      !Number.isSafeInteger(data.recipientId)
    ) {
      return null;
    } else {
      return data;
    }
  } else if (data.type === "PUBLIC_MESSAGE") {
    if (typeof data.roomId !== "number") {
      return null;
    } else if (data.roomId < 1 || !Number.isSafeInteger(data.roomId)) {
      return null;
    } else {
      return data;
    }
  }
  return data;
};

const joinRoom = (socket: UserWebSocket, roomId: number): void => {
  const roomMemberIds = roomMembers.get(roomId) || new Set<number>();
  if (!roomMembers.has(roomId)) {
    roomMemberIds.add(socket.userId);
    roomMembers.set(roomId, roomMemberIds);
  } else if (!roomMemberIds.has(socket.userId)) {
    roomMemberIds.add(socket.userId);
  }
  socket.joinedRoomIds.add(roomId);
  socket.send(
    JSON.stringify({ type: "SUCCESS", message: "welcome to chat " + roomId }),
  );
};

const serializeServerResponse = (message: ServerResponse): string => {
  return JSON.stringify(message);
};

const serializeServerEvent = (message: ServerEvent): string => {
  return JSON.stringify(message);
};
