import Swarm from "./swarm";
import crypto from "./crypto";

function hexToBytes(hex: string): Buffer {
	return Buffer.from(hex, "hex");
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

const PUBLIC_KEY_LENGTH = 130;
const PRIVATE_KEY_LENGTH = 64;
const ADDRESS_LENGTH = 40;
const STAMP_LENGTH = 64;
const MLKEM_ENCAP_KEY_HEX_LENGTH = 2368; // 1184 bytes
const MLKEM_CIPHERTEXT_LENGTH = 1088; // bytes
const SECP256K1_PUBKEY_LENGTH = 65; // bytes
const SHARED_SECRET_HEX_LENGTH = 64; // 32 bytes

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

	constructor(
		apiURL: string,
		didReceiveCallback: object,
		gatewayMode: boolean,
		pollMilliseconds: number
	) {
		this.Swarm = new Swarm(apiURL);
		this.DidReceiveCallback = didReceiveCallback;
		this.SecretCode = undefined;
		this.SharedSecret = undefined;
		this.OtherPartyConversation = this.initialiseOtherPartyConversation();
		this.OwnConversation = this.initialiseOwnConversation();
		this.GatewayMode = gatewayMode;
		this.PollMilliseconds = pollMilliseconds;
	}

	async restore() {
		let stamp = this.BatchID;

		if (this.GatewayMode === false) {
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

		if (this.BatchID === undefined) {
			throw new Error("Could not find stamp");
		}

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
		const stampHex = this.BatchID;

		return (
			ownAddressHex +
			ownPublicKeyHex +
			ownPrivateKeyHex +
			otherPartyPublicKeyHex +
			sharedSecretHex +
			stampHex
		);
	}

	parseRestorationToken(token: string) {
		const tokenLength =
			ADDRESS_LENGTH +
			PUBLIC_KEY_LENGTH +
			PRIVATE_KEY_LENGTH +
			PUBLIC_KEY_LENGTH +
			SHARED_SECRET_HEX_LENGTH +
			STAMP_LENGTH;

		if (token.length !== tokenLength) {
			throw new Error(
				`token must be ${tokenLength} characters long, is ${token.length}`
			);
		}

		let offset = 0;
		const ownAddressHex = token.substr(offset, ADDRESS_LENGTH);
		offset += ADDRESS_LENGTH;
		const ownPublicKeyHex = token.substr(offset, PUBLIC_KEY_LENGTH);
		offset += PUBLIC_KEY_LENGTH;
		const ownPrivateKeyHex = token.substr(offset, PRIVATE_KEY_LENGTH);
		offset += PRIVATE_KEY_LENGTH;
		const otherPartyPublicKeyHex = token.substr(offset, PUBLIC_KEY_LENGTH);
		offset += PUBLIC_KEY_LENGTH;
		const sharedSecretHex = token.substr(offset, SHARED_SECRET_HEX_LENGTH);
		offset += SHARED_SECRET_HEX_LENGTH;
		const stampHex = token.substr(offset, STAMP_LENGTH);

		this.OwnKeyPair = {
			address: hexToBytes(ownAddressHex) as Address,
			privateKey: hexToBytes(ownPrivateKeyHex) as PrivateKey,
			publicKey: hexToBytes(ownPublicKeyHex) as PublicKey,
		};

		this.OtherPartyPublicKey = hexToBytes(
			otherPartyPublicKeyHex
		) as PublicKey;

		this.SharedSecret = hexToBytes(sharedSecretHex) as Secret;

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

		if (this.BatchID !== undefined) {
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

		const privateKeyHex = this.SharedKeyPair.privateKey.toString("hex");
		const publicKeyHex = this.OwnKeyPair.publicKey.toString("hex");
		const mlkemEncapKeyHex = Buffer.from(
			this.MlKemKeyPair.encapsulationKey
		).toString("hex");

		if (privateKeyHex.length !== PRIVATE_KEY_LENGTH) {
			throw new Error(
				`privateKeyHex must be ${PRIVATE_KEY_LENGTH} characters long, is ${privateKeyHex.length}`
			);
		}

		if (publicKeyHex.length !== PUBLIC_KEY_LENGTH) {
			throw new Error(
				`publicKeyHex must be ${PUBLIC_KEY_LENGTH} characters long`
			);
		}

		if (mlkemEncapKeyHex.length !== MLKEM_ENCAP_KEY_HEX_LENGTH) {
			throw new Error(
				`mlkemEncapKeyHex must be ${MLKEM_ENCAP_KEY_HEX_LENGTH} characters long, is ${mlkemEncapKeyHex.length}`
			);
		}

		return privateKeyHex + publicKeyHex + mlkemEncapKeyHex;
	}

	async respond(token: string) {
		this.IsRespondent = true;
		this.OwnKeyPair = crypto.generateKeyPair();
		this.parseToken(token);

		if (this.BatchID !== undefined) {
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
		const expectedLength =
			PRIVATE_KEY_LENGTH + PUBLIC_KEY_LENGTH + MLKEM_ENCAP_KEY_HEX_LENGTH;

		if (token.length !== expectedLength) {
			throw new Error(
				`token must be ${expectedLength} characters long, is ${token.length}`
			);
		}

		const sharedPrivateKeyHex = token.substr(0, PRIVATE_KEY_LENGTH);
		const respondentPublicKeyHex = token.substr(
			PRIVATE_KEY_LENGTH,
			PUBLIC_KEY_LENGTH
		);
		const mlkemEncapKeyHex = token.substr(
			PRIVATE_KEY_LENGTH + PUBLIC_KEY_LENGTH,
			MLKEM_ENCAP_KEY_HEX_LENGTH
		);

		const sharedPrivateKey = hexToBytes(sharedPrivateKeyHex) as PrivateKey;
		const respondentPublicKey = hexToBytes(respondentPublicKeyHex) as PublicKey;
		const mlkemEncapKey = new Uint8Array(hexToBytes(mlkemEncapKeyHex));

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
			SECP256K1_PUBKEY_LENGTH + MLKEM_CIPHERTEXT_LENGTH
		);
		payload.set(this.OwnKeyPair.publicKey, 0);
		payload.set(this.MlKemCiphertext, SECP256K1_PUBKEY_LENGTH);
		return payload;
	}

	async sendRespondentHandshakeChunk() {
		const payload = this.getRespondentHandshakePayload();
		await this.Swarm.writeSOC(this.SharedKeyPair, 0, payload);
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

		if (payload.length !== SECP256K1_PUBKEY_LENGTH + MLKEM_CIPHERTEXT_LENGTH) {
			throw new Error(
				`handshake payload must be ${
					SECP256K1_PUBKEY_LENGTH + MLKEM_CIPHERTEXT_LENGTH
				} bytes, is ${payload.length}`
			);
		}

		const respondentPublicKey = Buffer.from(
			payload.slice(0, SECP256K1_PUBKEY_LENGTH)
		) as PublicKey;
		const mlkemCiphertext = payload.slice(
			SECP256K1_PUBKEY_LENGTH
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
		const payloadBuffer = Buffer.from(payloadString, "utf-8");

		const encryptedBuffer = await crypto.encryptBuffer(
			payloadBuffer,
			secret,
			ivBuffer
		);

		//todo check less than 4096kb
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

		await this.Swarm.writeSOC(
			this.OwnKeyPair,
			this.OwnCurrentIndex,
			new Uint8Array(payload)
		);

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
		const payloadString = decryptedBuffer.toString("utf-8");
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
