import Swarm from "./swarm";

import Crypto from "./crypto";

const apiURL = process.env.BEE_API_URL || "http://localhost:1633";
const STAMP_ID = process.env.BEE_STAMP_ID || "";

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
