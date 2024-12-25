import { DATA_PATH } from "../consts/path";
import { THREE_MINUTES } from "../consts/time";
import StratumEvents from "../stratum/stratum-events";
import { Transaction } from "../types/type";
import LOG from "../utils/logger";
import fetchListIds from "../utils/qli-apis/fetch-list-ids";
import fetchScore from "../utils/qli-apis/fetch-score";
import ApiData from "../utils/qli-apis/global-data";
import syncAvgScore from "../utils/qli-apis/sync-avg-score";
import { SocketManager } from "./socket-manager";
import fs from "fs";
export namespace ComputorIdManager {
    let miningConfig = {
        diffToBalance: 1000, // hashrate difference to balance
    };

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
            lastUpdateScoreTime?: number;
        };
    } = {
        // MLABBWNRZZXKSETUIWDJFZXIWKCBBZXKQAXFTOWPEEIFXFKHOSHKWEPAGXJN: {
        //     workers: {},
        //     totalHashrate: 0,
        //     lscore: 0,
        //     ascore: 0,
        //     bcscore: 0,
        //     mining: true,
        //     alias: "",
        //     ip: "82.197.173.132",
        //     followingAvgScore: false,
        //     targetScore: undefined,
        // },
    };

    export function deleteAllWorkersForAllComputorId() {
        for (let computorId in computorIdMap) {
            computorIdMap[computorId].workers = {};
            computorIdMap[computorId].totalHashrate = 0;
        }
    }

    export function saveToDisk() {
        deleteAllWorkersForAllComputorId();
        fs.writeFileSync(
            `${DATA_PATH}/computorIdMap.json`,
            JSON.stringify(computorIdMap)
        );
    }

    export function loadFromDisk() {
        try {
            computorIdMap = JSON.parse(
                fs.readFileSync(`${DATA_PATH}/computorIdMap.json`).toString()
            );
        } catch (error: any) {
            if (error.message.includes("no such file or directory")) {
                LOG("error", "computorIdMap.json not found");
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
        loadFromDisk();
        await setAliasForAllComputorId();
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
                    StratumEvents.getNewComputorIdPacket(
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
                        StratumEvents.getNewComputorIdPacket(
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

    export async function setAliasForAllComputorId() {
        let data: {
            identity: string;
            alias: string;
        }[] = await fetchListIds();
        if (!data) return;

        for (let computorId in computorIdMap) {
            let alias = data.find(
                (item) => item.identity === computorId
            )?.alias;

            if (alias) getComputorId(computorId).alias = alias;
        }
    }

    export async function fetchScoreV2() {
        let emptyTicks: number[];
        let ticksData: {
            tickInfo: {
                tick: number;
                duration: number;
                epoch: number;
                initialTick: number;
            };
        };

        try {
            ticksData = await fetch(`https://rpc.qubic.org/v1/tick-info`).then(
                (data) => data.json()
            );

            emptyTicks = await fetch(
                `https://rpc.qubic.org/v2/epochs/${141}/empty-ticks?pageSize=100000`
            )
                .then((data) => data.json())
                .then((data) => data.emptyTicks);
        } catch (error: any) {
            LOG("error", error.message);
            return;
        }

        for (let computorId in computorIdMap) {
            try {
                let data = await fetch(
                    `https://rpc.qubic.org/v2/identities/${computorId}/transfers?startTick=${ticksData.tickInfo.initialTick}&endTick=${ticksData.tickInfo.tick}`
                );

                let transactions = (await data.json()).transactions as {
                    transactions: {
                        moneyFlew: boolean;
                        transaction: Transaction;
                    }[];
                }[];

                let scores = 0;
                for (let fatherTx of transactions) {
                    for (let tx of fatherTx.transactions) {
                        if (
                            tx.transaction.inputType === 2 &&
                            tx.transaction.sourceId === computorId &&
                            !emptyTicks.includes(tx.transaction.tickNumber) &&
                            tx.moneyFlew
                        ) {
                            scores++;
                        }
                    }
                }

                //currently we are using lscore, ascore, bcscore as the same score
                computorIdMap[computorId].lscore = scores;
                computorIdMap[computorId].ascore = scores;
                computorIdMap[computorId].bcscore = scores;
                computorIdMap[computorId].lastUpdateScoreTime = Date.now();
            } catch (error: any) {
                LOG("error", error.message);
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
