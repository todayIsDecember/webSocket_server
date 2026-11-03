import WebSocket, { type RawData } from "ws";
import chalk from "chalk";
import type { ServerMessage, IPendingMessage } from "./interfaces.js";

const url = new URL("ws://localhost:3000?userId=10");

const pendingMessages = new Map<string, IPendingMessage>();

const connect = () => {
  const client = new WebSocket(url);
  client.on("open", () => openHandler(client));
  client.on("message", (data) => messageHandler(data));
  client.on("close", (code, reason) => closeHandler(code, reason));
  client.on("error", (err) => errorHandler(err));
};

let reconnectAttempts: number = 0;
const user_id = url.searchParams.get("userId");
connect();

const errorHandler = (err: Error) => {
  return console.log(
    `${chalk.bgRed(" ERROR ")} -> ${err.message ? err.message : "reconnect failed "} ${reconnectAttempts + 1}/5`,
  );
};

const messageHandler = (data: RawData): void => {
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
        const pendingMessage = pendingMessages.get(message.messageId);
        if (pendingMessage) {
          clearTimeout(pendingMessage.timeOut);
          pendingMessages.delete(message.messageId);
        }
        console.log(
          `${chalk.bgGreen(" SUCCESS ")} -> ${message.messageId}: ${message.status}`,
        );
        break;
      case "PUBLIC_MESSAGE_RECEIVED":
        console.log(
          `${chalk.bgCyan(" PUBLIC ")} -> User ${message.from}: ${message.message}`,
        );
        break;

      case "PRIVATE_MESSAGE_RECEIVED":
        console.log(
          `${chalk.bgMagenta(" PRIVATE ")} -> User ${message.from}: ${message.message}`,
        );
        break;
    }
  } catch (error) {
    console.error(`${chalk.bgRed(" ERROR ")} -> Invalid server message`, error);
  }
};

const openHandler = (client: WebSocket) => {
  console.log(
    `${chalk.bgGreen(" SUCCESS ")} -> connected succesfully user_id ${user_id}`,
  );
  reconnectAttempts = 0;
  const messageId = crypto.randomUUID();
  const message = {
    type: "PUBLIC_MESSAGE",
    room: 1,
    messageId: messageId,
    message: "Привіт всім)",
  };
  setTimeout(() => {
    if (client.readyState !== WebSocket.OPEN) return;
    const timeOut = setTimeout(() => {
      console.log(`${chalk.bgRed(" ACK TIMEOUT ")} -> ${messageId}`);

      pendingMessages.delete(messageId);
    }, 5000);

    pendingMessages.set(messageId, {
      messageId,
      message: message.message,
      timeOut: timeOut,
    });
    client.send(JSON.stringify(message));
  }, 2000);
};

const closeHandler = (code: number, reason: Buffer<ArrayBufferLike>) => {
  console.log(
    `${chalk.bgCyan(" INFO ")} -> you are disconnected with code ${code} -> ${reason}`,
  );
  reconnectAttempts++;
  if (reconnectAttempts < 5) {
    return setTimeout(() => {
      connect();
    }, 3000);
  }
  console.log(`${chalk.bgRed(" ERROR ")} -> reconnected failed`);
};
