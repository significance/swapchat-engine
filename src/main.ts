import { Bee, Utils } from "@ethersphere/bee-js";

// import { ethers } from "ethers";

export async function uploadChunk() {
  const bee = new Bee("http://localhost:1633");

  const postageBatchId = await bee.createPostageBatch("100", 17);
  const data = new Uint8Array([1, 2, 3]);

  const result = await bee.uploadData(postageBatchId, data);

  return result;
}

export async function uploadSOC() {
  const bee = new Bee("http://localhost:1633");

  const signer =
    "0x634fb5a872396d9693e5c9f9d7233cfa93f395c093371017ff44aa9ae6564cdd";

  const socWriter = bee.makeSOCWriter(signer);

  interface Bytes<Length extends number> extends Uint8Array {
    readonly length: Length;
  }

  type Identifier = Bytes<32>;

  const topic: Identifier = Utils.hexToBytes(
    "0000000000000000000000000000000000000000000000000000000000000003"
  );

  const data = new Uint8Array([1, 2, 3]);

  const postageBatchId = await bee.createPostageBatch("100", 17);

  const response = await socWriter.upload(postageBatchId, topic, data);

  console.log("rrr", response);
}

export async function downloadSOC() {
  const bee = new Bee("http://localhost:1633");

  const signer =
    "0x634fb5a872396d9693e5c9f9d7233cfa93f395c093371017ff44aa9ae6564cdd";

  const socWriter = bee.makeSOCWriter(signer);

  interface Bytes<Length extends number> extends Uint8Array {
    readonly length: Length;
  }

  type Identifier = Bytes<32>;

  const topic: Identifier = Utils.hexToBytes(
    "0000000000000000000000000000000000000000000000000000000000000003"
  );

  const response = await socWriter.download(topic);

  console.log("rrrd", response);
  console.log("rrrd", response.payload());
  console.log("rrrd", response.identifier());
}

export async function updateFeed() {
  const bee = new Bee("http://localhost:1633");
  const postageBatchId = await bee.createPostageBatch("100", 17);
  const data = new Uint8Array([1, 2, 3]);
  const reference = await bee.uploadData(postageBatchId, data);
  const topic =
    "0000000000000000000000000000000000000000000000000000000000000000";
  const signer =
    "0x634fb5a872396d9693e5c9f9d7233cfa93f395c093371017ff44aa9ae6564cdd";
  const feedWriter = bee.makeFeedWriter("sequence", topic, signer);
  const response = await feedWriter.upload(postageBatchId, reference.reference);
  return response;
}

export async function downloadFeed() {
  const bee = new Bee("http://localhost:1633");
  const topic =
    "0000000000000000000000000000000000000000000000000000000000000000";
  const owner = "0x8d3766440f0d7b949a5e32995d09619a7f86e632";
  const feedReader = bee.makeFeedReader("sequence", topic, owner);
  const feedUpdate = await feedReader.download();
  return feedUpdate; // prints the latest reference stored in the feed
}

// export const uploadSOC;

export const delayMillis = (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

export const greet = (name: string): string => `Hello ${name}`;

export const foo = async (): Promise<boolean> => {
  console.log(greet("World"));
  await delayMillis(1000);
  console.log("done");
  return true;
};
