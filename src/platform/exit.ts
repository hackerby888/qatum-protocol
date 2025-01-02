import { ComputorIdManager } from "../managers/computor-id-manger";
import NodeManager from "../managers/node-manager";

namespace Platform {
    export function exit(code: number = 0): void {
        NodeManager.stopVerifyThread();
        ComputorIdManager.saveToDisk();
        process.exit(code);
    }
}

export default Platform;
