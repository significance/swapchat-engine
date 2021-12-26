// a

import SwapChat from "./src/swapchat";

const apiURL = "http://localhost:1633";
const debugURL = "http://localhost:1635";

const swapChatA = new SwapChat(apiURL, debugURL, console.log);

let sessionA;
swapChatA.initiate().then((a) => {
	sessionA = a;
	return sessionA.getToken();
});

sessionA.getToken();

sessionA.waitForRespondentHandshakeChunk().then(console.log);

let message_A_0 = "hello world one";

await sessionA.send(message_A_0);

// b

import SwapChat from "./src/swapchat";

const apiURL = "http://localhost:1633";
const debugURL = "http://localhost:1635";

const swapChatB = new SwapChat(apiURL, debugURL, console.log);
let sessionB;
swapChatB.respond(token).then((b) => {
	sessionB = b;
});

await sessionB.waitForInitiatorHandshakeChunk();

const index_B_0 = 0;
const message_B_0 = "hello world too";

await sessionA.send(message_B_0);
