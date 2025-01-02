import { md5 } from "hash-wasm";
import NodeManager from "./node-manager";
import os from "os";
import Platform from "../platform/exit";
import { Solution } from "../types/type";

namespace SolutionManager {
    let solutionQueue: Map<string, Solution> = new Map();
    let solutionVerifingQue: Map<string, Solution> = new Map();
    let solutionVerifedQue: Map<
        string,
        Solution & {
            isSolution: boolean;
        }
    > = new Map();

    let threads = os.cpus().length;

    export function init() {
        setInterval(() => {
            if (solutionVerifingQue.size < threads * 2) {
                let needToPush = Math.min(
                    solutionQueue.size,
                    threads * 2 - solutionVerifingQue.size
                );
                addNSolutionToVerifing(needToPush);
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
            solutionVerifingQue.has(md5Hash) ||
            solutionVerifedQue.has(md5Hash)
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
            solutionVerifingQue.set(md5Hash, solution);
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

    export function addNSolutionToVerifing(n: number) {
        let i = 0;
        while (i < n && !isEmpty()) {
            popSolution();
            i++;
        }
    }

    export function markAsVerifed(md5Hash: string, isSolution: boolean) {
        let solution = solutionVerifingQue.get(md5Hash) as Solution;
        solutionVerifedQue.set(md5Hash, {
            ...solution,
            isSolution,
        });
        solutionVerifingQue.delete(md5Hash);
    }

    export function isEmpty() {
        return solutionQueue.size === 0;
    }

    export function isVerifingEmpty() {
        return solutionVerifingQue.size === 0;
    }

    export function getVerifingLength() {
        return solutionVerifingQue.size;
    }

    export function getVerifedLength() {
        return solutionVerifedQue.size;
    }

    export function getSolutionFromVerifying(md5Hash: string) {
        return solutionVerifingQue.get(md5Hash);
    }

    export function print() {
        console.log("solutionQueue", solutionQueue);
        console.log("solutionVerifingQue", solutionVerifingQue);
        console.log("solutionVerifedQue", solutionVerifedQue);
    }
}

export { SolutionManager };
