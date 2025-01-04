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
#main or verify
MODE = "main"
MAX_VERIFICATION_THREADS = 1
HTTP_PORT = 3000
QATUM_PORT = 3001
CLUSTER_PORT = 3002
NODE_IP = "1.1.1.1"
 #your qubic secret seed used to submit solution
SECRET_SEED = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

#only set when MODE = "verify"
CLUSTER_MAIN_SERVER = "host:port"
```

## Documentation

![alt text](https://imgur.com/mQLY3W7.png)

This software can be ran as two modes

-   **main**: Your server will be a pool that miner can connect and mining
-   **verify**: Your server will help the main server speed up verification process, miners can't connect to this server and mining

*   **Qatum Events Id**

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
