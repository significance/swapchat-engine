import Swarm from "./swarm";
import crypto from "./crypto";
import {
	initRatchetInitiator,
	initRatchetRespondent,
	ratchetEncrypt,
	ratchetDecrypt,
	generateDHKeyPair,
	serializeRatchetState,
	deserializeRatchetState,
	DH_PUB_BYTES,
	type RatchetState,
} from "./ratchet";

function toBase64Url(buf: Buffer): string {
	return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str: string): Buffer {
	let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
	while (b64.length % 4) b64 += "=";
	return Buffer.from(b64, "base64");
}

import {
	KeyPair,
	Secret,
	SecretCode,
	Address,
	PublicKey,
	PrivateKey,
	Message,
	Conversation,
	MlKemKeyPair,
	MlKemCiphertext,
} from "./types";

// Byte lengths for token fields
const PRIVATE_KEY_BYTES = 32;
const PUBLIC_KEY_BYTES = 65;
const MLKEM_ENCAP_KEY_BYTES = 1184;
const MLKEM_CIPHERTEXT_BYTES = 1088;

// Book of stamps
const BOOK_OF_STAMPS_INDEX = 2; // handshake uses 0 and 1
const STAMP_ENVELOPE_SIZE = 113; // batchId(32) + index(8) + timestamp(8) + sig(65)
const STAMPS_PER_BOOK = Math.floor(4096 / STAMP_ENVELOPE_SIZE); // 36

// Token: sharedPrivKey(32) + initiatorPubKey(65) + mlkemEncapKey(1184) + handshakeStamp(113) = 1394 bytes
const TOKEN_BYTES =
	PRIVATE_KEY_BYTES + PUBLIC_KEY_BYTES + MLKEM_ENCAP_KEY_BYTES + STAMP_ENVELOPE_SIZE;

const sleep = (delay: number) =>
	new Promise((resolve) => setTimeout(resolve, delay));

class SwapChat {
	public Swarm: any;
	public SharedKeyPair: undefined | KeyPair;
	public OwnKeyPair: undefined | KeyPair;
	public SecretCode: undefined | SecretCode;
	public SharedSecret: undefined | Secret;
	public GatewayMode: boolean = false;
	public IsInitiator: boolean = false;
	public IsRespondent: boolean = false;
	public IsPollingForMessages: boolean = false;
	public IsPollingForRestoreMessages: boolean = false;
	public OtherPartyPublicKey: undefined | PublicKey;
	public OtherPartyAddress: undefined | Address;
	public OwnCurrentIndex: number = 0;
	public OtherPartyCurrentIndex: number = 0;
	public OwnConversation: Conversation;
	public OtherPartyConversation: Conversation;
	public DidReceiveCallback: any;
	public BatchID: undefined | string;
	public PollMilliseconds: number = 5000;
	public MlKemKeyPair: undefined | MlKemKeyPair;
	public MlKemCiphertext: undefined | MlKemCiphertext;
	public SignerKey: undefined | string;
	public StampDepth: number = 20;
	public StampBuckets: Uint32Array | undefined;
	public BookOfStamps: Map<number, any> = new Map();
	public HandshakeStamp: undefined | Uint8Array; // marshalled 113-byte stamp
	public Ratchet: RatchetState | undefined;
	public RatchetDHKeyPair: { privateKey: Buffer; publicKey: Buffer } | undefined;

	constructor(
		apiURL: string,
		didReceiveCallback: object,
		gatewayMode: boolean,
		pollMilliseconds: number,
		socGatewayURL?: string,
		readTimeoutMs?: number
	) {
		this.Swarm = new Swarm(apiURL, socGatewayURL, readTimeoutMs);
		this.DidReceiveCallback = didReceiveCallback;
		this.SecretCode = undefined;
		this.SharedSecret = undefined;
		this.OtherPartyConversation = this.initialiseOtherPartyConversation();
		this.OwnConversation = this.initialiseOwnConversation();
		this.GatewayMode = gatewayMode;
		this.PollMilliseconds = pollMilliseconds;
	}

	private setupStamp() {
		if (this.SignerKey && this.BatchID) {
			this.Swarm.useClientStamp(
				this.SignerKey,
				this.BatchID,
				this.StampDepth,
				this.StampBuckets
			);
		}
	}

	async restore() {
		let stamp = this.BatchID;
		const isZeroStamp =
			stamp ===
			"0000000000000000000000000000000000000000000000000000000000000000";

		if (this.SignerKey && stamp && !isZeroStamp) {
			this.setupStamp();
		} else if (!isZeroStamp && this.GatewayMode === false) {
			if (stamp === undefined) {
				throw new Error("must provide a stamp");
			}
			this.BatchID = await this.Swarm.useStamp(stamp);
		}

		if (this.GatewayMode === true) {
			this.BatchID = this.Swarm.zeroStamp();
		}

		if (this.OwnKeyPair === undefined) {
			throw new Error("must provide a own key pair");
		}

		if (this.OtherPartyPublicKey === undefined) {
			throw new Error("must provide other party public key");
		}

		if (this.SharedSecret === undefined) {
			throw new Error("must provide shared secret");
		}

		this.SecretCode = crypto.calculateSecretCode(this.SharedSecret);

		this.OtherPartyAddress = crypto.publicKeyToAddress(
			this.OtherPartyPublicKey
		);

		// Re-read book of stamps if available
		if (isZeroStamp && this.SharedKeyPair) {
			await this.readBookOfStamps();
		}

		this.IsPollingForMessages = true;
		this.setReceiveLoop();

		// Only attempt to re-read old messages if no ratchet —
		// with ratchet, old message keys are deleted (forward secrecy)
		if (!this.Ratchet) {
			this.IsPollingForRestoreMessages = true;
			this.setRestoreConversationLoop();
		}
	}

	/**
	 * Serialise session state to a base64url restoration token.
	 *
	 * Binary layout:
	 *   version           (1)   0x02
	 *   ownAddress        (20)
	 *   ownPublicKey      (65)
	 *   ownPrivateKey     (32)
	 *   otherPartyPubKey  (65)
	 *   sharedSecret      (32)
	 *   sharedAddress     (20)
	 *   batchId           (32)
	 *   ownCurrentIndex   (2)   uint16 BE
	 *   otherCurrentIndex (2)   uint16 BE
	 *   ratchetLen        (2)   uint16 BE (0 if no ratchet)
	 *   ratchetState      (var)
	 */
	getRestorationToken(): string {
		if (!this.OwnKeyPair || !this.OtherPartyPublicKey) {
			throw new Error("Could not find key pairs");
		}
		if (!this.SharedSecret) {
			throw new Error("Could not find shared secret");
		}

		const stamp = this.BatchID
			? Buffer.from(this.BatchID, "hex")
			: Buffer.alloc(32);

		const sharedAddr = this.SharedKeyPair
			? Buffer.from(this.SharedKeyPair.address)
			: Buffer.alloc(20);

		const ratchetBuf = this.Ratchet
			? serializeRatchetState(this.Ratchet)
			: Buffer.alloc(0);

		const indices = Buffer.alloc(4);
		indices.writeUInt16BE(this.OwnCurrentIndex, 0);
		indices.writeUInt16BE(this.OtherPartyCurrentIndex, 2);

		const ratchetLen = Buffer.alloc(2);
		ratchetLen.writeUInt16BE(ratchetBuf.length, 0);

		const buf = Buffer.concat([
			Buffer.from([0x02]),                          // version
			Buffer.from(this.OwnKeyPair.address),         // 20
			Buffer.from(this.OwnKeyPair.publicKey),        // 65
			Buffer.from(this.OwnKeyPair.privateKey),       // 32
			Buffer.from(this.OtherPartyPublicKey),         // 65
			Buffer.from(this.SharedSecret),                // 32
			sharedAddr,                                    // 20
			stamp,                                         // 32
			indices,                                       // 4
			ratchetLen,                                    // 2
			ratchetBuf,                                    // var
		]);

		return toBase64Url(buf);
	}

	parseRestorationToken(token: string) {
		const buf = fromBase64Url(token);

		const version = buf[0];
		if (version !== 0x02) {
			throw new Error(`unsupported restoration token version: ${version}`);
		}

		let offset = 1;

		const ownAddress = buf.subarray(offset, offset + 20);
		offset += 20;
		const ownPublicKey = buf.subarray(offset, offset + 65);
		offset += 65;
		const ownPrivateKey = buf.subarray(offset, offset + 32);
		offset += 32;
		const otherPartyPubKey = buf.subarray(offset, offset + 65);
		offset += 65;
		const sharedSecret = buf.subarray(offset, offset + 32);
		offset += 32;
		const sharedAddress = buf.subarray(offset, offset + 20);
		offset += 20;
		const stampBytes = buf.subarray(offset, offset + 32);
		offset += 32;
		const ownCurrentIndex = buf.readUInt16BE(offset);
		offset += 2;
		const otherCurrentIndex = buf.readUInt16BE(offset);
		offset += 2;
		const ratchetLen = buf.readUInt16BE(offset);
		offset += 2;

		this.OwnKeyPair = {
			address: Buffer.from(ownAddress) as Address,
			privateKey: Buffer.from(ownPrivateKey) as PrivateKey,
			publicKey: Buffer.from(ownPublicKey) as PublicKey,
		};

		this.OtherPartyPublicKey = Buffer.from(otherPartyPubKey) as PublicKey;
		this.SharedSecret = Buffer.from(sharedSecret) as Secret;

		const hasSharedAddr = sharedAddress.some((b: number) => b !== 0);
		if (hasSharedAddr) {
			this.SharedKeyPair = {
				address: Buffer.from(sharedAddress) as Address,
			} as KeyPair;
		}

		this.BatchID = Buffer.from(stampBytes).toString("hex");
		this.OwnCurrentIndex = ownCurrentIndex;
		this.OtherPartyCurrentIndex = otherCurrentIndex;

		if (ratchetLen > 0) {
			const ratchetBuf = buf.subarray(offset, offset + ratchetLen);
			this.Ratchet = deserializeRatchetState(ratchetBuf);
		}
	}

	restoreFromToken(token: string) {
		this.parseRestorationToken(token);
		this.restore();
		return this;
	}

	async initiate() {
		this.IsInitiator = true;
		this.SharedKeyPair = crypto.generateKeyPair();
		this.OwnKeyPair = crypto.generateKeyPair();
		this.MlKemKeyPair = crypto.generateMlKemKeyPair();

		if (this.SignerKey && this.BatchID) {
			this.setupStamp();
			// Pre-stamp the handshake SOC for the respondent
			const handshakeAddr = this.Swarm.calculateSOCAddress(
				this.SharedKeyPair.address,
				0
			);
			const envelope = this.Swarm.stampForAddress(handshakeAddr);
			this.HandshakeStamp = this.Swarm.marshalStampEnvelope(envelope);
		} else if (this.BatchID !== undefined) {
			await this.Swarm.useStamp(this.BatchID);
		} else if (this.GatewayMode === true) {
			this.BatchID = this.Swarm.zeroStamp();
		} else {
			throw new Error("must provide a stamp (BatchID + SignerKey or BatchID)");
		}

		return this;
	}

	getToken() {
		if (this.SharedKeyPair === undefined || this.OwnKeyPair === undefined) {
			throw new Error("Could not find key pairs");
		}

		if (this.MlKemKeyPair === undefined) {
			throw new Error("Could not find ML-KEM key pair");
		}

		const tokenBuffer = Buffer.alloc(TOKEN_BYTES);
		let offset = 0;

		Buffer.from(this.SharedKeyPair.privateKey).copy(tokenBuffer, offset);
		offset += PRIVATE_KEY_BYTES;

		Buffer.from(this.OwnKeyPair.publicKey).copy(tokenBuffer, offset);
		offset += PUBLIC_KEY_BYTES;

		Buffer.from(this.MlKemKeyPair.encapsulationKey).copy(tokenBuffer, offset);
		offset += MLKEM_ENCAP_KEY_BYTES;

		// Append handshake stamp (113 bytes) — or zeros if no client stamping
		if (this.HandshakeStamp) {
			Buffer.from(this.HandshakeStamp).copy(tokenBuffer, offset);
		}

		return toBase64Url(tokenBuffer);
	}

	async respond(token: string) {
		this.IsRespondent = true;
		this.OwnKeyPair = crypto.generateKeyPair();
		this.parseToken(token);

		if (this.HandshakeStamp) {
			// Respondent has a pre-signed stamp from initiator — zero BZZ mode
		} else if (this.SignerKey && this.BatchID) {
			this.setupStamp();
		} else if (this.BatchID !== undefined) {
			await this.Swarm.useStamp(this.BatchID);
		} else if (this.GatewayMode === true) {
			this.BatchID = this.Swarm.zeroStamp();
		} else {
			throw new Error("must provide a stamp (BatchID + SignerKey or BatchID)");
		}

		await this.sendRespondentHandshakeChunk();

		return this;
	}

	parseToken(token: string): void {
		const tokenBuffer = fromBase64Url(token);

		if (tokenBuffer.length !== TOKEN_BYTES) {
			throw new Error(
				`token must decode to ${TOKEN_BYTES} bytes, got ${tokenBuffer.length}`
			);
		}

		let offset = 0;
		const sharedPrivateKey = tokenBuffer.subarray(
			offset,
			offset + PRIVATE_KEY_BYTES
		) as PrivateKey;
		offset += PRIVATE_KEY_BYTES;

		const respondentPublicKey = tokenBuffer.subarray(
			offset,
			offset + PUBLIC_KEY_BYTES
		) as PublicKey;
		offset += PUBLIC_KEY_BYTES;

		const mlkemEncapKey = new Uint8Array(
			tokenBuffer.subarray(offset, offset + MLKEM_ENCAP_KEY_BYTES)
		);
		offset += MLKEM_ENCAP_KEY_BYTES;

		// Extract handshake stamp (113 bytes) — check if non-zero
		const stampBytes = new Uint8Array(
			tokenBuffer.subarray(offset, offset + STAMP_ENVELOPE_SIZE)
		);
		const hasStamp = stampBytes.some((b) => b !== 0);
		if (hasStamp) {
			this.HandshakeStamp = stampBytes;
		}

		this.OtherPartyPublicKey = respondentPublicKey;

		const OtherPartyAddressBytes = crypto.publicKeyToAddress(
			respondentPublicKey
		) as Address;

		this.OtherPartyAddress = OtherPartyAddressBytes;

		this.SharedKeyPair = crypto.importKeyPair(sharedPrivateKey) as KeyPair;

		if (this.OwnKeyPair === undefined) {
			throw new Error("could not find own key pair");
		}

		// Hybrid key exchange: ECDH + ML-KEM
		const ecdhSecret = crypto.calculateSharedSecret(
			this.OwnKeyPair.privateKey,
			respondentPublicKey
		);

		const { ciphertext, sharedSecret: mlkemSecret } =
			crypto.mlKemEncapsulate(mlkemEncapKey);

		this.MlKemCiphertext = ciphertext;

		this.SharedSecret = crypto.deriveHybridSecret(ecdhSecret, mlkemSecret);
		this.SecretCode = crypto.calculateSecretCode(this.SharedSecret);
	}

	getRespondentHandshakePayload(): Uint8Array {
		if (this.OwnKeyPair === undefined) {
			throw new Error("Could not find publickey");
		}
		if (this.MlKemCiphertext === undefined) {
			throw new Error("Could not find ML-KEM ciphertext");
		}

		// Generate ratchet DH key pair for respondent
		this.RatchetDHKeyPair = generateDHKeyPair();

		// secp256k1 pub (65) + ML-KEM ciphertext (1088) + ratchet DH pub (65)
		const payload = new Uint8Array(
			PUBLIC_KEY_BYTES + MLKEM_CIPHERTEXT_BYTES + DH_PUB_BYTES
		);
		payload.set(this.OwnKeyPair.publicKey, 0);
		payload.set(this.MlKemCiphertext, PUBLIC_KEY_BYTES);
		payload.set(this.RatchetDHKeyPair.publicKey, PUBLIC_KEY_BYTES + MLKEM_CIPHERTEXT_BYTES);
		return payload;
	}

	async sendRespondentHandshakeChunk() {
		const payload = this.getRespondentHandshakePayload();
		if (this.HandshakeStamp) {
			const issuer = new Uint8Array(20); // issuer recovered by node from sig
			const envelope = this.Swarm.unmarshalStampEnvelope(
				this.HandshakeStamp,
				issuer
			);
			await this.Swarm.writeSOCWithEnvelope(
				this.SharedKeyPair,
				0,
				payload,
				envelope
			);
		} else {
			await this.Swarm.writeSOC(this.SharedKeyPair, 0, payload);
		}
	}

	async waitForRespondentHandshakeChunk(): Promise<void> {
		if (this.SharedKeyPair === undefined) {
			throw new Error("Could not find sharedKeyPair");
		}

		let response;
		try {
			response = await this.Swarm.readSOC(this.SharedKeyPair.address, 0);
		} catch (e) {
			// throw new Error("could not find respondent handshake chunk");
		}

		//todo, timeout after a while
		if (response === undefined) {
			console.log("trying to find respondent handshake chunk");
			await sleep(this.PollMilliseconds);
			return await this.waitForRespondentHandshakeChunk();
		}

		await this.sendInitiatorHandshakeChunk();

		this.parseRespondentHandshakePayload(response.payload.toUint8Array());

		await this.createBookOfStamps();

		this.IsPollingForMessages = true;
		this.setReceiveLoop();

		return;
	}

	getInitiatorHandshakePayload(): Uint8Array {
		// todo encrypt this using something from token?
		return new Uint8Array([1]);
	}

	async sendInitiatorHandshakeChunk() {
		const payload = this.getInitiatorHandshakePayload();
		await this.Swarm.writeSOC(this.SharedKeyPair, 1, payload);
	}

	async waitForInitiatorHandshakeChunk(): Promise<void> {
		if (this.SharedKeyPair === undefined) {
			throw new Error("could not find shared key pair");
		}
		let response;
		try {
			response = await this.Swarm.readSOC(this.SharedKeyPair.address, 1);
		} catch (e) {
			// throw new Error("could not find initiator handshake chunk");
		}

		//todo, timeout after a while
		if (response === undefined) {
			console.log("trying to find initiator handshake chunk");
			await sleep(this.PollMilliseconds);
			return await this.waitForInitiatorHandshakeChunk();
		}

		await this.readBookOfStamps();

		// Initialise Double Ratchet — respondent side
		if (this.SharedSecret && this.RatchetDHKeyPair) {
			this.Ratchet = initRatchetRespondent(this.SharedSecret, this.RatchetDHKeyPair);
		}

		this.IsPollingForMessages = true;
		this.setReceiveLoop();

		return;
	}

	parseRespondentHandshakePayload(payload: Uint8Array) {
		if (this.OwnKeyPair === undefined) {
			throw new Error("could not find own key pair");
		}

		if (this.MlKemKeyPair === undefined) {
			throw new Error("could not find ML-KEM key pair");
		}

		const expectedLen = PUBLIC_KEY_BYTES + MLKEM_CIPHERTEXT_BYTES + DH_PUB_BYTES;
		if (payload.length !== expectedLen) {
			throw new Error(
				`handshake payload must be ${expectedLen} bytes, is ${payload.length}`
			);
		}

		const respondentPublicKey = Buffer.from(
			payload.slice(0, PUBLIC_KEY_BYTES)
		) as PublicKey;
		const mlkemCiphertext = payload.slice(
			PUBLIC_KEY_BYTES, PUBLIC_KEY_BYTES + MLKEM_CIPHERTEXT_BYTES
		) as MlKemCiphertext;
		const ratchetDHPub = Buffer.from(
			payload.slice(PUBLIC_KEY_BYTES + MLKEM_CIPHERTEXT_BYTES)
		);

		// Hybrid key exchange: ECDH + ML-KEM
		const ecdhSecret = crypto.calculateSharedSecret(
			this.OwnKeyPair.privateKey,
			respondentPublicKey
		);

		const mlkemSecret = crypto.mlKemDecapsulate(
			this.MlKemKeyPair.decapsulationKey,
			mlkemCiphertext
		);

		this.SharedSecret = crypto.deriveHybridSecret(ecdhSecret, mlkemSecret);
		this.SecretCode = crypto.calculateSecretCode(this.SharedSecret);

		this.OtherPartyPublicKey = respondentPublicKey;
		this.OtherPartyAddress = crypto.publicKeyToAddress(respondentPublicKey);

		// Initialise Double Ratchet — initiator ratchets against respondent's DH key
		this.Ratchet = initRatchetInitiator(this.SharedSecret, ratchetDHPub);
	}

	async createBookOfStamps() {
		if (!this.Swarm.ClientStamper) {
			return;
		}
		if (this.OtherPartyAddress === undefined) {
			throw new Error(
				"cannot create book of stamps without other party address"
			);
		}
		if (this.SharedSecret === undefined) {
			throw new Error("cannot create book of stamps without shared secret");
		}

		const plaintext = Buffer.alloc(STAMPS_PER_BOOK * STAMP_ENVELOPE_SIZE);

		for (let i = 0; i < STAMPS_PER_BOOK; i++) {
			const socAddress = this.Swarm.calculateSOCAddress(
				this.OtherPartyAddress,
				i
			);
			const envelope = this.Swarm.stampForAddress(socAddress);
			const marshalled = this.Swarm.marshalStampEnvelope(envelope);
			plaintext.set(marshalled, i * STAMP_ENVELOPE_SIZE);
		}

		// Encrypt the book — stamps are valuable
		const ivBuffer = crypto.ivFromUint(BOOK_OF_STAMPS_INDEX);
		const encrypted = await crypto.encryptBuffer(
			plaintext,
			this.SharedSecret,
			ivBuffer
		);

		await this.Swarm.writeSOC(
			this.SharedKeyPair,
			BOOK_OF_STAMPS_INDEX,
			new Uint8Array(encrypted)
		);
	}

	async readBookOfStamps() {
		if (this.SharedKeyPair === undefined) {
			throw new Error(
				"cannot read book of stamps without shared key pair"
			);
		}
		if (this.SharedSecret === undefined) {
			return;
		}

		let response;
		try {
			response = await this.Swarm.readSOC(
				this.SharedKeyPair.address,
				BOOK_OF_STAMPS_INDEX
			);
		} catch (e) {
			return;
		}

		// Decrypt the book
		const ivBuffer = crypto.ivFromUint(BOOK_OF_STAMPS_INDEX);
		const decrypted = crypto.decryptBuffer(
			Buffer.from(response.payload.toUint8Array()),
			this.SharedSecret,
			ivBuffer
		);

		const issuer = new Uint8Array(20); // issuer recovered by node from sig
		const count = Math.floor(decrypted.length / STAMP_ENVELOPE_SIZE);

		for (let i = 0; i < count; i++) {
			const offset = i * STAMP_ENVELOPE_SIZE;
			const stampBytes = decrypted.slice(
				offset,
				offset + STAMP_ENVELOPE_SIZE
			);
			const envelope = this.Swarm.unmarshalStampEnvelope(
				stampBytes,
				issuer
			);
			this.BookOfStamps.set(i, envelope);
		}
	}

	handShakeCompleted(): boolean {
		if (
			typeof this.SharedKeyPair !== undefined &&
			typeof this.OwnKeyPair !== undefined &&
			typeof this.SharedSecret !== undefined
		) {
			return true;
		} else {
			return false;
		}
	}

	serialiseMessage(index: number, messageContent: string): Message {
		return {
			index: index,
			content: messageContent,
			timestamp: Date.now(),
		};
	}

	async encryptPayload(
		message: Message,
		secret: Secret,
		iv: number
	): Promise<Buffer> {
		const payloadString = JSON.stringify(message);
		const msgBytes = Buffer.from(payloadString, "utf-8");
		const ivBuffer = crypto.ivFromUint(iv);

		if (this.Ratchet) {
			// Double Ratchet: per-message key with cleartext DH header
			const { messageKey, header } = ratchetEncrypt(this.Ratchet);
			const encBodyLen = 4096 - DH_PUB_BYTES;

			if (msgBytes.length > (encBodyLen - 2)) {
				throw new Error(`message too large (max ${encBodyLen - 2} bytes)`);
			}

			// Encrypted body: [2-byte len][message][zero padding]
			const body = Buffer.alloc(encBodyLen);
			body.writeUInt16BE(msgBytes.length, 0);
			msgBytes.copy(body, 2);

			const encryptedBody = await crypto.encryptBuffer(
				body,
				messageKey as Secret,
				ivBuffer
			);

			// Final payload: [DH header (65, cleartext)][encrypted body]
			const payload = Buffer.alloc(4096);
			Buffer.from(header).copy(payload, 0);
			encryptedBody.copy(payload, DH_PUB_BYTES);
			return payload;
		}

		// Fallback: no ratchet (legacy / restore)
		if (msgBytes.length > 2048) {
			throw new Error("message too large (max 2KB)");
		}

		const padded = Buffer.alloc(4096);
		padded.writeUInt16BE(msgBytes.length, 0);
		msgBytes.copy(padded, 2);

		const encryptedBuffer = await crypto.encryptBuffer(
			padded,
			secret,
			ivBuffer
		);

		return encryptedBuffer;
	}

	async send(messageContent: string): Promise<boolean> {
		const message = this.serialiseMessage(
			this.OwnCurrentIndex,
			messageContent
		);

		if (this.SharedSecret === undefined) {
			throw new Error("could not find shared secret");
		}

		const payload = await this.encryptPayload(
			message,
			this.SharedSecret,
			this.OwnCurrentIndex
		);

		const stampEnvelope = this.BookOfStamps.get(this.OwnCurrentIndex);
		if (stampEnvelope) {
			await this.Swarm.writeSOCWithEnvelope(
				this.OwnKeyPair,
				this.OwnCurrentIndex,
				new Uint8Array(payload),
				stampEnvelope
			);
		} else {
			await this.Swarm.writeSOC(
				this.OwnKeyPair,
				this.OwnCurrentIndex,
				new Uint8Array(payload)
			);
		}

		this.OwnConversation.messages.push(message);
		this.OwnCurrentIndex = this.OwnCurrentIndex + 1;
		return true;
	}

	deserialiseMessage(message: Message): Message {
		return {
			index: message.index,
			content: message.content,
			timestamp: message.timestamp,
		};
	}

	decryptPayload(payloadBuffer: Buffer, secret: Secret, iv: number): Message {
		const ivBuffer = crypto.ivFromUint(iv);

		if (this.Ratchet) {
			// Header is cleartext: first 65 bytes
			const header = Buffer.from(payloadBuffer.subarray(0, DH_PUB_BYTES));
			const encryptedBody = Buffer.from(payloadBuffer.subarray(DH_PUB_BYTES));

			const { messageKey } = ratchetDecrypt(this.Ratchet, header);

			const decryptedBody = crypto.decryptBuffer(
				encryptedBody,
				messageKey as Secret,
				ivBuffer
			);

			const msgLen = decryptedBody.readUInt16BE(0);
			const payloadString = decryptedBody
				.subarray(2, 2 + msgLen)
				.toString("utf-8");
			return JSON.parse(payloadString);
		}

		const decryptedBuffer = crypto.decryptBuffer(
			payloadBuffer,
			secret,
			ivBuffer
		);

		// Strip 2-byte length prefix and padding
		const msgLen = decryptedBuffer.readUInt16BE(0);
		const payloadString = decryptedBuffer
			.subarray(2, 2 + msgLen)
			.toString("utf-8");
		const message = JSON.parse(payloadString);
		return message;
	}

	setReceiveLoop() {
		setTimeout(async () => {
			if (this.IsPollingForMessages === false) {
				return;
			}
			try {
				await this.receive();
			} catch (e) {
				return;
			}
			this.setReceiveLoop();
		}, this.PollMilliseconds);
	}

	async restoreConversation(): Promise<boolean> {
		let response;
		if (this.OwnKeyPair === undefined) {
			throw new Error("could not find own key pair");
		}
		try {
			response = await this.Swarm.readSOC(
				this.OwnKeyPair.address,
				this.OwnCurrentIndex
			);
		} catch (e) {
			// console.log(
			// 	`could not find chunk at index ${this.OtherPartyCurrentIndex} with error ${e}`
			// );
			return false;
		}

		if (this.SharedSecret === undefined) {
			throw new Error("could not find shared secret");
		}

		const payload = this.decryptPayload(
			Buffer.from(response.payload.toUint8Array()),
			this.SharedSecret,
			this.OwnCurrentIndex
		);

		const message = this.deserialiseMessage(payload);

		this.OwnCurrentIndex = this.OwnCurrentIndex + 1;

		this.OwnConversation.messages.push(message);

		//fire callback
		this.DidReceiveCallback(message);

		return true;
	}

	setRestoreConversationLoop() {
		setTimeout(async () => {
			if (this.IsPollingForRestoreMessages === false) {
				return;
			}
			try {
				const found = await this.restoreConversation();
				if (!found) {
					this.IsPollingForRestoreMessages = false;
					return;
				}
			} catch (e) {
				this.IsPollingForRestoreMessages = false;
				return;
			}
			this.setRestoreConversationLoop();
		}, this.PollMilliseconds);
	}

	async receive(): Promise<boolean> {
		let response;
		try {
			response = await this.Swarm.readSOC(
				this.OtherPartyAddress,
				this.OtherPartyCurrentIndex
			);
		} catch (e) {
			// console.log(
			// 	`could not find chunk at index ${this.OtherPartyCurrentIndex} with error ${e}`
			// );
			return false;
		}

		if (this.SharedSecret === undefined) {
			throw new Error("could not find shared secret");
		}

		const payload = this.decryptPayload(
			Buffer.from(response.payload.toUint8Array()),
			this.SharedSecret,
			this.OtherPartyCurrentIndex
		);

		const message = this.deserialiseMessage(payload);

		this.OtherPartyCurrentIndex = this.OtherPartyCurrentIndex + 1;

		this.OtherPartyConversation.messages.push(message);

		//fire callback
		this.DidReceiveCallback(message);

		return true;
	}

	initialiseOwnConversation(): Conversation {
		return {
			messages: [],
		};
	}

	initialiseOtherPartyConversation(): Conversation {
		return {
			messages: [],
		};
	}

	addToConversation(
		conversation: Conversation,
		message: Message,
		index: number
	): void {
		if (conversation.messages[index] === undefined) {
			conversation.messages[index] = message;
		} else {
			throw new Error(`message with index ${index} already exists`);
		}
		return;
	}

	close() {
		this.IsPollingForMessages = false;
	}
}

export default SwapChat;
