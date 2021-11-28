// alf

let token;

test("alice session initialise", async () => {
  let session = await initialise(
    beeGateway,
    privateKey,
    connectedCallback,
    receivedCallback
  );

  token = session.token;

  session.receive(() => {
    session.received.count == 1;
    session.received[0].plainText = "hi bob";
  });

  await session.connected();

  session.send("hi bob");
});

test("barbie session initialise", async () => {
  let session = await respond(
    beeGateway,
    token,
    privateKey,
    connectedCallback,
    receivedCallback
  );

  session.received(() => {
    session.received.count == 1;
    session.received[0].plainText = "hi bob";
  });

  await session.connected();

  session.send("hi alice");
});
