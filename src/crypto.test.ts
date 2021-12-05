import { IV, Secret } from "./types";

import crypto from "./crypto";

let sharedSecret: Secret, ivBuffer: IV, cypherTextBuffer: Buffer;
let plainText = "hello w0rld";

let privateKey = Buffer.from(
  "1f0ade8c7991ff9e9506eb68269d73160318bcc29135552863e491b6cf762ef8",
  "hex"
);

test("generates random private key", () => {
  let keyPair = crypto.generateKeyPair();
  expect(keyPair.privateKey.length).toBe(32);
  expect(keyPair.publicKey.length).toBe(65);
  expect(keyPair.address.length).toBe(20);
});

test("imports private key", () => {
  let keyPair = crypto.importKeyPair(privateKey);
  expect(keyPair.privateKey.length).toBe(32);
  expect(keyPair.publicKey.length).toBe(65);
  expect(keyPair.address.toString("hex")).toBe(
    "c1A9a28667A55ceF902532db2fB4638e44b02F7c".toLowerCase()
  );
});

test("calculates shared secret", () => {
  let keyPair1 = crypto.generateKeyPair();
  let keyPair2 = crypto.generateKeyPair();

  let sharedSecret1 = crypto.calculateSharedSecret(
    keyPair1.privateKey,
    keyPair2.publicKey
  );
  let sharedSecret2 = crypto.calculateSharedSecret(
    keyPair2.privateKey,
    keyPair1.publicKey
  );

  expect(sharedSecret1).toStrictEqual(sharedSecret2);

  sharedSecret = sharedSecret1;
});

test("encrypts buffer with secret", async () => {
  ivBuffer = Buffer.alloc(16);
  ivBuffer.writeUInt16BE(1, 0);

  let plainTextBuffer = Buffer.from(plainText, "utf8");

  cypherTextBuffer = await crypto.encryptBuffer(
    plainTextBuffer,
    sharedSecret,
    ivBuffer
  );

  //...
});

test("decrypts buffer with secret", async () => {
  let decryptedPlainTextBuffer = await crypto.decryptBuffer(
    cypherTextBuffer,
    sharedSecret,
    ivBuffer
  );
  let decryptedPlainText = decryptedPlainTextBuffer.toString();

  expect(decryptedPlainText).toBe(plainText);
});
