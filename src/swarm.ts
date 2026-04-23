import { Bee, Identifier, EthAddress, Stamper } from "@ethersphere/bee-js";

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

	useClientStamp(signerKeyHex: string, batchId: string, depth: number) {
		this.ClientStamper = Stamper.fromBlank(signerKeyHex, batchId, depth);
		this.BatchID = batchId;
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
