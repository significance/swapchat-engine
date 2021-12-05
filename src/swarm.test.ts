import Swarm from "./swarm";

import Crypto from "./crypto";

const apiURL = "http://localhost:1633";
const debugURL = "http://localhost:1635";

let senderAddress: any, data: any;

let index = Math.floor(Math.random() * 10000);

test("uploads SOC to random index", async () => {
  let keyPair = Crypto.generateKeyPair();

  senderAddress = keyPair.address;

  const swarm = new Swarm(apiURL, debugURL, keyPair);
  await swarm.buyStamp();

  data = new Uint8Array([1, 2, 3]);

  await swarm.writeSOC(keyPair, index, data);
});

test("downloads SOC from random index", async () => {
  const swarm = new Swarm(apiURL, debugURL);

  let response = await swarm.readSOC(senderAddress, index);
  expect(response.payload()).toStrictEqual(data);
});
