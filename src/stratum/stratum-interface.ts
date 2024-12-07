namespace StratumInterface {
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
    }

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
}
export default StratumInterface;
