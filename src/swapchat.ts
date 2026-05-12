import Swarm from "./swarm";
import crypto from "./crypto";

function hexToBytes(hex: string): Buffer {
	return Buffer.from(hex, "hex");
}

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
const STAMP_HEX_LENGTH = 64;
const MLKEM_ENCAP_KEY_BYTES = 1184;
const MLKEM_CIPHERTEXT_BYTES = 1088;

// Book of stamps
const BOOK_OF_STAMPS_INDEX = 2; // handshake uses 0 and 1
const STAMP_ENVELOPE_SIZE = 113; // batchId(32) + index(8) + timestamp(8) + sig(65)
const STAMPS_PER_BOOK = Math.floor(4096 / STAMP_ENVELOPE_SIZE); // 36

// Token: sharedPrivKey(32) + initiatorPubKey(65) + mlkemEncapKey(1184) + handshakeStamp(113) = 1394 bytes
const TOKEN_BYTES =
	PRIVATE_KEY_BYTES + PUBLIC_KEY_BYTES + MLKEM_ENCAP_KEY_BYTES + STAMP_ENVELOPE_SIZE;

// Restoration token is hex-encoded:
// addr(40) + pub(130) + priv(64) + otherPub(130) + secret(64) + stamp(64) = 492
const ADDRESS_HEX_LENGTH = 40;
const PUBLIC_KEY_HEX_LENGTH = 130;
const PRIVATE_KEY_HEX_LENGTH = 64;
const SHARED_SECRET_HEX_LENGTH = 64;

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

		this.IsPollingForRestoreMessages = true;
		this.setRestoreConversationLoop();
	}

	getRestorationToken() {
		if (
			this.OwnKeyPair === undefined ||
			this.OtherPartyPublicKey === undefined
		) {
			throw new Error("Could not find key pairs");
		}

		const stampHex = this.BatchID ||
			"0000000000000000000000000000000000000000000000000000000000000000";

		if (this.SharedSecret === undefined) {
			throw new Error("Could not find shared secret");
		}

		const ownAddressHex = this.OwnKeyPair.address.toString("hex");
		const ownPublicKeyHex = this.OwnKeyPair.publicKey.toString("hex");
		const ownPrivateKeyHex = this.OwnKeyPair.privateKey.toString("hex");
		const otherPartyPublicKeyHex = Buffer.from(
			this.OtherPartyPublicKey
		).toString("hex");
		const sharedSecretHex = Buffer.from(this.SharedSecret).toString("hex");

		const sharedAddressHex = this.SharedKeyPair
			? this.SharedKeyPair.address.toString("hex")
			: "0000000000000000000000000000000000000000";

		return (
			ownAddressHex +
			ownPublicKeyHex +
			ownPrivateKeyHex +
			otherPartyPublicKeyHex +
			sharedSecretHex +
			sharedAddressHex +
			stampHex
		);
	}

	parseRestorationToken(token: string) {
		const tokenLength =
			ADDRESS_HEX_LENGTH +
			PUBLIC_KEY_HEX_LENGTH +
			PRIVATE_KEY_HEX_LENGTH +
			PUBLIC_KEY_HEX_LENGTH +
			SHARED_SECRET_HEX_LENGTH +
			ADDRESS_HEX_LENGTH +
			STAMP_HEX_LENGTH;

		if (token.length !== tokenLength) {
			throw new Error(
				`token must be ${tokenLength} characters long, is ${token.length}`
			);
		}

		let offset = 0;
		const ownAddressHex = token.substr(offset, ADDRESS_HEX_LENGTH);
		offset += ADDRESS_HEX_LENGTH;
		const ownPublicKeyHex = token.substr(offset, PUBLIC_KEY_HEX_LENGTH);
		offset += PUBLIC_KEY_HEX_LENGTH;
		const ownPrivateKeyHex = token.substr(offset, PRIVATE_KEY_HEX_LENGTH);
		offset += PRIVATE_KEY_HEX_LENGTH;
		const otherPartyPublicKeyHex = token.substr(offset, PUBLIC_KEY_HEX_LENGTH);
		offset += PUBLIC_KEY_HEX_LENGTH;
		const sharedSecretHex = token.substr(offset, SHARED_SECRET_HEX_LENGTH);
		offset += SHARED_SECRET_HEX_LENGTH;
		const sharedAddressHex = token.substr(offset, ADDRESS_HEX_LENGTH);
		offset += ADDRESS_HEX_LENGTH;
		const stampHex = token.substr(offset, STAMP_HEX_LENGTH);

		this.OwnKeyPair = {
			address: hexToBytes(ownAddressHex) as Address,
			privateKey: hexToBytes(ownPrivateKeyHex) as PrivateKey,
			publicKey: hexToBytes(ownPublicKeyHex) as PublicKey,
		};

		this.OtherPartyPublicKey = hexToBytes(
			otherPartyPublicKeyHex
		) as PublicKey;

		this.SharedSecret = hexToBytes(sharedSecretHex) as Secret;

		// Restore SharedKeyPair address for book of stamps re-read
		const sharedAddr = hexToBytes(sharedAddressHex);
		const hasSharedAddr = sharedAddr.some((b: number) => b !== 0);
		if (hasSharedAddr) {
			this.SharedKeyPair = {
				address: sharedAddr as Address,
			} as KeyPair;
		}

		this.BatchID = stampHex;
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
		} else if (this.GatewayMode === false) {
			this.BatchID = await this.Swarm.buyStamp();
		} else {
			this.BatchID = this.Swarm.zeroStamp();
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
		} else if (this.GatewayMode === false) {
			this.BatchID = await this.Swarm.buyStamp();
		} else {
			this.BatchID = this.Swarm.zeroStamp();
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
		// Concatenate secp256k1 public key (65 bytes) + ML-KEM ciphertext (1088 bytes)
		const payload = new Uint8Array(
			PUBLIC_KEY_BYTES + MLKEM_CIPHERTEXT_BYTES
		);
		payload.set(this.OwnKeyPair.publicKey, 0);
		payload.set(this.MlKemCiphertext, PUBLIC_KEY_BYTES);
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

		if (payload.length !== PUBLIC_KEY_BYTES + MLKEM_CIPHERTEXT_BYTES) {
			throw new Error(
				`handshake payload must be ${
					PUBLIC_KEY_BYTES + MLKEM_CIPHERTEXT_BYTES
				} bytes, is ${payload.length}`
			);
		}

		const respondentPublicKey = Buffer.from(
			payload.slice(0, PUBLIC_KEY_BYTES)
		) as PublicKey;
		const mlkemCiphertext = payload.slice(
			PUBLIC_KEY_BYTES
		) as MlKemCiphertext;

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
		const ivBuffer = crypto.ivFromUint(iv);
		const payloadString = JSON.stringify(message);
		const msgBytes = Buffer.from(payloadString, "utf-8");

		if (msgBytes.length > 2048) {
			throw new Error("message too large (max 2KB)");
		}

		// 2-byte length prefix + message + zero padding to 4096
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
