import bindings from "bindings";
import LOG from "../utils/logger";
import { SocketManager } from "./socket-manager";
import QatumEvents from "../qatum/qatum-events";
import { FIVE_SECONDS, ONE_MINUTE, ONE_SECOND } from "../consts/time";
import Platform from "../platform/platform";
import { SolutionManager } from "./solution-manager";
import {
    DifficultyConfig,
    PaymentQutilData,
    Solution,
    SolutionResult,
} from "../types/type";
import fs from "fs";
import os from "os";
import { DATA_PATH } from "../consts/path";
import QatumDb from "../database/db";
import Explorer from "../utils/explorer";

interface Addon {
    initLogger: (cb: (type: string, msg: string) => void) => void;
    initSocket: (ip: string, cb: (isOk: boolean) => void) => boolean;
    getMiningCurrentMiningSeed: (
        ip: string,
        cb: (miningSeed: string, tick: number) => void
    ) => void;
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
        cb: ({ md5Hash, resultScore }: SolutionResult) => void
    ) => void;
    pushSolutionToVerifyQueue: (
        seed: string,
        nonce: string,
        computorId: string,
        md5Hash: string
    ) => void;
    checkScore: (score: number, threshold: number) => boolean;
    pay: (
        ip: string,
        paymentCsvString: string,
        secretSeed: string,
        cb: (tick: number, txhash: string) => void
    ) => void;
}
let addon: Addon = bindings("q");

namespace NodeManager {
    export let internalAddon = addon;
    // this seed is used to mine
    let currentMiningSeed = "";
    //this seed is used to submit solution
    let currentSecretSeed = "";
    export let nodeIps: string[] = [];
    export let nodeIpsInactive: string[] = [];
    let nodeIpsFailedMap: { [key: string]: number } = {};
    let gthreads = 0;
    const MAX_TICK_BEHIND = 20;
    const MAX_FAILED_GET_SEED = 10;

    let RELIABLE_NODES_API = "";

    export let lastSuccessSyncSeed = {
        real: Date.now(),
        fake: Date.now(),
    };
    export let lastHighestTick = 0;

    let isDiskLoaded = false;

    export let difficulty: DifficultyConfig = {
        pool: Number(process.env.INITIAL_POOL_DIFFICULTY),
        net: Number(process.env.INITIAL_NET_DIFFICULTY),
    };

    export let solutionsToSubmitQueue: Solution[] = [];

    export let initedVerifyThread: boolean = false;

    export async function saveData() {
        if (!isDiskLoaded) return;
        await saveToDisk();
        await saveToDb();
    }

    export async function saveToDb() {
        await QatumDb.getPoolConfigCollection()?.updateOne(
            {
                type: "difficulty",
            },
            {
                $set: {
                    ...difficulty,
                },
            },
            {
                upsert: true,
            }
        );

        await QatumDb.getPoolConfigCollection()?.updateOne(
            {
                type: "nodeips",
            },
            {
                $set: {
                    nodeIps,
                    nodeIpsInactive,
                },
            },
            {
                upsert: true,
            }
        );
    }

    export async function saveToDisk() {
        try {
            fs.writeFileSync(
                `${DATA_PATH}/difficulty.json`,
                JSON.stringify(difficulty)
            );

            fs.writeFileSync(
                `${DATA_PATH}/solutionsToSubmitQueue.json`,
                JSON.stringify(solutionsToSubmitQueue)
            );

            fs.writeFileSync(
                `${DATA_PATH}/nodeips.json`,
                JSON.stringify({
                    nodeIps,
                    nodeIpsInactive,
                })
            );
        } catch (error) {
            LOG(
                "error",
                `NodeManager.saveToDisk: failed to save difficulty or solutionsToSubmitQueue to disk ${error}`
            );
        }
    }

    export async function loadData() {
        await loadFromDisk();
        await loadFromDb();

        isDiskLoaded = true;
    }

    export async function loadFromDb() {
        let dbDifficulty = (await QatumDb.getPoolConfigCollection()?.findOne(
            {
                type: "difficulty",
            },
            {
                projection: {
                    _id: 0,
                    type: 0,
                },
            }
        )) as any as DifficultyConfig;

        if (dbDifficulty) {
            difficulty = {
                ...difficulty,
                ...dbDifficulty,
            };
        }

        let dbNodeIps = (await QatumDb.getPoolConfigCollection()?.findOne(
            {
                type: "nodeips",
            },
            {
                projection: {
                    _id: 0,
                    type: 0,
                },
            }
        )) as any;

        if (dbNodeIps) {
            nodeIps = dbNodeIps.nodeIps;
            nodeIpsInactive = dbNodeIps.nodeIpsInactive;
        }
    }

    export async function loadFromDisk() {
        try {
            let diskDifficulty = JSON.parse(
                fs.readFileSync(`${DATA_PATH}/difficulty.json`, "utf-8")
            );

            difficulty = diskDifficulty;
        } catch (error: any) {
            if (error.message.includes("no such file or directory")) {
                LOG("sys", `difficulty.json  not found, will create new one`);
            } else {
                LOG("error", "NodeManager.loadFromDisk: " + error.message);
                await Platform.exit(1);
            }
        }

        try {
            let diskSolutionsToSubmitQueue = JSON.parse(
                fs.readFileSync(
                    `${DATA_PATH}/solutionsToSubmitQueue.json`,
                    "utf-8"
                )
            );

            solutionsToSubmitQueue = diskSolutionsToSubmitQueue;
        } catch (error: any) {
            if (error.message.includes("no such file or directory")) {
                LOG(
                    "sys",
                    `solutionsToSubmitQueue.json not found, will create new one`
                );
            } else {
                LOG("error", "NodeManager.loadFromDisk: " + error.message);
                await Platform.exit(1);
            }
        }

        try {
            let diskNodeIps = JSON.parse(
                fs.readFileSync(`${DATA_PATH}/nodeips.json`, "utf-8")
            );

            nodeIps = diskNodeIps.nodeIps;
            nodeIpsInactive = diskNodeIps.nodeIpsInactive;
        } catch (error: any) {
            if (error.message.includes("no such file or directory")) {
                LOG("sys", `nodeips.json not found, will create new one`);
            } else {
                LOG("error", "NodeManager.loadFromDisk: " + error.message);
                await Platform.exit(1);
            }
        }
    }

    export function pushNodeIp(
        nodeIp: string,
        to: "active" | "inactive" = "active"
    ) {
        if (to === "active") {
            if (!nodeIps.includes(nodeIp)) nodeIps.push(nodeIp);
        } else if (to === "inactive") {
            if (!nodeIpsInactive.includes(nodeIp)) nodeIpsInactive.push(nodeIp);
        }
    }

    export function removeNodeIp(
        nodeIp: string,
        from: "active" | "inactive" = "active"
    ) {
        if (from === "active") {
            nodeIps = nodeIps.filter((ip) => ip !== nodeIp);
        } else if (from === "inactive") {
            nodeIpsInactive = nodeIpsInactive.filter((ip) => ip !== nodeIp);
        }
    }

    export function checkAndRemoveIpsIfInactive(
        checkTickIp: {
            ip: string;
            tick: number;
        } = { ip: "", tick: 0 }
    ) {
        let deletedIps: string[] = [];
        let cloneNodeIps = [...nodeIps];
        for (let i = 0; i < nodeIps.length; i++) {
            let ip = nodeIps[i];
            if (
                nodeIpsFailedMap[ip] > MAX_FAILED_GET_SEED ||
                (ip === checkTickIp.ip &&
                    checkTickIp.tick > 0 &&
                    checkTickIp.tick <
                        Explorer.ticksData.tickInfo.tick - MAX_TICK_BEHIND)
            ) {
                deletedIps.push(ip);
                LOG("warning", "node ip inactive: " + ip);
                pushNodeIp(ip, "inactive");
                cloneNodeIps = cloneNodeIps.filter((item) => item !== ip);
                nodeIpsFailedMap[ip] = MAX_FAILED_GET_SEED - 3;
            }
        }

        if (cloneNodeIps.length > 0) {
            nodeIps = cloneNodeIps;
        } else {
            nodeIps = [...nodeIpsInactive];
            nodeIpsInactive = [];
        }

        return deletedIps.includes(checkTickIp.ip);
    }

    export function setDifficulty(newDiff: { pool?: number; net?: number }) {
        difficulty = { ...difficulty, ...newDiff };

        //broadcast
        SocketManager.broadcast(
            QatumEvents.getNewDifficultyPacket(difficulty.pool)
        );
    }

    export function getDifficulty() {
        return difficulty;
    }

    export function stopVerifyThread() {
        LOG("node", "stopping verify thread");
        addon.stopVerifyThread();
    }

    //ID,Amount\n (25)
    export async function pay(
        qutilDataPayments: PaymentQutilData[]
    ): Promise<any> {
        let paymentCsvString =
            qutilDataPayments
                .map((payment) => `${payment.id},${payment.amount}`)
                .join("\n") + "\n";
        return new Promise(async (resolve, reject) => {
            addon.pay(
                await getRandomIpFromList(),
                paymentCsvString,
                currentSecretSeed,
                (tick, txhash) => {
                    if (tick > 0) {
                        resolve({
                            tick,
                            txhash,
                        });
                    } else {
                        reject(
                            new Error(`transaction failed by node connection`)
                        );
                    }
                }
            );
        });
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
    export async function initToNodeSocket() {
        try {
            // let canBreak = false;
            // while (true) {
            //     if (canBreak) break;
            //     try {
            //         await new Promise((resolve, reject) => {
            //             addon.initSocket(
            //                 getRandomIpFromList(),
            //                 (isOk: boolean) => {
            //                     if (isOk) {
            //                         canBreak = true;
            //                         resolve(undefined);
            //                     } else {
            //                         reject(new Error("failed to init socket"));
            //                     }
            //                 }
            //             );
            //         });
            //     } catch (e: any) {
            //         LOG("error", "NodeManager.initToNodeSocket: " + e.message);
            //         continue;
            //     }
            // }

            await syncMiningSeed();
            watchMiningSeed();
        } catch (e: any) {
            LOG("error", "NodeManager.initToNodeSocket: " + e.message);
        }
    }

    export function watchAndSubmitSolution() {
        let isProcessing = false;
        setInterval(async () => {
            if (isProcessing) return;
            let solution = solutionsToSubmitQueue[0];
            try {
                isProcessing = true;
                if (solution) {
                    await sendSolution(
                        solution.nonce,
                        solution.seed,
                        solution.computorId
                    );
                    LOG("node", `solution submitted: ${solution.md5Hash}`);
                    solutionsToSubmitQueue.shift();
                }
                isProcessing = false;
            } catch (e: any) {
                if (solution) solutionsToSubmitQueue.push(solution);
                isProcessing = false;
                LOG(
                    "error",
                    "NodeManager.watchAndSubmitSolution: " + e.message
                );
            }
        }, ONE_SECOND / 2);
    }

    export function handleOnVerifiedSolution(
        solutionResult: SolutionResult = {
            md5Hash: "",
            resultScore: -1,
        },
        fromCluster: boolean = false
    ) {
        let { md5Hash, resultScore } = solutionResult;
        if (!md5Hash) return;
        if (md5Hash.length > 32) {
            md5Hash = md5Hash.slice(0, 32);
        }
        let isShare = addon.checkScore(resultScore, difficulty.pool);
        let isSolution = addon.checkScore(resultScore, difficulty.net);

        if (difficulty.pool === difficulty.net) {
            //we dont use share in this case (solo mining)
            isShare = false;
            LOG(
                fromCluster ? "cluster" : "node",
                "verifed solution: " + md5Hash + " is solution " + isSolution
            );
        } else {
            LOG(
                fromCluster ? "cluster" : "node",
                "verifed solution: " +
                    md5Hash +
                    " is share " +
                    isShare +
                    " is solution " +
                    isSolution
            );
        }

        let theSolution =
            SolutionManager.getSolutionFromVerifying(md5Hash) ||
            SolutionManager.getSolutionFromClusterVerifying(md5Hash);

        if (theSolution) {
            if (isSolution) solutionsToSubmitQueue.push(theSolution);

            SolutionManager.markAsVerified(md5Hash, {
                isShare,
                isSolution,
                resultScore,
            });
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

    export async function getRandomIpFromList() {
        if (RELIABLE_NODES_API) {
            try {
                let data = await fetch(RELIABLE_NODES_API);
                let json: {
                    most_reliable_node: {
                        address: string;
                    };
                } = await data.json();

                return json.most_reliable_node.address;
            } catch (error: any) {
                LOG(
                    "error",
                    "NodeManager.getRandomIpFromList(failed to get data from reliable api): " +
                        error.message
                );
                return nodeIps[Math.floor(Math.random() * nodeIps.length)];
            }
        }
        return nodeIps[Math.floor(Math.random() * nodeIps.length)];
    }

    export async function init(ips: string, secretSeed: string) {
        LOG("node", "init node manager");
        RELIABLE_NODES_API = process.env.RELIABLE_NODES_API || "";
        if (!RELIABLE_NODES_API)
            LOG(
                "warning",
                "RELIABLE_NODES_API is not defined, will use node ip from local NODE_IPS"
            );
        if (nodeIps.length === 0) {
            nodeIps = ips.split(",").map((ip) => ip.trim());
        }

        for (let i = 0; i < nodeIps.length; i++) {
            nodeIpsFailedMap[nodeIps[i]] = 0;
            LOG("node", "using node ip: " + nodeIps[i]);
        }
        currentSecretSeed = secretSeed;
        watchAndSubmitSolution();
        initLogger();
        initVerifyThread(
            Number(process.env.MAX_VERIFICATION_THREADS) || os.cpus().length
        );
        await initToNodeSocket();
    }

    export async function sendSolution(
        nonceHex: string,
        seedHex: string,
        computorId: string
    ): Promise<boolean> {
        return new Promise(async (resolve, reject) => {
            let ip = await getRandomIpFromList();
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
                        reject(new Error("failed to send solution"));
                    }
                }
            );
        });
    }

    export function getMiningSeed() {
        return currentMiningSeed;
    }

    export async function syncMiningSeed() {
        let canBreak = false;
        while (true) {
            try {
                if (canBreak) break;
                let candicateIp = await getRandomIpFromList();
                await new Promise((resolve, reject) => {
                    addon.getMiningCurrentMiningSeed(
                        candicateIp,
                        async (newSeed: string, tick: number) => {
                            if (tick > lastHighestTick) lastHighestTick = tick;
                            if (
                                checkAndRemoveIpsIfInactive({
                                    ip: candicateIp,
                                    tick,
                                }) ||
                                newSeed === "-1"
                            ) {
                                if (candicateIp in nodeIpsFailedMap)
                                    nodeIpsFailedMap[candicateIp]++;
                                await new Promise((resolve) => {
                                    setTimeout(() => {
                                        resolve(undefined);
                                    }, FIVE_SECONDS);
                                });
                                return reject(
                                    new Error("failed to get new seed")
                                );
                            }
                            currentMiningSeed = newSeed;
                            canBreak = true;
                            lastSuccessSyncSeed.fake = Date.now();
                            lastSuccessSyncSeed.real = Date.now();
                            nodeIpsFailedMap[candicateIp] = 0;
                            resolve(undefined);
                        }
                    );
                });
            } catch (e: any) {
                //  LOG("error", "NodeManager.syncMiningSeed: " + e.message);
                continue;
            }
        }
    }

    export function watchMiningSeed() {
        let isProcessing = false;
        let failedCount = 0;
        setInterval(async () => {
            try {
                if (Date.now() - lastSuccessSyncSeed.fake > ONE_MINUTE * 1) {
                    LOG("warning", "failed to get new seed for 1 minute");
                    lastSuccessSyncSeed.fake = Date.now();
                }
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
