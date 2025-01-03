import { md5 } from "hash-wasm";
import NodeManager from "./node-manager";
import os from "os";
import Platform from "../platform/exit";
import { Solution, SolutionResult } from "../types/type";
import LOG from "../utils/logger";

namespace SolutionManager {
    let solutionQueue: Map<string, Solution> = new Map();
    let solutionVerifyingQueue: Map<string, Solution> = new Map();
    let solutionClusterVerifyingQueue: Map<string, Solution> = new Map();
    let solutionVerifiedQueue: Map<
        string,
        Solution & {
            isSolution: boolean;
        }
    > = new Map();

    let threads =
        Number(process.env.MAX_VERIFICATION_THREADS) || os.cpus().length;

    export function init() {
        setInterval(() => {
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
            return false;

        solutionQueue.set(md5Hash, { seed, nonce, computorId, md5Hash });

        return true;
    }

    export function clear() {
        solutionQueue.clear();
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

    export function markAsVerified(md5Hash: string, isSolution: boolean) {
        let solution =
            (solutionVerifyingQueue.get(md5Hash) as Solution) ||
            (solutionClusterVerifyingQueue.get(md5Hash) as Solution);
        solutionVerifiedQueue.set(md5Hash, {
            ...solution,
            isSolution,
        });
        solutionVerifyingQueue.delete(md5Hash);
        solutionClusterVerifyingQueue.delete(md5Hash);
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

    export function getVerifiedSolutionsResult() {
        let solutions: SolutionResult[] = [];
        for (let [_, solution] of solutionVerifiedQueue) {
            solutions.push({
                md5Hash: solution.md5Hash,
                isSolution: solution.isSolution,
            } as SolutionResult);
        }

        return solutions;
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
