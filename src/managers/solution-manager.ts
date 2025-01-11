import { md5 } from "hash-wasm";
import NodeManager from "./node-manager";
import os from "os";
import Platform from "../platform/exit";
import { Solution, SolutionNetState } from "../types/type";
import LOG from "../utils/logger";
import { DATA_PATH } from "../consts/path";
import fs from "fs";
import QatumDb from "../database/db";

namespace SolutionManager {
    let solutionQueue: Map<string, Solution> = new Map();
    let solutionVerifyingQueue: Map<string, Solution> = new Map();
    let solutionClusterVerifyingQueue: Map<string, Solution> = new Map();
    let solutionVerifiedQueue: Map<string, SolutionNetState> = new Map();

    let threads =
        Number(process.env.MAX_VERIFICATION_THREADS) || os.cpus().length;

    export function toJson() {
        return {
            solutionQueue: Object.fromEntries(solutionQueue),
            solutionVerifyingQueue: Object.fromEntries(solutionVerifyingQueue),
            solutionClusterVerifyingQueue: Object.fromEntries(
                solutionClusterVerifyingQueue
            ),
            solutionVerifiedQueue: Object.fromEntries(solutionVerifiedQueue),
        };
    }

    export function saveToDisk() {
        try {
            let moduleData = toJson();

            //add to solutionQueue again, verifying sols will be processed again
            moduleData.solutionQueue = {
                ...moduleData.solutionQueue,
                ...moduleData.solutionVerifyingQueue,
            };

            moduleData.solutionVerifyingQueue = {};

            fs.writeFileSync(
                `${DATA_PATH}/solutions-${process.env.MODE}.json`,
                JSON.stringify(moduleData)
            );
        } catch (e: any) {
            LOG("error", `failed to save solutions to disk ${e}`);
        }
    }

    export function loadFromDisk() {
        try {
            let moduleData = JSON.parse(
                fs.readFileSync(
                    `${DATA_PATH}/solutions-${process.env.MODE}.json`,
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
        } catch (error: any) {
            if (error.message.includes("no such file or directory")) {
                LOG(
                    "sys",
                    `solutions-${process.env.MODE}.json not found, creating new one`
                );
            } else {
                LOG("error", error.message);
            }
        }
    }

    export function init() {
        loadFromDisk();
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
    }

    export async function push(
        seed: string,
        nonce: string,
        computorId: string
    ) {
        let md5Hash = await md5(seed + nonce + computorId);
        if (
            solutionQueue.has(md5Hash) ||
            solutionVerifyingQueue.has(md5Hash) ||
            solutionVerifiedQueue.has(md5Hash) ||
            solutionClusterVerifyingQueue.has(md5Hash)
        )
            return null;
        solutionQueue.set(md5Hash, { seed, nonce, computorId, md5Hash });

        return md5Hash;
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
        while (i < n && !isEmpty()) {
            let solution = popSolution(fromCluster);
            if (solution) returnSolutions.push(solution);
            i++;
        }

        return returnSolutions;
    }

    export function clearVerifiedSolutions() {
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
        if (isSolution)
            QatumDb.insertSolution(
                solutionVerifiedQueue.get(md5Hash) as SolutionNetState
            );
    }

    export function isEmpty() {
        return solutionQueue.size === 0;
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
