import { Bee, BeeDebug, Utils } from "@ethersphere/bee-js";

import { Bytes, KeyPair } from "./types";

class Swarm {
	public Bee;
	public BeeDebug;
	public KeyPair: KeyPair | undefined;
	public BatchID: any;
	public SocWriter: any;

	constructor(gateway: string, keyPair?: KeyPair) {
		this.Bee = new Bee(gateway);
		this.BeeDebug = new BeeDebug(gateway);
		if (keyPair) {
			this.KeyPair = keyPair;
		}
		console.log(this.SocWriter);
	}

	async buyStamp() {
		const postageBatchId = await this.BeeDebug.createPostageBatch(
			"100",
			17
		);
		this.BatchID = postageBatchId;
	}

	async writeSOC(index: number, data: any) {
		// const topic = Buffer.alloc(32);
		// topic.writeUInt16BE(index, 0);

		if (this.KeyPair === undefined) {
			throw new Error("can only write if keypair was defined");
		}

		let socWriter = this.Bee.makeSOCWriter(this.KeyPair.privateKey);

		type Identifier = Bytes<32>;

		const topic: Identifier = Utils.hexToBytes(
			"0000000000000000000000000000000000000000000000000000000000000000"
		);

		console.log("still not used index", index);

		return await socWriter.upload(this.BatchID, topic, data);
	}

	async readSOC(address: any, index: number) {
		let socReader = this.Bee.makeSOCReader(address);

		// const topic = Buffer.alloc(32);
		// topic.writeUInt16BE(index, 0);

		type Identifier = Bytes<32>;

		const topic: Identifier = Utils.hexToBytes(
			"0000000000000000000000000000000000000000000000000000000000000000"
		);

		console.log("still not used index", index);

		let response = await socReader.download(topic);

		return response.payload();
	}
}

export default Swarm;
