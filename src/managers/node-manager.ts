import bindings from "bindings";
import LOG from "../utils/logger";
import { SocketManager } from "./socket-manager";
import StratumEvents from "../stratum/stratum-events";
import { FIVE_SECONDS } from "../consts/time";
import { ComputorIdManager } from "./computor-id-manger";

interface Addon {
    initSocket: (ip: string) => boolean;
    getMiningCurrentMiningSeed: (cb: (seed: string) => void) => void;
    sendSol: (
        ip: string,
        nonce: string,
        seed: string,
        id: string,
        cb: (isOK: boolean) => void
    ) => boolean;
}
let addon: Addon = bindings("q");

namespace NodeManager {
    export let internalAddon = addon;
    let currentSeed = "";
    export async function initToNodeSocket(ip: string) {
        let isOk = addon.initSocket(ip);
        if (!isOk) {
            LOG("error", "failed to connect to qubic node");
            process.exit(1);
        }
        await syncMiningSeed();

        watchMiningSeed();
    }

    export async function sendSolution(
        nonceHex: string,
        seedHex: string,
        computorId: string
    ): Promise<boolean> {
        return new Promise((resolve, reject) => {
            let ip = ComputorIdManager.getComputorId(computorId).ip;
            if (!ip) {
                reject(false);
            }
            addon.sendSol(
                ip,
                nonceHex,
                seedHex,
                computorId,
                (isOK: boolean) => {
                    if (isOK) {
                        resolve(isOK);
                    } else {
                        reject(isOK);
                    }
                }
            );
        });
    }

    export function getMiningSeed() {
        return currentSeed;
    }

    export async function syncMiningSeed() {
        return new Promise((resolve, reject) => {
            addon.getMiningCurrentMiningSeed((newSeed: string) => {
                currentSeed = newSeed;
                resolve(undefined);
            });
        });
    }

    export function watchMiningSeed() {
        setInterval(async () => {
            let oldSeed = currentSeed;
            await syncMiningSeed();
            if (oldSeed !== currentSeed) {
                SocketManager.broadcast(
                    StratumEvents.getNewSeedPacket(currentSeed)
                );
                LOG("node", "new seed: " + currentSeed);
            }
        }, FIVE_SECONDS);

        setInterval(() => {
            LOG("node", "seed ttt");
        }, 500);
    }
}

export default NodeManager;
