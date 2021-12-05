// alf

let token;

test("alan session initialise", async () => {
  const session = await initialise(beeGateway);

  //create own keypair
  //create shared keypair
  //prepare token (shared keypair privatekey, own publickey)

  token = session.getToken();

  //set up received callback
  session.receive(() => {
    session.received.count == 1;
    session.received[0].plainText = "hi alan";
  });

  //check index 0 of shared feed on timer, if index 0 is noted and receipient public key is retrieved, shared secret is calculated, index 1 is sent as ack
  await session.connected();

  session.send("hi becky");
});

test("becky session initialise", async () => {
  let session = await respond(beeGateway, token);
  //create own keypair
  //shared secret is calculated
  //prepare chunk for index 0 of shared feed, send chunk

  //set up received callback
  session.received(() => {
    session.received.count == 1;
    session.received[0].plainText = "hi becky";
  });

  //check index 1 of shared feed on timer, if index 1 is noted, connected
  await session.connected();

  session.send("hi alan");
});
