import { THREE_MINUTES } from "../consts/time";
import { ComputorIdManager } from "../managers/computor-id-manger";
import NodeManager from "../managers/node-manager";
import { SolutionManager } from "../managers/solution-manager";
import WorkerManager from "../managers/worker-manager";
import Explorer from "../utils/explorer";
import LOG from "../utils/logger";
import { ClusterSocketManager } from "../verification-cluster/cluster-socket-manager";

namespace Platform {
    export function exit(code: number = 0): void {
        if (!isNaN(Explorer?.ticksData?.tickInfo?.epoch)) {
            saveData();
        }
        NodeManager.stopVerifyThread();
        process.exit(code);
    }

    export function saveData(): void {
        NodeManager.saveToDisk();
        ComputorIdManager.saveToDisk();
        WorkerManager.saveToDisk();
        SolutionManager.saveToDisk();
        ClusterSocketManager.saveToDisk();
        Explorer.saveToDisk();
        LOG("sys", "data saved to disk");
    }

    export function loadData(epoch?: number): void {
        let candicateEpoch = epoch || Explorer?.ticksData?.tickInfo?.epoch;

        NodeManager.loadFromDisk();
        ComputorIdManager.loadFromDisk(candicateEpoch);
        WorkerManager.loadFromDisk(candicateEpoch);
        SolutionManager.loadFromDisk(candicateEpoch);
        ClusterSocketManager.loadFromDisk();
        LOG("sys", "data loaded from disk");
    }
}

export default Platform;
