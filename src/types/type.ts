import net from "net";

type QatumSocket = net.Socket & {
    isConnected: boolean;
    randomUUID: string;
    computorId: string;
    wallet: string;
    worker: string;
};

interface Transaction {
    sourceId: string;
    destId: string;
    amount: string;
    tickNumber: number;
    inputType: number;
    inputSize: number;
    inputHex: string; // 64 bytes in hex format : firt 32 bytes is the seed, last 32 bytes is the nonce, only available if inputType is 2 (solution tx) | https://github.com/qubic/core/blob/df0f5a551ce01be2b805060858c8ffe4e320a0e3/src/mining/mining.h#L5
    signatureHex: string;
    txId: string;
}

interface SolutionData {
    nonce: string;
    miningSeed: string;
}

interface Solution {
    seed: string;
    nonce: string;
    computorId: string;
    md5Hash: string;
}

interface SolutionResult {
    md5Hash: string;
    isSolution: boolean;
}

type SolutionState = Solution & {
    isSolution: boolean;
    isWritten: boolean;
};

interface QWorker {
    name: string;
    isActive: boolean;
    hashrate: number;
    solutions: string[];
    lastActive: number;
}

interface QWorkerApi {
    name: string;
    isActive: boolean;
    hashrate: number;
    solutions: number;
    solutionsVerified: number;
    solutionsWritten: number;
    lastActive: number;
}

export {
    QatumSocket,
    Transaction,
    SolutionData,
    Solution,
    SolutionResult,
    QWorker,
    QWorkerApi,
    SolutionState,
};
