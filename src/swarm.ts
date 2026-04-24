import {
	Bee,
	Identifier,
	EthAddress,
	Stamper,
	EnvelopeWithBatchId,
	BatchId,
} from "@ethersphere/bee-js";

import { KeyPair } from "./types";

const SOC_READ_TIMEOUT = 1000;

class Swarm {
	public Bee;
	public KeyPair: KeyPair | undefined;
	public BatchID: any;
	public ClientStamper: Stamper | undefined;

	constructor(apiURL: string) {
		this.Bee = new Bee(apiURL);
	}

	useClientStamp(
		signerKeyHex: string,
		batchId: string,
		depth: number,
		buckets?: Uint32Array
	) {
		if (buckets) {
			this.ClientStamper = Stamper.fromState(
				signerKeyHex,
				batchId,
				buckets,
				depth
			);
		} else {
			this.ClientStamper = Stamper.fromBlank(signerKeyHex, batchId, depth);
		}
		this.BatchID = batchId;
	}

	getStampState(): Uint32Array | undefined {
		return this.ClientStamper?.getState();
	}

	async useStamp(postageBatchId: string) {
		this.BatchID = postageBatchId;

		return this.BatchID;
	}

	async buyStamp() {
		const postageBatchId = await this.Bee.createPostageBatch(
			"1000000000",
			20
		);
		this.BatchID = postageBatchId;

		return this.BatchID;
	}

	zeroStamp() {
		this.BatchID =
			"0000000000000000000000000000000000000000000000000000000000000000";

		return this.BatchID;
	}

	makeIdentifier(index: number): Identifier {
		const topic = new Uint8Array(32);
		topic[0] = index & 0xff;
		topic[1] = (index >> 8) & 0xff;
		return new Identifier(topic);
	}

	async writeSOC(keyPair: KeyPair, index: number, data: any) {
		if (keyPair === undefined) {
			throw new Error("can only write if keypair was defined");
		}

		const identifier = this.makeIdentifier(index);
		const cac = this.Bee.makeContentAddressedChunk(new Uint8Array(data));
		const soc = cac.toSingleOwnerChunk(identifier, keyPair.privateKey);

		if (this.ClientStamper) {
			const chunkWithHash = Object.assign({}, soc, {
				hash: () => soc.address.toUint8Array(),
			});
			const envelope = this.ClientStamper.stamp(chunkWithHash as any);
			await this.Bee.uploadChunk(envelope, soc);
		} else {
			await this.Bee.uploadChunk(this.BatchID, soc);
		}

		return soc.address;
	}

	calculateSOCAddress(ownerAddress: any, index: number): Uint8Array {
		const identifier = this.makeIdentifier(index);
		const owner = new EthAddress(Buffer.from(ownerAddress));
		return this.Bee.calculateSingleOwnerChunkAddress(
			identifier,
			owner
		).toUint8Array();
	}

	stampForAddress(socAddress: Uint8Array): EnvelopeWithBatchId {
		if (!this.ClientStamper) {
			throw new Error("client stamper not configured");
		}
		const stampable = { hash: () => socAddress };
		return this.ClientStamper.stamp(stampable as any);
	}

	async writeSOCWithEnvelope(
		keyPair: KeyPair,
		index: number,
		data: any,
		envelope: EnvelopeWithBatchId
	) {
		if (keyPair === undefined) {
			throw new Error("can only write if keypair was defined");
		}

		const identifier = this.makeIdentifier(index);
		const cac = this.Bee.makeContentAddressedChunk(new Uint8Array(data));
		const soc = cac.toSingleOwnerChunk(identifier, keyPair.privateKey);

		await this.Bee.uploadChunk(envelope, soc);

		return soc.address;
	}

	marshalStampEnvelope(envelope: EnvelopeWithBatchId): Uint8Array {
		const buf = new Uint8Array(113);
		const batchIdBytes =
			envelope.batchId instanceof Uint8Array
				? envelope.batchId
				: (envelope.batchId as any).toUint8Array();
		buf.set(batchIdBytes, 0);
		buf.set(envelope.index, 32);
		buf.set(envelope.timestamp, 40);
		buf.set(envelope.signature, 48);
		return buf;
	}

	unmarshalStampEnvelope(
		data: Uint8Array,
		issuer: Uint8Array
	): EnvelopeWithBatchId {
		return {
			batchId: new BatchId(data.slice(0, 32)),
			index: data.slice(32, 40),
			timestamp: data.slice(40, 48),
			signature: data.slice(48, 113),
			issuer: issuer,
		} as EnvelopeWithBatchId;
	}

	async readSOC(address: any, index: number) {
		const identifier = this.makeIdentifier(index);
		const ownerAddress = new EthAddress(Buffer.from(address));

		const socAddress = this.Bee.calculateSingleOwnerChunkAddress(
			identifier,
			ownerAddress
		);

		const data = await this.Bee.downloadChunk(socAddress, {
			timeoutMs: SOC_READ_TIMEOUT,
		});

		const soc = this.Bee.unmarshalSingleOwnerChunk(data, socAddress);

		return soc;
	}
}

export default Swarm;
