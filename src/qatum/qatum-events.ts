import QatumInterface from "./qatum-interface";

namespace QatumEvents {
    export const DELIMITER = "\n";
    export const eventsId = {
        SUBSCRIBE: 1,
        NEW_COMPUTOR_ID: 2,
        NEW_SEED: 3,
        SUBMIT_RESULT: 4,
        REPORT_HASHRATE: 5,
    };

    export function getAcceptedSubscribePacket(
        result: boolean,
        error: string | null
    ): string {
        let packet: QatumInterface.Server.SubscribePacket = {
            id: eventsId.SUBSCRIBE,
            result,
            error,
        };
        return JSON.stringify(packet) + DELIMITER;
    }

    export function getNewComputorIdPacket(computorId: string): string {
        let packet: QatumInterface.Server.NewComputorIdPacket = {
            id: eventsId.NEW_COMPUTOR_ID,
            computorId,
        };
        return JSON.stringify(packet) + DELIMITER;
    }

    export function getNewSeedPacket(seed: string): string {
        let packet: QatumInterface.Server.NewSeedPacket = {
            id: eventsId.NEW_SEED,
            seed,
            isEmpty: parseInt(seed) === 0,
        };
        return JSON.stringify(packet) + DELIMITER;
    }

    export function getSubmitResultPacket(
        result: boolean,
        error?: string
    ): string {
        let packet: QatumInterface.Server.SubmitResultPacket = {
            id: eventsId.SUBMIT_RESULT,
            result,
            error: error || null,
        };
        return JSON.stringify(packet) + DELIMITER;
    }
}

export default QatumEvents;
