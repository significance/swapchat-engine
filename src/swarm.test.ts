import Swarm from "./swarm";

import Crypto from "./crypto";

const gateway = "http://localhost:1633";

let senderAddress: any, data: any;

test("uploads SOC to index 0", async () => {
  let keyPair = Crypto.generateKeyPair();

  senderAddress = keyPair.address;

  const swarm = new Swarm(gateway, keyPair);
  await swarm.buyStamp();

  data = new Uint8Array([1, 2, 3]);

  await swarm.writeSOC(0, data);
});

test("uploads SOC to index 1", () => {
  //
});

test("downloads SOC from index 0", async () => {
  let swarm = new Swarm(gateway);
  let response = await swarm.readSOC(senderAddress, 0);

  expect(response).toStrictEqual(data);
});

test("downloads SOC from index 1", () => {
  //
});
