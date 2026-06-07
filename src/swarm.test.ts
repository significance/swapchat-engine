import Swarm from "./swarm";
import Crypto from "./crypto";
import { apiURL, book, signerKey, saveBook, captureStampState } from "./test-helpers";

jest.setTimeout(120000);

let senderAddress: any, data: any;
let index = Math.floor(Math.random() * 10000);

test("uploads SOC to random index", async () => {
  const keyPair = Crypto.generateKeyPair();
  senderAddress = keyPair.address;

  const swarm = new Swarm(apiURL);
  swarm.useClientStamp(signerKey, book.batchId, book.depth, book.buckets ?? undefined);

  data = new Uint8Array([1, 2, 3]);
  await swarm.writeSOC(keyPair, index, data);
  captureStampState(swarm);
});

test("downloads SOC from random index", async () => {
  const swarm = new Swarm(apiURL);
  const response = await swarm.readSOC(senderAddress, index);
  expect(response.payload.toUint8Array()).toStrictEqual(data);
});

let clientStampAddress: any, clientStampData: any;
let clientStampIndex = Math.floor(Math.random() * 10000) + 20000;

test("uploads SOC with client-side stamping", async () => {
  const keyPair = Crypto.generateKeyPair();
  clientStampAddress = keyPair.address;

  const swarm = new Swarm(apiURL);
  swarm.useClientStamp(signerKey, book.batchId, book.depth, book.buckets ?? undefined);

  clientStampData = new Uint8Array([4, 5, 6]);
  await swarm.writeSOC(keyPair, clientStampIndex, clientStampData);
  captureStampState(swarm);
});

test("downloads SOC uploaded with client-side stamp", async () => {
  const swarm = new Swarm(apiURL);
  const response = await swarm.readSOC(clientStampAddress, clientStampIndex);
  expect(response.payload.toUint8Array()).toStrictEqual(clientStampData);
});

afterAll(() => saveBook());
