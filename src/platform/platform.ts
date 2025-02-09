import { THREE_MINUTES } from "../consts/time";
import { ComputorIdManager } from "../managers/computor-id-manger";
import NodeManager from "../managers/node-manager";
import { SolutionManager } from "../managers/solution-manager";
import WorkerManager from "../managers/worker-manager";
import LOG from "../utils/logger";
import { ClusterSocketManager } from "../verification-cluster/cluster-socket-manager";

namespace Platform {
    export function exit(code: number = 0): void {
        if (!isNaN(ComputorIdManager?.ticksData?.tickInfo?.epoch)) {
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
        LOG("sys", "data saved to disk");
    }
}

export default Platform;
