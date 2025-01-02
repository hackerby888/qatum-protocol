import bindings from "bindings";
import LOG from "../utils/logger";
import { SocketManager } from "./socket-manager";
import StratumEvents from "../stratum/stratum-events";
import { FIVE_SECONDS } from "../consts/time";
import { ComputorIdManager } from "./computor-id-manger";
import Platform from "../platform/exit";
import { md5 } from "hash-wasm";
import { SolutionManager } from "./solution-manager";

interface SolutionResult {
    md5Hash: string;
    isSolution: boolean;
}
interface Addon {
    initLogger: (cb: (type: string, msg: string) => void) => void;
    initSocket: (ip: string, cb: (isOk: boolean) => void) => boolean;
    getMiningCurrentMiningSeed: (cb: (miningSeed: string) => void) => void;
    sendSol: (
        ip: string,
        nonce: string,
        miningSeed: string,
        id: string,
        secretSeed: string,
        cb: (isOK: boolean) => void
    ) => boolean;
    stopVerifyThread: () => void;
    initVerifyThread: (
        threads: number,
        cb: ({ md5Hash, isSolution }: SolutionResult) => void
    ) => void;
    pushSolutionToVerifyQueue: (
        seed: string,
        nonce: string,
        computorId: string,
        md5Hash: string
    ) => void;
}
let addon: Addon = bindings("q");

namespace NodeManager {
    export let internalAddon = addon;
    // this seed is used to mine
    let currentMiningSeed = "";
    //this seed is used to submit solution
    let currentSecretSeed = "";
    let nodeIp = "";

    export function stopVerifyThread() {
        LOG("node", "stopping verify thread");
        addon.stopVerifyThread();
    }

    export async function pushSolutionToVerifyQueue(
        seed: string,
        nonce: string,
        computorId: string,
        md5Hash: string
    ) {
        addon.pushSolutionToVerifyQueue(seed, nonce, computorId, md5Hash);
    }

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

    export function initVerifyThread(threads: number) {
        LOG("node", "init verify thread with " + threads + " threads");
        addon.initVerifyThread(
            threads,
            ({ md5Hash, isSolution }: SolutionResult) => {
                SolutionManager.markAsVerifed(md5Hash, isSolution);
            }
        );
    }

    export async function init(ip: string, secretSeed: string) {
        LOG("node", "init node manager");
        currentSecretSeed = secretSeed;
        initVerifyThread(4);
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
                //   return reject(new Error("ip not found"));
            }
            addon.sendSol(
                ip,
                nonceHex,
                seedHex,
                computorId,
                currentSecretSeed,
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
        return currentMiningSeed;
    }

    export async function syncMiningSeed() {
        return new Promise((resolve, reject) => {
            addon.getMiningCurrentMiningSeed((newSeed: string) => {
                if (newSeed === "-1") {
                    return reject(new Error("failed to get new seed"));
                }
                currentMiningSeed = newSeed;
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
                let oldSeed = currentMiningSeed;
                await syncMiningSeed();
                if (oldSeed !== currentMiningSeed) {
                    SocketManager.broadcast(
                        StratumEvents.getNewSeedPacket(currentMiningSeed)
                    );
                    LOG("node", "new seed: " + currentMiningSeed);
                }
                isProcessing = false;
            } catch (e: any) {
                LOG("error", e.message);
            }
        }, FIVE_SECONDS * 2);
    }
}

export default NodeManager;
