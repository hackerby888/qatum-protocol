# Qatum &middot; [![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/facebook/react/blob/main/LICENSE) [![npm version](https://img.shields.io/npm/v/react.svg?style=flat)]()

Qatum is the stratum-like protocol for qubic.

## Requirement

-   Nodejs
-   GCC
-   Python >= 3.12
-   AVX2 or AVX512
-   At least 2 cores server

## Run

-   npm i
-   npm run configure
-   npm run build
-   npm start

## Environment Variable

```ts
# create .env file on project's root folder and paste following variables
HTTP_PORT=30000
STRATUM_PORT=30001
NODE_IP = "1.1.1.1"
SECRET_SEED = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" #used to submit solution
```

## Documentation

![alt text](https://i.ibb.co/Jq70KKq/qatum.png)

-   **Qatum Events Id**

```ts
{
        SUBSCRIBE: 1,
        NEW_COMPUTOR_ID: 2,
        NEW_SEED: 3,
        SUBMIT_RESULT: 4,
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
        nonce: string; //hex format
        seed: string; //hex format
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

    export interface SubmitResultPacket {
        id: number;
        result: boolean;
    }
}
```
