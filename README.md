# Qatum &middot; [![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)]()

Qatum is the stratum-like mining protocol for qubic.

> The backend implementation for the Qatum protocol are included in this repository.

> The client implementation can be found here https://github.com/hackerby888/Qiner.

## Documentation

The documentation is divided into several sections:

-   [How to interact with Qatum protocol](./docs/how-to-interact-with-qatum.md)
-   [How to host your own Qatum server](./docs/how-to-host-your-own-qatum-server.md)

## Qatum Flow

![alt text](https://imgur.com/bT8K9Es.png)

## Qatum Events Id

```ts
{
        SUBSCRIBE: 1,
        NEW_COMPUTOR_ID: 2,
        NEW_SEED: 3,
        SUBMIT: 4,
        REPORT_HASHRATE: 5,
        NEW_DIFFICULTY: 6
};
```

## Client Packet

```ts
SubscribePacket {
        id: number;
        wallet: string;
        worker: string;
    }

SubmitPacket {
        id: number;
        nonce: string;
        seed: string;
        computorId: string;
    }

ReportHashratePacket {
        id: number;
        computorId: string;
        hashrate: number;
    }
```

## Server Packet

```ts
SubscribePacket {
        id: number;
        result: boolean;
        error: string | null;
    }

NewComputorIdPacket {
        id: number;
        computorId: string;
    }

NewSeedPacket {
        id: number;
        seed: string;
        isEmpty: boolean;
    }

SubmitPacket {
        id: number;
        result: boolean;
        error: string | null;
    }

NewDifficultyPacket {
        id: number;
        difficulty: number;
    }
```

## Technical Support

- Discord: [Feiyu .IV](https://discordapp.com/users/1222420225258164296)
- Telegram: [Nevermine](https://t.me/nevermineio)(@nevermineio)
