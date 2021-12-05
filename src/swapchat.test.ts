import SwapChat from "./swapchat";
import { PublicKey } from "./types";

const apiURL = "http://localhost:1633";
const debugURL = "http://localhost:1635";

test("session is initialised", async () => {
  const swapChatA = new SwapChat();
  const sessionA = await swapChatA.initiate(apiURL, debugURL);

  let token = sessionA.getToken();

  const swapChatB = new SwapChat();
  const sessionB = await swapChatB.respond(apiURL, debugURL, token);

  expect(sessionA.SharedKeyPair).toStrictEqual(sessionB.SharedKeyPair);

  let responsePayload = sessionB.getRespondentHandshakePayload() as PublicKey;

  sessionA.parseRespondentHandshakePayload(responsePayload);

  expect(sessionA.SharedSecret).toStrictEqual(sessionB.SharedSecret);

  expect(sessionA.handShakeCompleted()).toStrictEqual(true);
  expect(sessionB.handShakeCompleted()).toStrictEqual(true);
});

test("handshake chunk is sent and received", async () => {
  const swapChatA = new SwapChat();

  const sessionA = await swapChatA.initiate(apiURL, debugURL);
  let token = sessionA.getToken();

  const swapChatB = new SwapChat();
  const sessionB = await swapChatB.respond(apiURL, debugURL, token);

  await sessionA.waitForRespondentHandshakeChunk();

  await sessionB.waitForInitiatorHandshakeChunk();

  console.log(sessionB);
});

// let token;

// test("alan session initialise", async () => {
//   const session = await SwapChat.initialise(beeGateway);

//   //create own keypair
//   //create shared keypair
//   //prepare token (shared keypair privatekey, own publickey)

//   token = session.getToken();

//   //set up received callback
//   session.receive(() => {
//     session.received.count == 1;
//     session.received[0].plainText = "hi alan";
//   });

//   //check index 0 of shared feed on timer, if index 0 is noted and receipient public key is retrieved, shared secret is calculated, index 1 is sent as ack
//   await session.connected();

//   session.send("hi becky");
// });

// test("becky session initialise", async () => {
//   let session = await respond(beeGateway, token);
//   //create own keypair
//   //shared secret is calculated
//   //prepare chunk for index 0 of shared feed, send chunk

//   //set up received callback
//   session.received(() => {
//     session.received.count == 1;
//     session.received[0].plainText = "hi becky";
//   });

//   //check index 1 of shared feed on timer, if index 1 is noted, connected
//   await session.connected();

//   session.send("hi alan");
// });
