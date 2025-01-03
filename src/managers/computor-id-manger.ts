import { DATA_PATH } from "../consts/path";
import { THREE_MINUTES } from "../consts/time";
import Platform from "../platform/exit";
import QatumEvents from "../qatum/qatum-events";
import { SolutionData, Transaction } from "../types/type";
import LOG from "../utils/logger";
import { qfetch } from "../utils/qfetch";
import fetchListIds from "../utils/qli-apis/fetch-list-ids";
import fetchScore from "../utils/qli-apis/fetch-score";
import ApiData from "../utils/qli-apis/global-data";
import syncAvgScore from "../utils/qli-apis/sync-avg-score";
import { SocketManager } from "./socket-manager";
import fs from "fs";
interface TicksData {
    tickInfo: {
        tick: number;
        duration: number;
        epoch: number;
        initialTick: number;
    };
}
export namespace ComputorIdManager {
    let miningConfig = {
        diffToBalance: 1000, // hashrate difference to balance
    };

    let currentEpoch: number = 0;

    let ticksData: TicksData;

    let emptyTicks: number[];

    let computorIdMap: {
        //ID
        [key: string]: {
            workers: {
                //socketUUID: hashrate
                [key: string]: number | undefined;
            };
            totalHashrate: number;
            lscore: number;
            ascore: number;
            bcscore: number;
            mining: boolean;
            followingAvgScore: boolean;
            targetScore: number | undefined;
            alias: string;
            ip: string;
            lastUpdateScoreTime: number;
            // we use map for faster access
            submittedSolutions: {
                [key: string]: {
                    isWrittenToBC: boolean;
                    submittedTime: number;
                };
            };
            solutionsFetched: SolutionData[];
        };
    } = {
        PRKMZXJAOZERDCGLQUVESFWAHAABWIVWCPSLYBHWWFGADFZEONJATUBAMRQC: {
            workers: {},
            totalHashrate: 0,
            lscore: 0,
            ascore: 0,
            bcscore: 0,
            mining: true,
            alias: "",
            ip: "82.197.173.132",
            followingAvgScore: false,
            targetScore: undefined,
            lastUpdateScoreTime: 0,
            solutionsFetched: [],
            submittedSolutions: {},
        },
    };

    export async function writeSolution(
        computorId: string,
        nonce: string,
        miningSeed: string
    ) {
        if (computorIdMap[computorId])
            computorIdMap[computorId].submittedSolutions[miningSeed + nonce] = {
                isWrittenToBC: false,
                submittedTime: Date.now(),
            };
    }

    export function deleteAllWorkersForAllComputorId() {
        for (let computorId in computorIdMap) {
            computorIdMap[computorId].workers = {};
            computorIdMap[computorId].totalHashrate = 0;
        }
    }

    export function saveToDisk(epoch?: number) {
        if (!epoch && !ticksData?.tickInfo?.epoch) {
            return;
        }
        deleteAllWorkersForAllComputorId();
        fs.writeFileSync(
            `${DATA_PATH}/computorIdMapE${
                epoch || ticksData.tickInfo.epoch
            }.json`,
            JSON.stringify(computorIdMap)
        );
    }

    export function loadFromDisk(epoch?: number) {
        let candicateEpoch = epoch || ticksData?.tickInfo?.epoch;
        try {
            if (!candicateEpoch) {
                LOG("error", "epoch not found (no tick data)");
                Platform.exit(1);
            }

            computorIdMap = JSON.parse(
                fs
                    .readFileSync(
                        `${DATA_PATH}/computorIdMapE${candicateEpoch}.json`
                    )
                    .toString()
            );
        } catch (error: any) {
            if (error.message.includes("no such file or directory")) {
                LOG(
                    "sys",
                    `computorIdMapE${candicateEpoch}.json not found, creating new one`
                );
            } else {
                LOG("error", error.message);
            }
        }
    }

    export function setMiningConfig(newConfig: any) {
        miningConfig = {
            ...miningConfig,
            ...newConfig,
        };
    }

    export function getMiningConfig() {
        return miningConfig;
    }

    export async function init() {
        LOG("sys", "init computor id manager");
        try {
            await syncTicksData();
        } catch (error: any) {
            LOG("error", "failed to connect to qubic rpc server");
            Platform.exit(1);
        }
        loadFromDisk();
        await setScoreForAllComputorId();
        await syncAvgScore();
        setInterval(async () => {
            try {
                await setScoreForAllComputorId();
                await syncAvgScore();
                checkAndRemoveIfTargetScoreReached();

                if (tryLoadAllWorkersToComputorId()?.canBalanceHashrate) {
                    autoBalanceComputorIdHashrate(true);
                }
            } catch (error: any) {
                LOG("error", error.message);
            }
        }, THREE_MINUTES);
    }

    export function createRandomIdWithMaxTotalHashrate(
        maxTotalHashrate: number,
        mining: boolean = true
    ) {
        //random A-Z 60 letters
        let randomId = "";
        let currentHashrate = 0;
        for (let i = 0; i < 60; i++) {
            randomId += String.fromCharCode(
                65 + Math.floor(Math.random() * 26)
            );
        }
        addComputorId(randomId);
        setMining(randomId, mining);

        while (currentHashrate < maxTotalHashrate) {
            let randomHashrate = Math.floor(Math.random() * 100 + 1);
            currentHashrate += randomHashrate;
            addWorker(randomId, randomId + Math.random(), randomHashrate);
        }
    }

    export function getLowestHashrateActiveComputorId(
        needEnableFollow: boolean = false
    ) {
        let computorId = null;
        let hashrate = Infinity;
        for (let id in computorIdMap) {
            if (!computorIdMap[id].mining) continue;
            if (needEnableFollow && !computorIdMap[id].followingAvgScore)
                continue;
            if (computorIdMap[id].totalHashrate < hashrate) {
                computorId = id;
                hashrate = computorIdMap[id].totalHashrate;
            }
        }
        return computorId;
    }

    export function getHighestHashrateActiveComputorId() {
        let computorId = null;
        let hashrate = 0;
        for (let id in computorIdMap) {
            if (!computorIdMap[id].mining) continue;
            if (computorIdMap[id].totalHashrate > hashrate) {
                computorId = id;
                hashrate = computorIdMap[id].totalHashrate;
            }
        }
        return computorId;
    }

    export function getNumberOfActiveComputorId() {
        let count = 0;
        for (let id in computorIdMap) {
            if (computorIdMap[id].mining) count++;
        }
        return count;
    }

    export function syncNewComputorIdForSockets() {
        let socketMap = SocketManager.getSocketMap();
        for (let socketUUID in socketMap) {
            let thisSocket = socketMap[socketUUID];
            let currentComputorId = getComputorIdBySocketUUID(socketUUID);
            if (currentComputorId !== thisSocket.computorId) {
                thisSocket.write(
                    QatumEvents.getNewComputorIdPacket(
                        currentComputorId as string
                    )
                );
                thisSocket.computorId = currentComputorId as string;
            }
        }
    }

    export function isThereComputorIdFollowingTargetScore() {
        for (let computorId in computorIdMap) {
            if (!isNaN(computorIdMap[computorId].targetScore as number))
                return true;
        }
        return false;
    }

    export function checkAndRemoveIfTargetScoreReached() {
        for (let computorId in computorIdMap) {
            if (
                !isNaN(computorIdMap[computorId].targetScore as number) &&
                computorIdMap[computorId].lscore >=
                    (computorIdMap[computorId].targetScore as number)
            ) {
                computorIdMap[computorId].targetScore = undefined;
            }
        }
    }

    export function tryLoadAllWorkersToComputorId() {
        let lowestTotalHashrateIdEnabledFollowing =
            getLowestHashrateActiveComputorId(true) as string;

        if (!lowestTotalHashrateIdEnabledFollowing) {
            return {
                canBalanceHashrate: true,
            };
        }

        if (isThereComputorIdFollowingTargetScore()) {
            return {
                canBalanceHashrate: false,
            };
        }

        if (
            (getComputorId(lowestTotalHashrateIdEnabledFollowing)
                .lscore as number) < ApiData.avgScore
        ) {
            getComputorId(lowestTotalHashrateIdEnabledFollowing).targetScore =
                ApiData.avgScore * 1.06;

            for (let computorId in computorIdMap) {
                if (computorId === lowestTotalHashrateIdEnabledFollowing)
                    continue;

                moveAllWorkersFromComputorId(
                    computorId,
                    lowestTotalHashrateIdEnabledFollowing
                );
            }

            syncNewComputorIdForSockets();

            return {
                canBalanceHashrate: false,
            };
        }

        return {
            canBalanceHashrate: true,
        };
    }

    export function autoBalanceComputorIdHashrate(isBroadcast: boolean = true) {
        let maxHashrate = getComputorId(
            getHighestHashrateActiveComputorId() || ""
        )?.totalHashrate;
        let minHashrate = getComputorId(
            getLowestHashrateActiveComputorId() || ""
        )?.totalHashrate;
        let totalHashrate = getTotalHashrateActiveComputorId();

        if (isNaN(maxHashrate) || isNaN(minHashrate)) return;

        let avgHashrate = totalHashrate / getNumberOfActiveComputorId();
        let positiveDiffArr: any[] = [];

        for (let id in computorIdMap) {
            let theComputorId = getComputorId(id);
            let diff = theComputorId.totalHashrate - avgHashrate;

            if (!theComputorId.mining && theComputorId.totalHashrate > 0) {
                let workersKey = Object.keys(theComputorId.workers);
                let workersArray = workersKey.map((workerUuid) => {
                    return {
                        uuid: workerUuid,
                        currentIts: theComputorId.workers[workerUuid],
                    };
                });

                positiveDiffArr.push({
                    id: id,
                    diff: diff,
                    candicates: workersArray,
                });
                continue;
            }

            if (maxHashrate - minHashrate < miningConfig.diffToBalance)
                continue;

            if (diff > 0) {
                let workersKey = Object.keys(theComputorId.workers);
                let workersArray = workersKey
                    .map((workerUuid) => {
                        return {
                            uuid: workerUuid,
                            currentHashrate: theComputorId.workers[
                                workerUuid
                            ] as number,
                        };
                    })
                    .sort((a, b) => a.currentHashrate - b.currentHashrate);

                let currentCandidateTotalIts = 0;
                let lastCandicateIndex = -1;
                for (let i = 0; i < workersArray.length; i++) {
                    if (
                        currentCandidateTotalIts +
                            workersArray[i].currentHashrate <
                        diff
                    ) {
                        currentCandidateTotalIts +=
                            workersArray[i].currentHashrate;
                        lastCandicateIndex = i;
                    } else {
                        break;
                    }
                }

                if (lastCandicateIndex === -1) continue;
                let candicatesArray = workersArray.slice(0, lastCandicateIndex);

                positiveDiffArr.push({
                    id: id,
                    diff: diff,
                    candicates: candicatesArray,
                });
            }
        }

        //balancing hashrate
        for (let positiveDiff of positiveDiffArr) {
            for (let candicate of positiveDiff.candicates) {
                let lowestTotalHashrateId =
                    getLowestHashrateActiveComputorId() || "";
                if (!lowestTotalHashrateId) continue;
                moveWorkerToComputorId(lowestTotalHashrateId, candicate.uuid);

                if (isBroadcast) {
                    let thisSocket = SocketManager.getSocket(candicate.uuid);
                    if (!thisSocket) continue;
                    thisSocket?.write(
                        QatumEvents.getNewComputorIdPacket(
                            lowestTotalHashrateId
                        )
                    );
                    SocketManager.getSocket(candicate.uuid).computorId =
                        lowestTotalHashrateId;
                }
            }
        }
    }

    export function updateHashrate(
        computorId: string,
        workerUuid: string,
        newHashrate: number
    ) {
        let previousHashrate =
            getComputorId(computorId).workers[workerUuid] || 0;
        getComputorId(computorId).workers[workerUuid] = newHashrate;
        getComputorId(computorId).totalHashrate +=
            newHashrate - previousHashrate;
    }

    export function getTotalHashrateActiveComputorId() {
        let hashrate = 0;
        for (let id in computorIdMap) {
            if (computorIdMap[id].mining) continue;
            hashrate += computorIdMap[id].totalHashrate;
        }
        return hashrate;
    }

    export async function resetComputorData() {
        for (let computorId in computorIdMap) {
            computorIdMap[computorId].lscore = 0;
            computorIdMap[computorId].ascore = 0;
            computorIdMap[computorId].bcscore = 0;
            computorIdMap[computorId].lastUpdateScoreTime = 0;
            computorIdMap[computorId].solutionsFetched = [];
            computorIdMap[computorId].submittedSolutions = {};
        }
    }

    async function syncTicksData() {
        let localTicksData: TicksData = await qfetch(
            `https://rpc.qubic.org/v1/tick-info`
        ).then((data) => data.json());

        if (!isNaN(localTicksData.tickInfo.epoch)) {
            ticksData = localTicksData;
        } else {
            throw new Error("failed to fetch ticks data");
        }
    }

    async function syncEmptyTicks() {
        let localEmptyTicks = await qfetch(
            `https://rpc.qubic.org/v2/epochs/${ticksData.tickInfo.epoch}/empty-ticks?pageSize=100000`
        )
            .then((data) => data.json())
            .then((data) => data.emptyTicks);

        if (Array.isArray(localEmptyTicks)) {
            emptyTicks = localEmptyTicks;
        } else {
            throw new Error("failed to fetch empty ticks");
        }
    }

    export async function fetchScoreV2() {
        try {
            await syncTicksData();
            await syncEmptyTicks();
        } catch (error: any) {
            LOG("error", `${error.message}, skip sync score`);
            return;
        }

        if (currentEpoch !== ticksData.tickInfo.epoch && currentEpoch !== 0) {
            //new epoch
            LOG("sys", `new epoch ${ticksData.tickInfo.epoch}`);
            await saveToDisk(currentEpoch);
            await resetComputorData();
        }

        currentEpoch = ticksData.tickInfo.epoch;

        for (let computorId in computorIdMap) {
            try {
                let data = await qfetch(
                    `https://rpc.qubic.org/v2/identities/${computorId}/transfers?startTick=${ticksData.tickInfo.initialTick}&endTick=${ticksData.tickInfo.tick}`
                );

                let transactions = (await data.json()).transactions as {
                    transactions: {
                        moneyFlew: boolean;
                        transaction: Transaction;
                    }[];
                }[];

                let scores = 0;
                let solutionsFetched: SolutionData[] = [];
                for (let fatherTx of transactions) {
                    for (let tx of fatherTx.transactions) {
                        if (
                            tx.transaction.inputType === 2 &&
                            tx.transaction.sourceId === computorId &&
                            !emptyTicks.includes(tx.transaction.tickNumber) &&
                            tx.moneyFlew
                        ) {
                            let miningSeed = tx.transaction.inputHex.slice(
                                0,
                                64
                            );
                            let nonce = tx.transaction.inputHex.slice(64);

                            solutionsFetched.push({
                                miningSeed,
                                nonce,
                            });

                            if (
                                computorIdMap[computorId].submittedSolutions[
                                    miningSeed + nonce
                                ]
                            ) {
                                computorIdMap[computorId].submittedSolutions[
                                    miningSeed + nonce
                                ].isWrittenToBC = true;
                            }
                            scores++;
                        }
                    }
                }

                //currently we are using lscore, ascore, bcscore as the same score
                computorIdMap[computorId].lscore = scores;
                computorIdMap[computorId].ascore = scores;
                computorIdMap[computorId].bcscore = scores;
                computorIdMap[computorId].lastUpdateScoreTime = Date.now();
                computorIdMap[computorId].solutionsFetched = solutionsFetched;
            } catch (error: any) {
                LOG("error", "[sync score] " + error.message);
            }
        }
    }

    export async function setScoreForAllComputorId() {
        await fetchScoreV2();
    }

    export function addComputorId(computorId: string, newSettings: any = {}) {
        if (computorIdMap[computorId]) return;
        computorIdMap[computorId] = {
            workers: {},
            totalHashrate: 0,
            lscore: 0,
            ascore: 0,
            bcscore: 0,
            mining: false,
            followingAvgScore: false,
            targetScore: undefined,
            alias: "",
            ip: "",
            lastUpdateScoreTime: 0,
            solutionsFetched: [],
            submittedSolutions: [],
            ...newSettings,
        };
    }

    export function updateComputorId(
        computorId: string,
        newSettings: any = {}
    ) {
        if (!computorIdMap[computorId]) return;
        computorIdMap[computorId] = {
            ...computorIdMap[computorId],
            ...newSettings,
        };
    }

    export function setMining(computorId: string, mining: boolean) {
        computorIdMap[computorId].mining = mining;
    }

    export function removeComputorId(computorId: string) {
        let workers = Object.keys(computorIdMap[computorId].workers);
        while (workers.length > 0) {
            moveWorkerToComputorId(
                getLowestHashrateActiveComputorId() as string,
                workers.pop() as string
            );
        }

        delete computorIdMap[computorId];
    }

    export function addWorker(
        computorId: string,
        socketUUID: string,
        hashrate: number
    ) {
        computorIdMap[computorId].workers[socketUUID] = hashrate;
        computorIdMap[computorId].totalHashrate += hashrate;
    }

    export function removeWorker(computorId: string, socketUUID: string) {
        if (!computorId) {
            computorId = getComputorIdBySocketUUID(socketUUID) as string;
        }
        if (!computorId || !getComputorId(computorId)) return;
        computorIdMap[computorId].totalHashrate -=
            computorIdMap[computorId].workers[socketUUID] || 0;
        delete computorIdMap[computorId].workers[socketUUID];
    }

    export function getComputorId(computorId: string) {
        return computorIdMap[computorId];
    }

    export function getComputorIds() {
        return computorIdMap;
    }

    export function getComputorIdBySocketUUID(socketUUID: string) {
        for (let computorId in computorIdMap) {
            if (
                !isNaN(computorIdMap[computorId].workers[socketUUID] as number)
            ) {
                return computorId;
            }
        }
        return null;
    }

    export function moveWorkerToComputorId(
        computorId: string,
        socketUUID: string
    ) {
        let oldComputorId = getComputorIdBySocketUUID(socketUUID);
        if (oldComputorId) {
            let hashrate = computorIdMap[oldComputorId].workers[socketUUID];
            removeWorker(oldComputorId, socketUUID);
            addWorker(computorId, socketUUID, hashrate as number);
        }
    }

    export function moveAllWorkersFromComputorId(
        oldComputorId: string,
        newComputorId: string
    ) {
        let workers = computorIdMap[oldComputorId].workers;
        for (let socketUUID in workers) {
            addWorker(newComputorId, socketUUID, workers[socketUUID] as number);
            removeWorker(oldComputorId, socketUUID);
        }
    }
}
