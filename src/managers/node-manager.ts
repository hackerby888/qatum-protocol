import bindings from "bindings";
import LOG from "../utils/logger";
import { SocketManager } from "./socket-manager";
import StratumEvents from "../stratum/stratum-events";
import { FIVE_SECONDS } from "../consts/time";
import { ComputorIdManager } from "./computor-id-manger";
import Platform from "../platform/exit";

interface Addon {
    initLogger: (cb: (type: string, msg: string) => void) => void;
    initSocket: (ip: string, cb: (isOk: boolean) => void) => boolean;
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
    let nodeIp = "";

    export function initLogger() {
        addon.initLogger((type: string, msg: string) => {
            // @ts-ignore
            LOG(type, msg);
        });
    }
    export async function initToNodeSocket(ip: string) {
        try {
            nodeIp = ip;
            await new Promise((resolve, reject) => {
                addon.initSocket(ip, (isOk: boolean) => {
                    if (isOk) {
                        resolve(undefined);
                    } else {
                        reject(undefined);
                        Platform.exit(1);
                    }
                });
            });

            await syncMiningSeed();
            watchMiningSeed();
        } catch (e: any) {
            LOG("error", e.message);
        }
    }

    export async function init(ip: string) {
        initLogger();
        await initToNodeSocket(ip);
    }

    export async function sendSolution(
        nonceHex: string,
        seedHex: string,
        computorId: string
    ): Promise<boolean> {
        return new Promise((resolve, reject) => {
            let ip = ComputorIdManager.getComputorId(computorId).ip;
            if (!ip) {
                reject(new Error("ip not found"));
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
                if (newSeed === "-1") {
                    return reject(new Error("failed to get new seed"));
                }
                currentSeed = newSeed;
                resolve(undefined);
            });
        });
    }

    export function watchMiningSeed() {
        let isProcessing = false;
        setInterval(async () => {
            try {
                if (isProcessing) return;

                isProcessing = true;
                let oldSeed = currentSeed;
                await syncMiningSeed();
                if (oldSeed !== currentSeed) {
                    SocketManager.broadcast(
                        StratumEvents.getNewSeedPacket(currentSeed)
                    );
                    LOG("node", "new seed: " + currentSeed);
                }
                isProcessing = false;
            } catch (e: any) {
                LOG("error", e.message);
            }
        }, FIVE_SECONDS * 2);
    }
}

export default NodeManager;
