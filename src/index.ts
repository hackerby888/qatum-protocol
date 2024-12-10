import "dotenv/config";

import HttpServer from "./http/http-server";
import { ComputorIdManager } from "./managers/computor-id-manger";
import NodeManager from "./managers/node-manager";
import StratumServer from "./stratum/stratum-server";
import { ONE_MINUTE } from "./consts/time";

async function main() {
    await ComputorIdManager.init();
    await NodeManager.initToNodeSocket(process.env.NODE_IP as string);
    await StratumServer.createServer(Number(process.env.STRATUM_PORT));
    await HttpServer.createServer(Number(process.env.HTTP_PORT));
}

main();
