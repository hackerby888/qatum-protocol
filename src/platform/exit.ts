import { ComputorIdManager } from "../managers/computor-id-manger";

namespace Platform {
    export function exit(code: number): void {
        ComputorIdManager.saveToDisk();
        process.exit(code);
    }
}

export default Platform;
