import net from "net";

export type QatumSocket = net.Socket & {
    isConnected: boolean;
    randomUUID: string;
    computorId: string;
    wallet: string;
    worker: string;
};

export interface ClusterData {
    randomUUID: string;
    ip: string;
    cpu: string;
    threads: number;
    solutionsVerified: number;
    isConnected: boolean;
    useThreads: number;
}

export type ClusterSocket = net.Socket & ClusterData;

export interface Transaction {
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

export interface SolutionData {
    nonce: string;
    miningSeed: string;
}

export interface Solution {
    seed: string;
    nonce: string;
    computorId: string;
    md5Hash: string;
    submittedAt: number;
}

export type SolutionPendingToProcess = Solution & {
    wallet: string;
    workerUUID: string;
};

export interface SolutionResult {
    md5Hash: string;
    resultScore: number;
}

export type SolutionNetState = Solution & {
    resultScore: number;
    isSolution: boolean;
    isWritten: boolean;
    isShare: boolean;
};

export interface QWorker {
    name: string;
    isActive: boolean;
    hashrate: number;
    solutions: string[];
    lastActive: number;
    startTimestamp: number;
}

export interface QWorkerApi {
    name: string;
    isActive: boolean;
    hashrate: number;
    solutions: number;
    solutionsVerified: number;
    solutionsWritten: number;
    solutionsShare: number;
    lastActive: number;
    startTimestamp: number;
}

export interface PaymentQutilData {
    id: string;
    amount: number;
}

export interface PaymentDbData {
    solutionsShare: number;
    solutionsVerified: number;
    solutionsWritten: number;
    epoch: number;
    insertedAt: number;
    wallet: string;
    isPaid: boolean;
    txId: string | null;
}

export type PaymentDbDataWithReward = PaymentDbData & {
    reward: number;
};

export interface EpochDbData {
    epoch: number;
    solutionValue: number;
    shareValue: number;
}

export interface ComputorIdData {
    workers: {
        //socketUUID: hashrate
        [key: string]: number | undefined;
    };
    totalHashrate: number;
    score: number;
    bcscore: number;
    mining: boolean;
    followingAvgScore: boolean;
    targetScore: number | undefined;
    ip: string;
    lastUpdateScoreTime: number;
    // we use map for faster access
    submittedSolutions: {
        //md5Hash: {isWrittenToBC, submittedTime}
        [key: string]: {
            isWrittenToBC: boolean;
            submittedTime: number;
        };
    };
    solutionsFetched: SolutionData[];
}

export interface ComputorIdDataApi {
    id: string;
    workers: number;
    totalHashrate: number;
    score: number;
    bcscore: number;
    mining: boolean;
    followingAvgScore: boolean;
    targetScore: number | undefined;
    ip: string;
    lastUpdateScoreTime: number;
    // we use map for faster access
    submittedSolutions: {
        isWrittenToBC: number;
        total: number;
    };
    solutionsFetched: number;
}

export interface ComputorIdDataMap {
    //ID
    [key: string]: ComputorIdData;
}

export interface ComputorEditableFields {
    mining?: boolean;
    followingAvgScore?: boolean;
    ip?: string;
}

export interface MiningConfig {
    diffHashRateToBalance: number; // hashrate difference between highest - lowest to balance
    diffSolutionToBalance: number; // solution difference between highest - lowest to balance
    avgOverRate: number; // when our ids below avg score, we should mine to target score = avgScore * avgOverRate
}

export interface TickInfo {
    tickInfo: {
        tick: number;
        duration: number;
        epoch: number;
        initialTick: number;
    };
}

export interface TickData {
    tickNumber: number;
    isEmpty: boolean;
}

export interface NodesApiGetData {
    nodeIps: string[];
    nodeIpsInactive: string[];
}

export interface NodesApiPostData {
    nodeIps: {
        add: string[];
        delete: string[];
    };
    nodeIpsInactive: {
        add: string[];
        delete: string[];
    };
}

export type PaymentDbState = "all" | "unpaid" | "paid";
