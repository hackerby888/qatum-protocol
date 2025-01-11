import bindings from "bindings";
import LOG from "../utils/logger";
import { SocketManager } from "./socket-manager";
import QatumEvents from "../qatum/qatum-events";
import { FIVE_SECONDS, ONE_SECOND } from "../consts/time";
import { ComputorIdManager } from "./computor-id-manger";
import Platform from "../platform/exit";
import { md5 } from "hash-wasm";
import { SolutionManager } from "./solution-manager";
import { Solution, SolutionData, SolutionResult } from "../types/type";
import os from "os";

interface Addon {
    initLogger: (cb: (type: string, msg: string) => void) => void;
    initSocket: (ip: string, cb: (isOk: boolean) => void) => boolean;
    getMiningCurrentMiningSeed: (cb: (miningSeed: string) => void) => void;
    sendSolution: (
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
    let gthreads = 0;

    let solutionsToSubmitQueue: Solution[] = [];

    export let initedVerifyThread: boolean = false;

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
                        LOG("error", "failed to connect to node");
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

    export function watchAndSubmitSolution() {
        let isProcessing = false;
        setInterval(async () => {
            if (isProcessing) return;
            let solution = solutionsToSubmitQueue.shift();
            try {
                isProcessing = true;
                if (solution) {
                    await sendSolution(
                        solution.nonce,
                        solution.seed,
                        solution.computorId
                    );
                    LOG("node", `solution submitted: ${solution.md5Hash}`);
                }
                isProcessing = false;
            } catch (e: any) {
                if (solution) solutionsToSubmitQueue.push(solution);
                isProcessing = false;
                LOG("error", e.message);
            }
        }, FIVE_SECONDS);
    }

    export function handleOnVerifiedSolution(
        { md5Hash, isSolution }: SolutionResult = {
            md5Hash: "",
            isSolution: false,
        },
        fromCluster: boolean = false
    ) {
        if (!md5Hash) return;
        if (md5Hash.length > 32) {
            md5Hash = md5Hash.slice(0, 32);
        }
        LOG(
            fromCluster ? "cluster" : "node",
            "verifed solution: " + md5Hash + " isSolution " + isSolution
        );
        let theSolution =
            SolutionManager.getSolutionFromVerifying(md5Hash) ||
            SolutionManager.getSolutionFromClusterVerifying(md5Hash);

        if (theSolution) {
            if (isSolution) solutionsToSubmitQueue.push(theSolution);

            SolutionManager.markAsVerified(md5Hash, isSolution);
        }
    }

    export function initVerifyThread(threads: number) {
        gthreads = threads;
        LOG("node", "init verify thread with " + threads + " threads");
        addon.initVerifyThread(threads, handleOnVerifiedSolution);
        setTimeout(() => {
            initedVerifyThread = true;
        }, ONE_SECOND * 5);
    }

    export function restartVerifyThread() {
        stopVerifyThread();
        initedVerifyThread = false;
        initVerifyThread(gthreads);
    }

    export async function init(ip: string, secretSeed: string) {
        LOG("node", "init node manager");
        currentSecretSeed = secretSeed;
        watchAndSubmitSolution();
        initLogger();
        initVerifyThread(
            Number(process.env.MAX_VERIFICATION_THREADS) || os.cpus().length
        );
        await initToNodeSocket(ip);
    }

    export async function sendSolution(
        nonceHex: string,
        seedHex: string,
        computorId: string
    ): Promise<boolean> {
        return new Promise((resolve, reject) => {
            let ip = ComputorIdManager.getComputorId(computorId).ip || nodeIp;
            if (!ip) {
                return reject(new Error("ip to submit not found"));
            }
            addon.sendSolution(
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
        let failedCount = 0;
        setInterval(async () => {
            try {
                if (isProcessing) return;

                isProcessing = true;
                let oldSeed = currentMiningSeed;
                await syncMiningSeed();
                if (oldSeed !== currentMiningSeed) {
                    SocketManager.broadcast(
                        QatumEvents.getNewSeedPacket(currentMiningSeed)
                    );
                    LOG("node", "new seed: " + currentMiningSeed);
                }
                isProcessing = false;
                failedCount = 0;
            } catch (e: any) {
                if (failedCount > 3) LOG("warning", e.message);
            }
        }, FIVE_SECONDS * 2);
    }
}

export default NodeManager;
