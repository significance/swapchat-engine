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

test("calculates shared secret and secret code", () => {
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

  let secretCode1 = crypto.calculateSecretCode(sharedSecret1);
  let secretCode2 = crypto.calculateSecretCode(sharedSecret2);

  expect(secretCode1).toStrictEqual(secretCode2);
});

test("encrypts buffer with secret", async () => {
  ivBuffer = crypto.ivFromUint(1);

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

test("generates ML-KEM-768 keypair", () => {
  let keyPair = crypto.generateMlKemKeyPair();
  expect(keyPair.encapsulationKey.length).toBe(1184);
  expect(keyPair.decapsulationKey.length).toBe(2400);
});

test("ML-KEM encapsulate/decapsulate roundtrip", () => {
  let keyPair = crypto.generateMlKemKeyPair();

  let { ciphertext, sharedSecret: encapSecret } = crypto.mlKemEncapsulate(
    keyPair.encapsulationKey
  );

  expect(ciphertext.length).toBe(1088);
  expect(encapSecret.length).toBe(32);

  let decapSecret = crypto.mlKemDecapsulate(
    keyPair.decapsulationKey,
    ciphertext
  );

  expect(decapSecret.length).toBe(32);
  expect(Buffer.from(decapSecret)).toStrictEqual(Buffer.from(encapSecret));
});

test("derives hybrid secret from ECDH + ML-KEM", () => {
  let ecdhKey1 = crypto.generateKeyPair();
  let ecdhKey2 = crypto.generateKeyPair();
  let ecdhSecret = crypto.calculateSharedSecret(
    ecdhKey1.privateKey,
    ecdhKey2.publicKey
  );

  let mlkemKeys = crypto.generateMlKemKeyPair();
  let { sharedSecret: mlkemSecret } = crypto.mlKemEncapsulate(
    mlkemKeys.encapsulationKey
  );

  let hybridSecret = crypto.deriveHybridSecret(ecdhSecret, mlkemSecret);

  expect(hybridSecret.length).toBe(32);

  // same inputs produce same output
  let hybridSecret2 = crypto.deriveHybridSecret(ecdhSecret, mlkemSecret);
  expect(hybridSecret).toStrictEqual(hybridSecret2);
});

test("hybrid secret with AES encrypt/decrypt roundtrip", async () => {
  let ecdhKey1 = crypto.generateKeyPair();
  let ecdhKey2 = crypto.generateKeyPair();
  let ecdhSecret = crypto.calculateSharedSecret(
    ecdhKey1.privateKey,
    ecdhKey2.publicKey
  );

  let mlkemKeys = crypto.generateMlKemKeyPair();
  let { sharedSecret: mlkemSecret } = crypto.mlKemEncapsulate(
    mlkemKeys.encapsulationKey
  );

  let hybridSecret = crypto.deriveHybridSecret(ecdhSecret, mlkemSecret);
  let iv = crypto.ivFromUint(0);
  let plainBuf = Buffer.from("post-quantum hello", "utf8");

  let encrypted = await crypto.encryptBuffer(plainBuf, hybridSecret, iv);
  let decrypted = crypto.decryptBuffer(encrypted, hybridSecret, iv);

  expect(decrypted.toString()).toBe("post-quantum hello");
});
