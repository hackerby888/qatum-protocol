import { ONE_DAY, THREE_MINUTES } from "../consts/time";
import { QWorker, QWorkerApi, Solution } from "../types/type";
import LOG from "../utils/logger";
import { SolutionManager } from "./solution-manager";

namespace WorkerManager {
    //Map<wallet, Map<workerId, QWorker>>
    let workersMap: Map<string, Map<string, QWorker>> = new Map();
    let globalStats: {
        hashrate: number;
        hashrateList: number[];
        solutions: number;
        solutionsVerified: number;
        workers: number;
        wallets: number;
        lastUpdated: number;
    } = {
        hashrate: 0,
        hashrateList: [],
        solutions: 0,
        solutionsVerified: 0,
        workers: 0,
        wallets: 0,
        lastUpdated: Date.now(),
    };
    let UPDATE_GLOBALSTATS_INTERVAL = THREE_MINUTES;

    export function init() {
        watchGlobalStats();
    }

    export function getGlobalStats() {
        return globalStats;
    }

    export function watchGlobalStats(): void {
        setInterval(() => {
            try {
                let hashrateList: number[] = [];
                let hashrate = 0;
                let solutions = 0;
                let solutionsVerified = 0;
                let workers = 0;
                let wallets = 0;

                workersMap.forEach((value) => {
                    let hasAtleastOneActiveWorker = false;
                    value.forEach((worker) => {
                        worker.solutions.forEach((solution) => {
                            if (SolutionManager.isSolutionValid(solution))
                                solutionsVerified++;
                        });
                        solutions += worker.solutions.length;
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
                globalStats.solutions = solutions;
                globalStats.solutionsVerified = solutionsVerified;
                globalStats.workers = workers;
                globalStats.wallets = wallets;
                globalStats.lastUpdated = Date.now();
            } catch (error: any) {
                LOG("error", `failed to update globalStats ${error}`);
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
        needActive: boolean = true
    ): QWorkerApi[] {
        if (!workersMap.has(wallet)) return [];
        let result: QWorkerApi[] = [];
        structuredClone(Array.from(workersMap.get(wallet)!.values())).forEach(
            (worker) => {
                if (!worker.isActive && needActive) return;
                result.push({
                    ...worker,
                    solutions: worker.solutions.length,
                    solutionsVerified: worker.solutions.filter((solution) =>
                        SolutionManager.isSolutionValid(solution)
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
        worker.solutions.push(md5Hash);
    }
}

export default WorkerManager;
