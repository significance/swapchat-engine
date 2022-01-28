import SwapChat from "./swapchat";
import { PublicKey } from "./types";
import { Message } from "./types";

const apiURL = "http://localhost:1633";
const debugURL = "http://localhost:1635";

const initiatorDidRecieve = console.log;
const respondentDidRecieve = console.log;

const TOKEN_LENGTH = 194;

let checkMessageIsReceived = (
  session: any,
  messageContent: string,
  index: number
) => {
  let retries = 0;
  let interval: any;
  return new Promise((resolve, reject) => {
    // console.log("cCC");
    interval = setInterval(async () => {
      if (retries > 10) {
        reject("too many retries");
      }

      let filteredMessages = session.OtherPartyConversation.messages.filter(
        (m: Message) => {
          return m.index === index;
        }
      );

      session.OtherPartyConversation.messages.filter((m: Message) => {
        return m.content === messageContent;
      });

      // if (filteredMessages.length > 1 || filteredMessages.length < 1) {
      //   clearInterval(interval);
      //   throw new Error("should only be one message with each index");
      // }

      if (filteredMessages.length === 1) {
        clearInterval(interval);
        resolve(true);
      }
      if (filteredMessages.length === 0) {
        retries = retries + 1;
      }
    }, 1000);
  });
};

test("session is initiated", async () => {
  const swapChatA = new SwapChat(apiURL, debugURL, initiatorDidRecieve, false);
  const sessionA = await swapChatA.initiate();

  const token = sessionA.getToken();

  expect(token.length).toStrictEqual(TOKEN_LENGTH);

  const swapChatB = new SwapChat(apiURL, debugURL, respondentDidRecieve, false);
  const sessionB = await swapChatB.respond(token);

  expect(sessionA.SharedKeyPair).toStrictEqual(sessionB.SharedKeyPair);

  const responsePayload = sessionB.getRespondentHandshakePayload() as PublicKey;

  sessionA.parseRespondentHandshakePayload(responsePayload);

  expect(sessionA.SharedSecret).toStrictEqual(sessionB.SharedSecret);

  expect(sessionA.SecretCode).toStrictEqual(sessionB.SecretCode);

  expect(sessionA.handShakeCompleted()).toStrictEqual(true);
  expect(sessionB.handShakeCompleted()).toStrictEqual(true);

  sessionA.close();
  sessionB.close();
});

test("handshake chunk is sent and received", async () => {
  const swapChatA = new SwapChat(apiURL, debugURL, initiatorDidRecieve, false);

  const sessionA = await swapChatA.initiate();
  const token = sessionA.getToken();

  const swapChatB = new SwapChat(apiURL, debugURL, respondentDidRecieve, false);
  const sessionB = await swapChatB.respond(token);

  await sessionA.waitForRespondentHandshakeChunk();

  await sessionB.waitForInitiatorHandshakeChunk();

  expect(sessionA.SharedSecret).toStrictEqual(sessionB.SharedSecret);

  expect(sessionA.handShakeCompleted()).toStrictEqual(true);
  expect(sessionB.handShakeCompleted()).toStrictEqual(true);

  sessionA.close();
  sessionB.close();
});

test("messages are sent and received", async () => {
  let callbackCountA = 0;

  let callBackIncrementerA = () => {
    callbackCountA = callbackCountA + 1;
  };

  let callbackCountB = 0;

  let callBackIncrementerB = () => {
    callbackCountB = callbackCountB + 1;
  };

  const swapChatA = new SwapChat(apiURL, debugURL, callBackIncrementerA, false);

  const sessionA = await swapChatA.initiate();
  const token = sessionA.getToken();

  const swapChatB = new SwapChat(apiURL, debugURL, callBackIncrementerB, false);
  const sessionB = await swapChatB.respond(token);

  await sessionA.waitForRespondentHandshakeChunk();

  await sessionB.waitForInitiatorHandshakeChunk();

  let index_A_0 = 0;
  let message_A_0 = "hello world one";

  await sessionA.send(message_A_0);

  await expect(sessionA.OwnConversation.messages.length).toBe(1);

  await expect(
    checkMessageIsReceived(sessionB, message_A_0, index_A_0)
  ).resolves.toBe(true);

  expect(callbackCountB).toBe(1);

  const index_B_0 = 0;
  const message_B_0 = "hello world too";

  await sessionB.send(message_B_0);

  await expect(sessionB.OwnConversation.messages.length).toBe(1);

  await expect(
    checkMessageIsReceived(sessionA, message_B_0, index_B_0)
  ).resolves.toBe(true);

  expect(callbackCountA).toBe(1);

  const index_A_1 = 1;
  const message_A_1 = "hello world three";

  await sessionA.send(message_A_1);

  await expect(sessionA.OwnConversation.messages.length).toBe(2);

  await expect(
    checkMessageIsReceived(sessionB, message_A_1, index_A_1)
  ).resolves.toBe(true);

  const index_B_1 = 1;
  const message_B_1 = "hello world three";

  await sessionB.send(message_B_1);

  await expect(sessionB.OwnConversation.messages.length).toBe(2);

  await expect(
    checkMessageIsReceived(sessionA, message_B_1, index_B_1)
  ).resolves.toBe(true);

  sessionA.close();
  sessionB.close();
}, 100000);
