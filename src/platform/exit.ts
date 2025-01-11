import { ComputorIdManager } from "../managers/computor-id-manger";
import NodeManager from "../managers/node-manager";
import { SolutionManager } from "../managers/solution-manager";
import WorkerManager from "../managers/worker-manager";

namespace Platform {
    export function exit(code: number = 0): void {
        NodeManager.stopVerifyThread();
        NodeManager.saveToDisk();
        ComputorIdManager.saveToDisk();
        WorkerManager.saveToDisk();
        SolutionManager.saveToDisk();
        process.exit(code);
    }
}

export default Platform;
