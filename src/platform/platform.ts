import { THREE_MINUTES } from "../consts/time";
import { ComputorIdManager } from "../managers/computor-id-manger";
import NodeManager from "../managers/node-manager";
import { SolutionManager } from "../managers/solution-manager";
import WorkerManager from "../managers/worker-manager";
import Explorer from "../utils/explorer";
import LOG from "../utils/logger";
import { ClusterSocketManager } from "../verification-cluster/cluster-socket-manager";

namespace Platform {
    export async function exit(code: number = 0) {
        if (!isNaN(Explorer?.ticksData?.tickInfo?.epoch)) {
            await saveData();
        }
        NodeManager.stopVerifyThread();
        process.exit(code);
    }

    export async function saveData() {
        await NodeManager.saveData();
        await ComputorIdManager.saveData();
        await WorkerManager.saveData();
        await SolutionManager.saveData();
        await ClusterSocketManager.saveData();
        await Explorer.saveData();
        LOG("sys", "data saved");
    }

    export async function loadData(epoch?: number) {
        let candicateEpoch = epoch || Explorer?.ticksData?.tickInfo?.epoch;

        await Explorer.loadData();
        await NodeManager.loadData();
        await ComputorIdManager.loadData(candicateEpoch);
        await WorkerManager.loadData(candicateEpoch);
        await SolutionManager.loadData(candicateEpoch);
        await ClusterSocketManager.loadData();
        LOG("sys", "data loaded");
    }
}

export default Platform;
