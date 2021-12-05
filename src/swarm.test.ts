import Swarm from "./swarm";

import Crypto from "./crypto";

const gateway = "http://localhost:1633";

let senderAddress: any, data: any;

let index = Math.floor(Math.random() * 10000);

test("uploads SOC to random index", async () => {
  let keyPair = Crypto.generateKeyPair();

  senderAddress = keyPair.address;

  const swarm = new Swarm(gateway, keyPair);
  await swarm.buyStamp();

  data = new Uint8Array([1, 2, 3]);

  await swarm.writeSOC(index, data);
});

test("downloads SOC from random index", async () => {
  let swarm = new Swarm(gateway);

  let response = await swarm.readSOC(senderAddress, index);
  expect(response).toStrictEqual(data);
});
