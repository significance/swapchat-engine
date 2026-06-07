import SwapChat from "./swapchat";
import { Message } from "./types";
import { apiURL, book, signerKey, saveBook, captureStampState } from "./test-helpers";

const TOKEN_LENGTH = 1859;
const POLL_TIME = 1000;

jest.setTimeout(60000);

function makeInitiator(callback: any): SwapChat {
  const s = new SwapChat(apiURL, callback, false, POLL_TIME);
  s.BatchID = book.batchId;
  s.SignerKey = signerKey;
  s.StampDepth = book.depth;
  return s;
}

function makeRespondent(callback: any): SwapChat {
  return new SwapChat(apiURL, callback, false, POLL_TIME);
}

let checkMessageIsReceived = (
  session: any,
  _messageContent: string,
  index: number
) => {
  let retries = 0;
  let interval: any;
  return new Promise((resolve, reject) => {
    interval = setInterval(async () => {
      if (retries > 10) {
        reject("too many retries");
      }

      let filteredMessages = session.OtherPartyConversation.messages.filter(
        (m: Message) => {
          return m.index === index;
        }
      );

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
  const swapChatA = makeInitiator(console.log);
  const sessionA = await swapChatA.initiate();

  const token = sessionA.getToken();
  expect(token.length).toStrictEqual(TOKEN_LENGTH);

  const swapChatB = makeRespondent(console.log);
  const sessionB = await swapChatB.respond(token);

  expect(sessionA.SharedKeyPair).toStrictEqual(sessionB.SharedKeyPair);

  const responsePayload = sessionB.getRespondentHandshakePayload();
  sessionA.parseRespondentHandshakePayload(responsePayload);

  expect(sessionA.SharedSecret).toStrictEqual(sessionB.SharedSecret);
  expect(sessionA.SecretCode).toStrictEqual(sessionB.SecretCode);
  expect(sessionA.handShakeCompleted()).toStrictEqual(true);
  expect(sessionB.handShakeCompleted()).toStrictEqual(true);

  captureStampState(sessionA.Swarm);
  sessionA.close();
  sessionB.close();
});

test("handshake chunk is sent and received", async () => {
  const swapChatA = makeInitiator(console.log);
  const sessionA = await swapChatA.initiate();
  const token = sessionA.getToken();

  const swapChatB = makeRespondent(console.log);
  const sessionB = await swapChatB.respond(token);

  await sessionA.waitForRespondentHandshakeChunk();
  await sessionB.waitForInitiatorHandshakeChunk();

  expect(sessionA.SharedSecret).toStrictEqual(sessionB.SharedSecret);
  expect(sessionA.handShakeCompleted()).toStrictEqual(true);
  expect(sessionB.handShakeCompleted()).toStrictEqual(true);

  captureStampState(sessionA.Swarm);
  sessionA.close();
  sessionB.close();
});

let restoreTokenA: string;
let restoreTokenB: string;

const index_A_0 = 0;
const message_A_0 = "hello world one";
const index_B_0 = 0;
const message_B_0 = "hello world too";
const index_A_1 = 1;
const message_A_1 = "hello world three";
const index_B_1 = 1;
const message_B_1 = "hello world four";

test("messages are sent and received", async () => {
  let callbackCountA = 0;
  let callbackCountB = 0;

  const swapChatA = makeInitiator(() => { callbackCountA++; });
  const sessionA = await swapChatA.initiate();
  const token = sessionA.getToken();

  const swapChatB = makeRespondent(() => { callbackCountB++; });
  const sessionB = await swapChatB.respond(token);

  await sessionA.waitForRespondentHandshakeChunk();
  await sessionB.waitForInitiatorHandshakeChunk();

  await sessionA.send(message_A_0);
  expect(sessionA.OwnConversation.messages.length).toBe(1);
  await expect(checkMessageIsReceived(sessionB, message_A_0, index_A_0)).resolves.toBe(true);
  expect(callbackCountB).toBe(1);

  await sessionB.send(message_B_0);
  expect(sessionB.OwnConversation.messages.length).toBe(1);
  await expect(checkMessageIsReceived(sessionA, message_B_0, index_B_0)).resolves.toBe(true);
  expect(callbackCountA).toBe(1);

  await sessionA.send(message_A_1);
  expect(sessionA.OwnConversation.messages.length).toBe(2);
  await expect(checkMessageIsReceived(sessionB, message_A_1, index_A_1)).resolves.toBe(true);

  await sessionB.send(message_B_1);
  expect(sessionB.OwnConversation.messages.length).toBe(2);
  await expect(checkMessageIsReceived(sessionA, message_B_1, index_B_1)).resolves.toBe(true);

  // Capture restoration tokens after messaging so ratchet state is current
  restoreTokenA = sessionA.getRestorationToken();
  expect(restoreTokenA.length).toBeGreaterThan(0);
  restoreTokenB = sessionB.getRestorationToken();
  expect(restoreTokenB.length).toBeGreaterThan(0);

  captureStampState(sessionA.Swarm);
  sessionA.close();
  sessionB.close();
}, 100000);

test("restored sessions can send and receive new messages", async () => {
  const swapChatA = makeInitiator(() => {});
  const sessionA = await swapChatA.restoreFromToken(restoreTokenA);

  const swapChatB = makeRespondent(() => {});
  const sessionB = await swapChatB.restoreFromToken(restoreTokenB);

  // Old messages cannot be re-read — forward secrecy deletes old keys.
  // Indices continue from where the previous session left off.
  const message_A_2 = "hello world five";
  await sessionA.send(message_A_2);
  expect(sessionA.OwnConversation.messages.length).toBe(1);
  await expect(checkMessageIsReceived(sessionB, message_A_2, 2)).resolves.toBe(true);

  const message_B_2 = "hello world six";
  await sessionB.send(message_B_2);
  expect(sessionB.OwnConversation.messages.length).toBe(1);
  await expect(checkMessageIsReceived(sessionA, message_B_2, 2)).resolves.toBe(true);

  captureStampState(sessionA.Swarm);
  sessionA.close();
  sessionB.close();
});

afterAll(() => saveBook());
