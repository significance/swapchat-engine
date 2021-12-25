import SwapChat from "./swapchat";
// import { PublicKey } from "./types";
import { Message } from "./types";

const apiURL = "http://localhost:1633";
const debugURL = "http://localhost:1635";

// const TOKEN_LENGTH = 194;

// const sleep = (delay: number) =>
//   new Promise((resolve) => setTimeout(resolve, delay));

// test("session is initiated", async () => {
//   let initatorDidRecieve = (...args: any[]) => {
//     console.log(...args);
//   };

//   const respondentDidRecieve = (...args: any[]) => {
//     console.log(...args);
//   };

//   const swapChatA = new SwapChat(apiURL, debugURL, initatorDidRecieve);
//   const sessionA = await swapChatA.initiate();

//   const token = sessionA.getToken();

//   expect(token.length).toStrictEqual(TOKEN_LENGTH);

//   const swapChatB = new SwapChat(apiURL, debugURL, respondentDidRecieve);
//   const sessionB = await swapChatB.respond(token);

//   expect(sessionA.SharedKeyPair).toStrictEqual(sessionB.SharedKeyPair);

//   const responsePayload = sessionB.getRespondentHandshakePayload() as PublicKey;

//   sessionA.parseRespondentHandshakePayload(responsePayload);

//   expect(sessionA.SharedSecret).toStrictEqual(sessionB.SharedSecret);

//   expect(sessionA.handShakeCompleted()).toStrictEqual(true);
//   expect(sessionB.handShakeCompleted()).toStrictEqual(true);
// });

// test("handshake chunk is sent and received", async () => {
//   const initatorDidRecieve = (...args: any[]) => {
//     console.log(...args);
//   };

//   const respondentDidRecieve = (...args: any[]) => {
//     console.log(...args);
//   };

//   const swapChatA = new SwapChat(apiURL, debugURL, initatorDidRecieve);

//   const sessionA = await swapChatA.initiate();
//   const token = sessionA.getToken();

//   const swapChatB = new SwapChat(apiURL, debugURL, respondentDidRecieve);
//   const sessionB = await swapChatB.respond(token);

//   await sessionA.waitForRespondentHandshakeChunk();

//   await sessionB.waitForInitiatorHandshakeChunk();

//   expect(sessionA.SharedSecret).toStrictEqual(sessionB.SharedSecret);

//   expect(sessionA.handShakeCompleted()).toStrictEqual(true);
//   expect(sessionB.handShakeCompleted()).toStrictEqual(true);
// });

test("messages are sent and received", async () => {
  const initatorDidRecieve = (...args: any[]) => {
    console.log(...args);
  };

  const respondentDidRecieve = (...args: any[]) => {
    console.log(...args);
  };

  const swapChatA = new SwapChat(apiURL, debugURL, initatorDidRecieve);

  const sessionA = await swapChatA.initiate();
  const token = sessionA.getToken();

  const swapChatB = new SwapChat(apiURL, debugURL, respondentDidRecieve);
  const sessionB = await swapChatB.respond(token);

  await sessionA.waitForRespondentHandshakeChunk();

  await sessionB.waitForInitiatorHandshakeChunk();

  let index_A_0 = 0;
  let message_A_0 = "hello world one";

  await sessionA.send(message_A_0);

  console.log("sent");

  // expect(true).toBeTruthy();

  console.log("done");

  let checkMessageIsReceived = (
    session: any,
    message: string,
    index: number
  ) => {
    let retries = 0;
    let interval: any;
    return new Promise((resolve, reject) => {
      console.log("cCC");
      interval = setInterval(async () => {
        if (retries > 10) {
          reject("too many retries");
        }
        console.log("XXX", session, message, index);
        console.log("MMM", session.OtherPartyConversation.messages[0]);
        let filteredMessages = session.OtherPartyConversation.messages.filter(
          (m: Message) => {
            return m.index === index;
          }
        );
        console.log("FFF", filteredMessages.length, filteredMessages);

        // if (filteredMessages.length > 1 || filteredMessages.length < 1) {
        //   clearInterval(interval);
        //   throw new Error("should only be one message with each index");
        // }

        if (filteredMessages.length === 1) {
          console.log("CLEAR");
          clearInterval(interval);
          resolve(true);
        }
        if (filteredMessages.length === 0) {
          retries = retries + 1;
        }
      }, 1000);
    });
  };

  await expect(
    checkMessageIsReceived(sessionB, message_A_0, index_A_0)
  ).resolves.toBe(true); //keeps checking until finds chunk

  const index_B_0 = 0;
  const message_B_0 = "hello world too";

  await sessionB.send(message_B_0);

  await expect(
    checkMessageIsReceived(sessionA, message_B_0, index_B_0)
  ).resolves.toBe(true); //keeps checking until finds chunk

  const index_A_1 = 1;
  const message_A_1 = "hello world three";

  await sessionA.send(message_A_1);

  await expect(
    checkMessageIsReceived(sessionB, message_A_1, index_A_1)
  ).resolves.toBe(true); //keeps checking until finds chunk

  const index_B_1 = 1;
  const message_B_1 = "hello world three";

  await sessionB.send(message_B_1);

  await expect(
    checkMessageIsReceived(sessionA, message_B_1, index_B_1)
  ).resolves.toBe(true); //keeps checking until finds chunk

  sessionA.close();
  sessionB.close();
}, 100000);
