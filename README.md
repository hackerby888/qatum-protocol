# Qatum &middot; [![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)]()

Qatum is the stratum-like protocol for qubic.

> The client and backend implementation for the Qatum protocol are included in this repository.

## Requirement

-   Nodejs
-   GCC
-   Python >= 3.12
-   AVX2 or AVX512
-   At least 2 cores server

## Run

-   npm install
-   npm run configure
-   npm run build
-   npm start

## Environment Variable

Create `.env` file on project's root folder and edit following variables

```ts
HTTP_PORT=30000
QATUM_PORT=30001
NODE_IP = "1.1.1.1"
 #your seed used to submit solution
SECRET_SEED = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
```

## Documentation

![alt text](https://imgur.com/mQLY3W7.png)

-   **Qatum Events Id**

```ts
{
        SUBSCRIBE: 1,
        NEW_COMPUTOR_ID: 2,
        NEW_SEED: 3,
        SUBMIT: 4,
        REPORT_HASHRATE: 5,
};
```

-   **Client Packet**

```ts
export namespace Client {
    export interface SubscribePacket {
        id: number;
        wallet: string;
        worker: string;
    }

    export interface SubmitPacket {
        id: number;
        nonce: string;
        seed: string;
        computorId: string;
    }

    export interface ReportHashratePacket {
        id: number;
        computorId: string;
        hashrate: number;
    }
}
```

-   **Server Packet**

```ts
export namespace Server {
    export interface SubscribePacket {
        id: number;
        result: boolean;
        error: string | null;
    }

    export interface NewComputorIdPacket {
        id: number;
        computorId: string;
    }

    export interface NewSeedPacket {
        id: number;
        seed: string;
        isEmpty: boolean;
    }

    export interface SubmitPacket {
        id: number;
        result: boolean;
        error: string | null;
    }
}
```
