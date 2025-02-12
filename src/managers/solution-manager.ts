import { md5 } from "hash-wasm";
import NodeManager from "./node-manager";
import os from "os";
import {
    Solution,
    SolutionNetState,
    SolutionPendingToProcess,
} from "../types/type";
import LOG from "../utils/logger";
import { DATA_PATH } from "../consts/path";
import fs from "fs";
import QatumDb from "../database/db";
import { ComputorIdManager } from "./computor-id-manger";
import WorkerManager from "./worker-manager";
import { ONE_MINUTE } from "../consts/time";
import Explorer from "../utils/explorer";
import Platform from "../platform/platform";

namespace SolutionManager {
    let solutionsPendingToGetProcessQueue: Map<
        string,
        SolutionPendingToProcess
    > = new Map();
    let solutionQueue: Map<string, Solution> = new Map();
    let solutionVerifyingQueue: Map<string, Solution> = new Map();
    let solutionClusterVerifyingQueue: Map<string, Solution> = new Map();
    let solutionVerifiedQueue: Map<string, SolutionNetState> = new Map();

    let solutionClusterVerifyingQueueCounterMap: Map<string, boolean> =
        new Map();

    let threads =
        Number(process.env.MAX_VERIFICATION_THREADS) || os.cpus().length;

    let isEnable = true;

    let isDiskLoaded = false;

    export function disable() {
        isEnable = false;
    }

    export function enable() {
        isEnable = true;
    }

    export function getIsEnable() {
        return isEnable;
    }

    export function toJson(type: "object" | "array" = "array") {
        let solutionsMap = {
            solutionQueue: Object.fromEntries(solutionQueue),
            solutionVerifyingQueue: Object.fromEntries(solutionVerifyingQueue),
            solutionClusterVerifyingQueue: Object.fromEntries(
                solutionClusterVerifyingQueue
            ),
            solutionVerifiedQueue: Object.fromEntries(solutionVerifiedQueue),
            solutionsPendingToGetProcessQueue: Object.fromEntries(
                solutionsPendingToGetProcessQueue
            ),
        };

        if (type === "object") return solutionsMap;

        let dataArray = {
            solutionQueue: Object.keys(solutionsMap?.solutionQueue || {}).map(
                (key) => ({
                    ...solutionsMap?.solutionQueue[key],
                })
            ),
            solutionVerifyingQueue: Object.keys(
                solutionsMap?.solutionVerifyingQueue || {}
            ).map((key) => ({
                ...solutionsMap?.solutionVerifyingQueue[key],
            })),
            solutionClusterVerifyingQueue: Object.keys(
                solutionsMap?.solutionClusterVerifyingQueue || {}
            ).map((key) => ({
                ...solutionsMap?.solutionClusterVerifyingQueue[key],
            })),
            solutionVerifiedQueue: Object.keys(
                solutionsMap?.solutionVerifiedQueue || {}
            ).map((key) => ({
                ...solutionsMap?.solutionVerifiedQueue[key],
            })),
            solutionsPendingToGetProcessQueue: Object.keys(
                solutionsMap?.solutionsPendingToGetProcessQueue || {}
            ).map((key) => ({
                ...solutionsMap?.solutionsPendingToGetProcessQueue[key],
            })),
        };

        return dataArray;
    }

    export async function saveData() {
        if (!isDiskLoaded) return;
        await saveToDisk();
    }

    export async function saveToDisk(epoch?: number) {
        try {
            let moduleData = toJson("object");

            //add to solutionQueue again, verifying sols will be processed again
            moduleData.solutionQueue = {
                ...moduleData.solutionQueue,
                ...moduleData.solutionVerifyingQueue,
                ...moduleData.solutionClusterVerifyingQueue,
            };

            moduleData.solutionVerifyingQueue = {};
            moduleData.solutionClusterVerifyingQueue = {};

            fs.writeFileSync(
                `${DATA_PATH}/solutions-${process.env.MODE}-${
                    epoch || Explorer?.ticksData?.tickInfo?.epoch
                }.json`,
                JSON.stringify(moduleData)
            );
        } catch (e: any) {
            LOG(
                "error",
                `SolutionManager.saveToDisk: failed to save solutions to disk ${e}`
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
                fs.readFileSync(
                    `${DATA_PATH}/solutions-${process.env.MODE}-${epoch}.json`,
                    "utf-8"
                )
            );

            solutionQueue = new Map(Object.entries(moduleData.solutionQueue));
            solutionVerifyingQueue = new Map(
                Object.entries(moduleData.solutionVerifyingQueue)
            );
            solutionClusterVerifyingQueue = new Map(
                Object.entries(moduleData.solutionClusterVerifyingQueue)
            );
            solutionVerifiedQueue = new Map(
                Object.entries(moduleData.solutionVerifiedQueue)
            );
            solutionsPendingToGetProcessQueue = new Map(
                Object.entries(moduleData.solutionsPendingToGetProcessQueue)
            );
        } catch (error: any) {
            if (error.message.includes("no such file or directory")) {
                LOG(
                    "sys",
                    `solutions-${process.env.MODE}.json not found, will create new one`
                );
            } else {
                LOG("error", "SolutionManager.loadFromDisk: " + error.message);
                await Platform.exit(1);
            }
        }
    }

    export function init() {
        setInterval(() => {
            if (!NodeManager.initedVerifyThread) return;
            if (solutionVerifyingQueue.size < threads * 2) {
                let needToPush = Math.min(
                    solutionQueue.size,
                    threads * 2 - solutionVerifyingQueue.size
                );
                addNSolutionToVerifying(needToPush);
            }
        }, 100);

        //add to verifying queue from cluster queue again when it's not processed
        setInterval(() => {
            for (let [md5Hash, solution] of solutionClusterVerifyingQueue) {
                if (solutionClusterVerifyingQueueCounterMap.has(md5Hash)) {
                    solutionQueue.set(md5Hash, solution);
                    solutionClusterVerifyingQueueCounterMap.delete(md5Hash);
                    solutionClusterVerifyingQueue.delete(md5Hash);
                } else {
                    solutionClusterVerifyingQueueCounterMap.set(md5Hash, true);
                }
            }
        }, ONE_MINUTE);
    }

    export async function push(solution: Solution) {
        let md5Hash = await md5(
            solution.seed + solution.nonce + solution.computorId
        );
        if (
            solutionQueue.has(md5Hash) ||
            solutionVerifyingQueue.has(md5Hash) ||
            solutionVerifiedQueue.has(md5Hash) ||
            solutionClusterVerifyingQueue.has(md5Hash)
        )
            return null;
        solutionQueue.set(md5Hash, {
            seed: solution.seed,
            nonce: solution.nonce,
            computorId: solution.computorId,
            md5Hash,
            submittedAt: solution.submittedAt,
            from: solution.from,
        });

        return md5Hash;
    }

    export async function pushToPendingToGetInQueue(
        seed: string,
        nonce: string,
        computorId: string,
        wallet: string,
        workerUUID: string
    ) {
        let md5Hash = await md5(seed + nonce + computorId);
        if (
            solutionQueue.has(md5Hash) ||
            solutionVerifyingQueue.has(md5Hash) ||
            solutionVerifiedQueue.has(md5Hash) ||
            solutionClusterVerifyingQueue.has(md5Hash) ||
            solutionsPendingToGetProcessQueue.has(md5Hash)
        )
            return false;

        solutionsPendingToGetProcessQueue.set(md5Hash, {
            seed,
            nonce,
            computorId,
            md5Hash,
            from: wallet,
            workerUUID,
            submittedAt: Date.now(),
        });

        return true;
    }

    export function getPendingToGetProcessQueue() {
        return solutionsPendingToGetProcessQueue;
    }

    export async function processPendingToGetProcessQueue() {
        for (let [_, solution] of solutionsPendingToGetProcessQueue) {
            let isWriteForComputorIdOk = ComputorIdManager.writeSolution(
                solution.computorId,
                solution.nonce,
                solution.seed
            );

            if (!isWriteForComputorIdOk) {
                continue;
            }

            let md5Hash = await SolutionManager.push(solution as Solution);

            if (!md5Hash) {
                continue;
            }

            WorkerManager.pushSolution(
                solution.from,
                solution.workerUUID,
                md5Hash
            );
        }

        solutionsPendingToGetProcessQueue.clear();
    }

    export function clear() {
        solutionQueue.clear();
    }

    export function trySetWritten(md5Hash: string) {
        let solution = solutionVerifiedQueue.get(md5Hash);
        if (solution && isSolutionValid(md5Hash)) {
            if (!solution.isWritten) {
                QatumDb.setIsWrittenSolution(md5Hash);
                solution.isWritten = true;
            }
        }
    }

    export function remove(md5Hash: string) {
        solutionQueue.delete(md5Hash);
    }

    export function getLength() {
        return solutionQueue.size;
    }

    export function popSolution(fromCluster: boolean = false) {
        try {
            let [md5Hash, solution] = solutionQueue.entries().next().value as [
                string,
                Solution
            ];
            //this request pop solution from cluster, we don't need to push it to the queue on this server
            if (!fromCluster) {
                solutionVerifyingQueue.set(md5Hash, solution);
                NodeManager.pushSolutionToVerifyQueue(
                    solution.seed,
                    solution.nonce,
                    solution.computorId,
                    md5Hash
                );
            } else {
                solutionClusterVerifyingQueue.set(md5Hash, solution);
            }
            solutionQueue.delete(md5Hash);
            return solution;
        } catch (e: any) {
            return null;
        }
    }

    export function addNSolutionToVerifying(
        n: number,
        fromCluster: boolean = false
    ) {
        let returnSolutions: Solution[] = [];
        let i = 0;
        while (i < n && !isEmpty() && isEnable) {
            let solution = popSolution(fromCluster);
            if (solution) returnSolutions.push(solution);
            i++;
        }

        return returnSolutions;
    }

    export function clearVerifiedSolutions() {
        solutionVerifiedQueue.clear();
    }

    export function clearAllQueue() {
        solutionQueue.clear();
        solutionVerifyingQueue.clear();
        solutionClusterVerifyingQueue.clear();
        solutionVerifiedQueue.clear();
    }

    export function markAsVerified(
        md5Hash: string,
        {
            isShare,
            isSolution,
            resultScore,
        }: {
            isShare: boolean;
            isSolution: boolean;
            resultScore: number;
        }
    ) {
        let solution =
            (solutionVerifyingQueue.get(md5Hash) as Solution) ||
            (solutionClusterVerifyingQueue.get(md5Hash) as Solution);
        solutionVerifiedQueue.set(md5Hash, {
            ...solution,
            isSolution,
            isShare,
            isWritten: false,
            resultScore,
        });
        solutionVerifyingQueue.delete(md5Hash);
        solutionClusterVerifyingQueue.delete(md5Hash);

        //we only store solution
        if (isSolution || isShare)
            QatumDb.insertSolution(
                solutionVerifiedQueue.get(md5Hash) as SolutionNetState
            );
    }

    export function isEmpty() {
        return solutionQueue.size === 0;
    }

    export function isAllEmpty() {
        return (
            solutionQueue.size === 0 &&
            solutionVerifyingQueue.size === 0 &&
            solutionClusterVerifyingQueue.size === 0 &&
            solutionVerifiedQueue.size === 0 &&
            solutionsPendingToGetProcessQueue.size === 0
        );
    }

    export function isVerifyingEmpty() {
        return solutionVerifyingQueue.size === 0;
    }

    export function getVerifyingLength() {
        return solutionVerifyingQueue.size;
    }

    export function getVerifiedLength() {
        return solutionVerifiedQueue.size;
    }

    export function getSolutionFromVerifying(md5Hash: string) {
        return solutionVerifyingQueue.get(md5Hash);
    }

    export function getSolutionFromClusterVerifying(md5Hash: string) {
        return solutionClusterVerifyingQueue.get(md5Hash);
    }

    export function getVerifiedSolutionsResult(
        needToBeWritten: boolean = false
    ) {
        let solutions: SolutionNetState[] = [];
        for (let [_, solution] of solutionVerifiedQueue) {
            if (needToBeWritten && !solution.isWritten) continue;
            solutions.push(solution);
        }

        return solutions;
    }

    export function isSolutionValid(md5Hash: string) {
        return solutionVerifiedQueue.get(md5Hash)?.isSolution || false;
    }

    export function isSolutionShare(md5Hash: string) {
        return solutionVerifiedQueue.get(md5Hash)?.isShare || false;
    }

    export function isSolutionWritten(md5Hash: string) {
        return solutionVerifiedQueue.get(md5Hash)?.isWritten || false;
    }

    export function print() {
        console.log("solutionQueue", solutionQueue);
        console.log("solutionVerifyingQueue", solutionVerifyingQueue);
        console.log(
            "solutionClusterVerifyingQueue",
            solutionClusterVerifyingQueue
        );
        console.log("solutionVerifiedQueue", solutionVerifiedQueue);
    }
}

export { SolutionManager };
