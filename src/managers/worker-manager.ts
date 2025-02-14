import { DATA_PATH } from "../consts/path";
import { ONE_DAY, THREE_MINUTES } from "../consts/time";
import QatumDb from "../database/db";
import Platform from "../platform/platform";
import { PaymentDbData, QWorker, QWorkerApi } from "../types/type";
import Explorer from "../utils/explorer";
import LOG from "../utils/logger";
import { SolutionManager } from "./solution-manager";
import fs from "fs";
namespace WorkerManager {
    //Map<wallet, Map<workerId, QWorker>>
    let workersMap: Map<string, Map<string, QWorker>> = new Map();
    let globalStats: {
        hashrate: number;
        hashrateList: number[];
        solutionsShare: number;
        solutionsVerified: number;
        solutionsWritten: number;
        workers: number;
        wallets: number;
        lastUpdated: number;
    } = {
        hashrate: 0,
        hashrateList: [],
        solutionsShare: 0,
        solutionsVerified: 0,
        solutionsWritten: 0,
        workers: 0,
        wallets: 0,
        lastUpdated: Date.now(),
    };
    let UPDATE_GLOBALSTATS_INTERVAL = THREE_MINUTES;

    let isDiskLoaded = false;

    export function init() {
        watchGlobalStats();
    }

    export function getGlobalStats() {
        return globalStats;
    }

    export async function saveData(
        epoch?: number,
        needToSetInactive: boolean = true
    ) {
        if (!isDiskLoaded) return;
        await saveToDisk(epoch, needToSetInactive);
    }

    export async function saveToDisk(
        epoch?: number,
        needToSetInactive: boolean = true
    ) {
        let candicateEpoch = epoch || Explorer?.ticksData?.tickInfo?.epoch;
        try {
            if (isNaN(candicateEpoch)) return;

            if (needToSetInactive) setInactiveAll();
            let moduleData: any = {
                workersMap: {},
                globalStats,
            };

            workersMap.forEach((value, key) => {
                moduleData["workersMap"][key] = Object.fromEntries(value);
            });

            moduleData.globalStats = globalStats;

            fs.writeFileSync(
                `${DATA_PATH}/workers-${candicateEpoch}.json`,
                JSON.stringify(moduleData)
            );
        } catch (error: any) {
            LOG(
                "error",
                `WorkerManager.saveToDisk: failed to save workers-${candicateEpoch}.json ${error}`
            );
        }
    }

    export async function loadData(epoch?: number) {
        await loadFromDisk(epoch);
        isDiskLoaded = true;
    }

    export async function loadFromDisk(epoch?: number) {
        try {
            let moduleData = JSON.parse(
                fs.readFileSync(`${DATA_PATH}/workers-${epoch}.json`, "utf-8")
            );
            Object.entries(moduleData.workersMap).forEach(([key, value]) => {
                // @ts-ignore
                workersMap.set(key, new Map(Object.entries(value)));
            });
            globalStats = moduleData.globalStats;
        } catch (error: any) {
            if (error.message.includes("no such file or directory")) {
                LOG(
                    "sys",
                    `workers-${epoch}.json not found, will create new one`
                );
            } else {
                LOG("error", "WorkerManager.loadFromDisk: " + error.message);
                await Platform.exit(1);
            }
        }
    }

    export function watchGlobalStats(): void {
        setInterval(() => {
            try {
                let hashrate = 0;
                let workers = 0;
                let wallets = 0;

                globalStats.solutionsShare = 0;
                globalStats.solutionsVerified = 0;
                globalStats.solutionsWritten = 0;

                workersMap.forEach((value) => {
                    let hasAtleastOneActiveWorker = false;
                    value.forEach((worker) => {
                        worker.solutions.forEach((solution) => {
                            if (SolutionManager.isSolutionValid(solution)) {
                                globalStats.solutionsVerified++;
                                if (
                                    SolutionManager.isSolutionWritten(solution)
                                ) {
                                    globalStats.solutionsWritten++;
                                }
                            }

                            if (SolutionManager.isSolutionShare(solution))
                                globalStats.solutionsShare++;
                        });
                        if (!worker.isActive) return;
                        hasAtleastOneActiveWorker = true;
                        workers++;
                        hashrate += worker.hashrate;
                    });
                    if (hasAtleastOneActiveWorker) wallets++;
                });

                globalStats.hashrate = hashrate;
                if (
                    globalStats.hashrateList.length >
                    ONE_DAY / UPDATE_GLOBALSTATS_INTERVAL
                ) {
                    globalStats.hashrateList.shift();
                }
                globalStats.hashrateList.push(hashrate);
                globalStats.workers = workers;
                globalStats.wallets = wallets;
                globalStats.lastUpdated = Date.now();
            } catch (error: any) {
                LOG(
                    "error",
                    `WorkerManager.watchGlobalStats: failed to update globalStats ${error}`
                );
            }
        }, UPDATE_GLOBALSTATS_INTERVAL);
    }

    export function createWallet(wallet: string): void {
        workersMap.set(wallet, new Map());
    }

    export function createWorker(
        wallet: string,
        workerId: string,
        workerName: string
    ): void {
        if (!workersMap.has(wallet)) {
            createWallet(wallet);
        }
        if (workersMap.get(wallet)?.has(workerId)) return;

        workersMap.get(wallet)?.set(workerId, {
            name: workerName,
            isActive: true,
            hashrate: 0,
            solutions: [],
            lastActive: Date.now(),
            startTimestamp: Date.now(),
        });
    }

    export function getWorker(
        wallet: string,
        workerId: string
    ): QWorker | null {
        if (!workersMap.has(wallet)) return null;
        return workersMap.get(wallet)?.get(workerId) || null;
    }

    export function getWorkers(
        wallet: string,
        needActive: boolean = true,
        solNeedToBeWritten: boolean = false
    ): QWorkerApi[] {
        if (!workersMap.has(wallet)) return [];
        let result: QWorkerApi[] = [];
        structuredClone(Array.from(workersMap.get(wallet)!.values())).forEach(
            (worker) => {
                if (!worker.isActive && needActive) return;
                result.push({
                    ...worker,
                    solutions: worker.solutions.length,
                    solutionsShare: worker.solutions.filter((solution) =>
                        SolutionManager.isSolutionShare(solution)
                    ).length,
                    solutionsVerified: worker.solutions.filter((solution) =>
                        SolutionManager.isSolutionValid(solution)
                    ).length,
                    solutionsWritten: worker.solutions.filter(
                        (solution) =>
                            SolutionManager.isSolutionValid(solution) &&
                            SolutionManager.isSolutionWritten(solution)
                    ).length,
                });
            }
        );

        return result;
    }

    export function removeWorker(wallet: string, workerId: string): void {
        if (!workersMap.has(wallet)) return;
        workersMap.get(wallet)?.delete(workerId);
    }

    export function removeWallet(wallet: string): void {
        workersMap.delete(wallet);
    }

    export function setInactive(wallet: string, workerId: string): void {
        let worker = getWorker(wallet, workerId);
        if (!worker) return;
        worker.isActive = false;
    }

    export function setInactiveAll() {
        workersMap.forEach((value) => {
            value.forEach((worker) => {
                worker.isActive = false;
            });
        });
    }

    export function updateHashrate(
        wallet: string,
        workerId: string,
        hashrate: number
    ): void {
        let worker = getWorker(wallet, workerId);
        if (!worker) return;
        worker.hashrate = hashrate;
        worker.lastActive = Date.now();
    }

    export function pushSolution(
        wallet: string,
        workerId: string,
        md5Hash: string
    ): void {
        let worker = getWorker(wallet, workerId);
        if (!worker) return;
        if (worker.solutions.find((solution) => solution === md5Hash)) return;
        worker.solutions.push(md5Hash);
    }

    export function calculateAndInsertRewardPayments(epoch: number) {
        let reward: {
            [wallet: string]: PaymentDbData;
        } = {};
        for (let [wallet, value] of workersMap) {
            reward[wallet] = {
                solutionsShare: 0,
                solutionsVerified: 0,
                solutionsWritten: 0,
                epoch,
                insertedAt: Date.now(),
                wallet,
                isPaid: false,
                txId: null,
            };
            value.forEach((worker) => {
                worker.solutions.forEach((solution) => {
                    if (SolutionManager.isSolutionValid(solution)) {
                        reward[wallet].solutionsVerified++;
                        if (SolutionManager.isSolutionWritten(solution)) {
                            reward[wallet].solutionsWritten++;
                        }
                    }

                    if (SolutionManager.isSolutionShare(solution))
                        reward[wallet].solutionsShare++;
                });
            });
        }

        let rewardPaymentsArray = [];
        for (let wallet in reward) {
            if (
                reward[wallet].solutionsShare === 0 &&
                reward[wallet].solutionsWritten === 0
            )
                continue;
            rewardPaymentsArray.push(reward[wallet]);
        }
        if (rewardPaymentsArray.length === 0) {
            return LOG("wallet", "no reward to pay");
        }
        QatumDb.insertRewardPayments(rewardPaymentsArray);
    }

    export function getWalletFromWorkerId(workerId: string): string | null {
        for (let [wallet, value] of workersMap.entries()) {
            if (value.has(workerId)) return wallet;
        }
        return null;
    }

    export function clearSolutionsForAllWallets() {
        workersMap.forEach((value, key) => {
            //delete wallet if no worker is active
            let hasAtleastOneActiveWorker = false;
            value.forEach((worker) => {
                if (worker.isActive) {
                    hasAtleastOneActiveWorker = true;
                }
                worker.solutions = [];
            });

            if (!hasAtleastOneActiveWorker) {
                workersMap.delete(key);
            }
        });

        globalStats.solutionsShare = 0;
        globalStats.solutionsVerified = 0;
        globalStats.solutionsWritten = 0;
    }
}

export default WorkerManager;
