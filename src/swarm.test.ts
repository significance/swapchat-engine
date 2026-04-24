import Swarm from "./swarm";

import Crypto from "./crypto";

const apiURL = process.env.BEE_API_URL || "http://localhost:1633";
const STAMP_ID = process.env.BEE_STAMP_ID || "";
const SIGNER_KEY = process.env.BEE_SIGNER_KEY || "";
const CLIENT_STAMP_ID = process.env.BEE_CLIENT_STAMP_ID || "";
const STAMP_DEPTH = parseInt(process.env.BEE_STAMP_DEPTH || "20");
jest.setTimeout(120000);

let senderAddress: any, data: any;

let index = Math.floor(Math.random() * 10000);

test("uploads SOC to random index", async () => {
  let keyPair = Crypto.generateKeyPair();

  senderAddress = keyPair.address;

  const swarm = new Swarm(apiURL);

  if (STAMP_ID) {
    await swarm.useStamp(STAMP_ID);
  } else {
    await swarm.buyStamp();
  }

  data = new Uint8Array([1, 2, 3]);

  await swarm.writeSOC(keyPair, index, data);
});

test("downloads SOC from random index", async () => {
  const swarm = new Swarm(apiURL);

  let response = await swarm.readSOC(senderAddress, index);

  expect(response.payload.toUint8Array()).toStrictEqual(data);
});

let clientStampAddress: any, clientStampData: any;
let clientStampIndex = Math.floor(Math.random() * 10000) + 20000;

const clientStampTests = SIGNER_KEY && CLIENT_STAMP_ID ? test : test.skip;

clientStampTests("uploads SOC with client-side stamping", async () => {
  let keyPair = Crypto.generateKeyPair();
  clientStampAddress = keyPair.address;

  const swarm = new Swarm(apiURL);
  swarm.useClientStamp(SIGNER_KEY, CLIENT_STAMP_ID, STAMP_DEPTH);

  clientStampData = new Uint8Array([4, 5, 6]);

  await swarm.writeSOC(keyPair, clientStampIndex, clientStampData);
});

clientStampTests("downloads SOC uploaded with client-side stamp", async () => {
  const swarm = new Swarm(apiURL);

  let response = await swarm.readSOC(clientStampAddress, clientStampIndex);

  expect(response.payload.toUint8Array()).toStrictEqual(clientStampData);
});
