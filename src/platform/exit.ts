import { ComputorIdManager } from "../managers/computor-id-manger";

namespace Platform {
    export function exit(code: number = 0): void {
        ComputorIdManager.saveToDisk();
        process.exit(code);
    }
}

export default Platform;
