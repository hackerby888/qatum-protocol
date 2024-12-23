import "dotenv/config";

import HttpServer from "./http/http-server";
import { ComputorIdManager } from "./managers/computor-id-manger";
import NodeManager from "./managers/node-manager";
import StratumServer from "./stratum/stratum-server";
import { ONE_MINUTE } from "./consts/time";
import fs from "fs";
import { DATA_PATH, ROOT_DIR } from "./consts/path";
import Platform from "./platform/exit";

function createDataPath() {
    if (!fs.existsSync(DATA_PATH)) {
        fs.mkdirSync(DATA_PATH);
    }
}

async function main() {
    createDataPath();
    await ComputorIdManager.init();
    await NodeManager.init(
        process.env.NODE_IP as string,
        process.env.SECRET_SEED as string
    );
    await StratumServer.createServer(Number(process.env.STRATUM_PORT));
    await HttpServer.createServer(Number(process.env.HTTP_PORT));
}

main();

process.on("SIGINT", () => {
    Platform.exit(0);
});
