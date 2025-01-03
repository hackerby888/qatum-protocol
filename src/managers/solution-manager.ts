import { md5 } from "hash-wasm";
import NodeManager from "./node-manager";
import os from "os";
import Platform from "../platform/exit";
import { Solution } from "../types/type";

namespace SolutionManager {
    let solutionQueue: Map<string, Solution> = new Map();
    let solutionVerifyingQueue: Map<string, Solution> = new Map();
    let solutionVerifiedQueue: Map<
        string,
        Solution & {
            isSolution: boolean;
        }
    > = new Map();

    let threads = os.cpus().length;

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
            solutionVerifiedQueue.has(md5Hash)
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

    export function popSolution() {
        try {
            let [md5Hash, solution] = solutionQueue.entries().next().value as [
                string,
                Solution
            ];
            solutionVerifyingQueue.set(md5Hash, solution);
            NodeManager.pushSolutionToVerifyQueue(
                solution.seed,
                solution.nonce,
                solution.computorId,
                md5Hash
            );
            solutionQueue.delete(md5Hash);
            return solution;
        } catch (e: any) {
            return null;
        }
    }

    export function addNSolutionToVerifying(n: number) {
        let i = 0;
        while (i < n && !isEmpty()) {
            popSolution();
            i++;
        }
    }

    export function markAsVerified(md5Hash: string, isSolution: boolean) {
        let solution = solutionVerifyingQueue.get(md5Hash) as Solution;
        solutionVerifiedQueue.set(md5Hash, {
            ...solution,
            isSolution,
        });
        solutionVerifyingQueue.delete(md5Hash);
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

    export function print() {
        console.log("solutionQueue", solutionQueue);
        console.log("solutionVerifyingQueue", solutionVerifyingQueue);
        console.log("solutionVerifiedQueue", solutionVerifiedQueue);
    }
}

export { SolutionManager };
