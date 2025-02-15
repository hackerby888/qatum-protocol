> Qatum use `\n` as the delimiter for packets

### Step 1

Open TCP socket to Qatum server

> Public Qatum server is : server.qatum.org:7777
> Rate limit for public server is : 10 packets / 1 second

### Step 2

Send a `SubscribePacket` packet

```ts
{
        id: 1,
        wallet: "your qubic wallet", // string : 60 uppercase characters qubic id
        worker: "your worker name", // string
}
```

Server will response with `SubscribePacket  (Response)`

```ts
{
    id: 1;
    result: true; // true | false : if result is false, qatum communication ends here
    error: null; // string | null : error message if there is a error
}
```

These three packets will be sent by the server as well if it responds to the `SubscribePacket` with `result: true`.

```ts
// NewDifficultyPacket
{
    id: 6;
    difficulty: 123; // number : solution threshold that the client will use to determine whether or not a nonce is valid to the pool
}
```

```ts
// NewComputorIdPacket
{
    id: 2;
    computorId: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; // string : the computor id that client need to work on
}
```

```ts
// NewSeedPacket
{
    id: 3;
    seed: "81fc8bb834fb7e50bedb54609b25258eeba39a6be69ebbbd8982121d7639b95b"; // string : hex format of seed (32 bytes)
    isEmpty: false; // true | false : if true then we are in idle phrase
}
```

After that, the server will send `NewSeedPacket` or `NewComputorIdPacket` or `NewDifficultyPacket` for clients when pool require.

### Step 3

When the client found a nonce, they should submit to the pool immediately using `SubmitPacket`

```ts
{
    id: 4;
    nonce: "81fc8bb834fb7e50bedb54609b25258eeba39a6be69ebbbd8982121d7639b95b"; // string : hex format of nonce (32 bytes)
    seed: "81fc8bb834fb7e50bedb54609b25258eeba39a6be69ebbbd8982121d7639b95b"; // string : hex format of seed (32 bytes)
    computorId: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; // string : computor id that the nonce belongs to
}
```

### Step 4

The client should report their hashrate to the pool periodically, ideally is every 3 minues using `ReportHashratePacket`

```ts
{
    id: 5;
    computorId: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; // string, the computor id that the client is working on
    hashrate: 123; // number, current client hashrate
}
```
