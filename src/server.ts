import WebSocket, { WebSocketServer } from "ws";
import type {
  ExtendedWebSocket,
  ClientMessage,
  ServerResponse,
  ServerEvent,
} from "./interfaces.js";
import crypto from "node:crypto";

const wss = new WebSocketServer({ port: 3000 });
const clients = new Map<number, Set<WebSocket>>();
const rooms = new Map<number, Set<number>>();

wss.on("connection", (socket: ExtendedWebSocket, request) => {
  if (!request.url) {
    socket.close(1008, "Invalid URL");
    return;
  } else {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.isAlive = true;
    socket.on("pong", () => {
      socket.isAlive = true;
    });
    const url = new URL(request.url, "http://localhost:3000");
    socket.user_id = Number(url.searchParams.get("userId"));
    if (socket.user_id <= 0 || !Number.isSafeInteger(socket.user_id)) {
      return socket.close(1008, "Invalid userId");
    }
    const connections = clients.get(socket.user_id) || new Set<WebSocket>();
    connections.add(socket);
    clients.set(socket.user_id, connections);
    socket.rooms = new Set<number>();
    socket.send(
      answerFromServer({
        type: "SUCCESS",
        message: "Welcome to WebSocket Server!",
      }),
    );
    addToRoom(socket, 1);
    console.log("client connected");
    socket.on("message", (data) => {
      try {
        const message: ClientMessage = JSON.parse(data.toString());
        const validatedMessage = validateData(message);
        if (!validatedMessage) {
          socket.send(
            answerFromServer({
              type: "ERROR",
              message: "wrong type message",
            }),
          );
          return;
        }
        if (validatedMessage.type === "PRIVATE_MESSAGE") {
          const reciever = clients.get(validatedMessage.to);
          if (!reciever) {
            socket.send(
              answerFromServer({
                type: "ERROR",
                message: "Recipient is offline",
              }),
            );
            return;
          }
          reciever.forEach((client) => {
            if (client.readyState !== WebSocket.OPEN) {
              return;
            }
            client.send(
              serverEventResponse({
                type: "PRIVATE_MESSAGE_RECEIVED",
                messageId: validatedMessage.messageId,
                from: socket.user_id,
                message: validatedMessage.message,
              }),
            );
          });
          socket.send(
            answerFromServer({
              type: "MESSAGE_ACK",
              messageId: validatedMessage.messageId,
              status: "ACCEPTED",
            }),
          );
          return;
        } else if (validatedMessage.type === "JOIN_ROOM") {
          const room_id = Number(validatedMessage.roomId);
          if (
            Number.isNaN(room_id) ||
            !Number.isSafeInteger(room_id) ||
            room_id <= 0
          ) {
            return socket.send(
              answerFromServer({
                type: "ERROR",
                message: "Wrong type message",
              }),
            );
          } else if (socket.rooms.has(room_id)) {
            return socket.send(
              answerFromServer({
                type: "ERROR",
                message: "You are already in this room",
              }),
            );
          }
          return addToRoom(socket, room_id);
        } else if (validatedMessage.type === "LEAVE_ROOM") {
          const room_id = Number(validatedMessage.roomId);
          if (
            Number.isNaN(room_id) ||
            !Number.isSafeInteger(room_id) ||
            room_id <= 0
          ) {
            return socket.send(
              answerFromServer({
                type: "ERROR",
                message: "Wrong type message",
              }),
            );
          } else if (!socket.rooms.has(room_id)) {
            return socket.send(
              answerFromServer({
                type: "ERROR",
                message: "You are not in this room",
              }),
            );
          }
          const roommates = rooms.get(room_id);
          if (!roommates) {
            return;
          }
          socket.rooms.delete(room_id);
          const hasOtherConnections = [...connections].some((connection) =>
            (connection as ExtendedWebSocket).rooms.has(room_id),
          );
          if (!hasOtherConnections) {
            roommates.delete(socket.user_id);
          }
          if (roommates.size === 0) {
            rooms.delete(room_id);
          }
          socket.send(
            answerFromServer({
              type: "SUCCESS",
              message: "you left room " + room_id,
            }),
          );
          return;
        }
        if (!socket.rooms.has(validatedMessage.room)) {
          return socket.send(
            answerFromServer({
              type: "ERROR",
              message: "You dont have access to this room",
            }),
          );
        }
        const roommates = rooms.get(validatedMessage.room);
        if (!roommates) {
          return socket.send(
            answerFromServer({ type: "ERROR", message: "room doesnt exist" }),
          );
        }
        roommates.forEach((roommate) => {
          const clientAccounts = clients.get(roommate);
          if (!clientAccounts) {
            return socket.send(
              answerFromServer({
                type: "ERROR",
                message: "clients do not found",
              }),
            );
          }
          clientAccounts.forEach((client) => {
            const extendedClient = client as ExtendedWebSocket;
            if (
              extendedClient.readyState !== WebSocket.OPEN ||
              !extendedClient.rooms.has(validatedMessage.room)
            ) {
              return;
            }
            client.send(
              serverEventResponse({
                type: "PUBLIC_MESSAGE_RECEIVED",
                messageId: validatedMessage.messageId,
                from: socket.user_id,
                room: validatedMessage.room,
                message: validatedMessage.message,
              }),
            );
          });
        });
        socket.send(
          answerFromServer({
            type: "MESSAGE_ACK",
            messageId: validatedMessage.messageId,
            status: "ACCEPTED",
          }),
        );
      } catch (error) {
        console.log(error);
        socket.send(
          answerFromServer({ type: "ERROR", message: "wrong type message" }),
        );
      }
    });

    socket.on("close", (code, reason) => {
      const client = socket as ExtendedWebSocket;
      connections.delete(client);
      for (const roomId of client.rooms) {
        const roommates = rooms.get(roomId);
        if (!roommates) continue;

        const hasOtherConnection = [...connections].some((connection) =>
          (connection as ExtendedWebSocket).rooms.has(roomId),
        );

        if (!hasOtherConnection) {
          roommates.delete(socket.user_id);

          if (roommates.size === 0) {
            rooms.delete(roomId);
          }
        }
      }
      if (connections.size === 0) {
        clients.delete(socket.user_id);
      }
    });

    socket.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  }
});

const heartbeat = setInterval(() => {
  wss.clients.forEach((socket) => {
    const client = socket as ExtendedWebSocket;
    if (client.isAlive === false) {
      return client.terminate();
    }
    client.isAlive = false;
    client.ping();
  });
}, 30000);

wss.on("listening", () => {
  console.log(`Server started on port 3000`);
});

wss.on("close", () => {
  clearInterval(heartbeat);
});

const validateData = (data: ClientMessage) => {
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
    data.type !== "LEAVE_ROOM"
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
    if (typeof data.to !== "number") {
      return null;
    } else if (data.to < 1 || !Number.isSafeInteger(data.to)) {
      return null;
    } else {
      return data;
    }
  } else if (data.type === "PUBLIC_MESSAGE") {
    if (typeof data.room !== "number") {
      return null;
    } else if (data.room < 1 || !Number.isSafeInteger(data.room)) {
      return null;
    } else {
      return data;
    }
  }
  return data;
};

const addToRoom = (socket: ExtendedWebSocket, room_id: number): void => {
  const roommates = rooms.get(room_id) || new Set<number>();
  if (!rooms.has(room_id)) {
    roommates.add(socket.user_id);
    rooms.set(room_id, roommates);
  } else if (!roommates.has(socket.user_id)) {
    roommates.add(socket.user_id);
  }
  socket.rooms.add(room_id);
  socket.send(
    JSON.stringify({ type: "SUCCESS", message: "welcome to chat " + room_id }),
  );
};

const answerFromServer = (message: ServerResponse): string => {
  return JSON.stringify(message);
};

const serverEventResponse = (message: ServerEvent): string => {
  return JSON.stringify(message);
};
