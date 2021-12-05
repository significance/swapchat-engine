import { Bee, BeeDebug, Utils } from "@ethersphere/bee-js";

import { Bytes, KeyPair } from "./types";

// import { makeBytes } from "./utils";

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
	}

	async buyStamp() {
		const postageBatchId = await this.BeeDebug.createPostageBatch(
			"100",
			17
		);
		this.BatchID = postageBatchId;
	}

	async writeSOC(index: number, data: any) {
		const topic = Buffer.alloc(32);
		topic.writeUInt16LE(index, 0);

		if (this.KeyPair === undefined) {
			throw new Error("can only write if keypair was defined");
		}

		let socWriter = this.Bee.makeSOCWriter(this.KeyPair.privateKey);

		//what is the desired way to deal with this? :D
		type Identifier = Bytes<32>;
		const topicBytes: Identifier = Utils.hexToBytes(topic.toString("hex"));
		console.log("write", index, topicBytes, data);
		return await socWriter.upload(this.BatchID, topicBytes, data);
	}

	async readSOC(address: any, index: number) {
		let socReader = this.Bee.makeSOCReader(address);

		const topic = Buffer.alloc(32);
		topic.writeUInt16LE(index, 0);

		//what is the desired way to deal with this? :D
		type Identifier = Bytes<32>;
		const topicBytes: Identifier = Utils.hexToBytes(topic.toString("hex"));
		console.log("read", index, topicBytes);
		let response = await socReader.download(topicBytes);
		console.log(index, "X", response.payload());

		return response.payload();
	}
}

export default Swarm;
