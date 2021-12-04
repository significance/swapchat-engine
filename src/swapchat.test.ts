// alf

let token;

test("alan session initialise", async () => {
  const session = await initialise(beeGateway);

  token = session.getToken();

  session.receive(() => {
    session.received.count == 1;
    session.received[0].plainText = "hi alan";
  });

  await session.connected();

  session.send("hi becky");
});

test("becky session initialise", async () => {
  let session = await respond(beeGateway, token);

  session.received(() => {
    session.received.count == 1;
    session.received[0].plainText = "hi becky";
  });

  await session.connected();

  session.send("hi alan");
});
