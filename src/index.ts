import "dotenv/config";

import HttpServer from "./http/http-server";
import { ComputorIdManager } from "./managers/computor-id-manger";
import NodeManager from "./managers/node-manager";
import fs from "fs";
import { DATA_PATH } from "./consts/path";
import Platform from "./platform/exit";
import { SolutionManager } from "./managers/solution-manager";
import QatumServer from "./qatum/qatum-server";

function createDataPath() {
    if (!fs.existsSync(DATA_PATH)) {
        fs.mkdirSync(DATA_PATH);
    }
}

async function main() {
    createDataPath();
    SolutionManager.init();
    await ComputorIdManager.init();
    await NodeManager.init(
        process.env.NODE_IP as string,
        process.env.SECRET_SEED as string
    );
    await QatumServer.createServer(Number(process.env.QATUM_PORT));
    await HttpServer.createServer(Number(process.env.HTTP_PORT));
}

main();

process.on("SIGINT", () => {
    Platform.exit(0);
});
