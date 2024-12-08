import "dotenv/config";

import HttpServer from "./http/http-server";
import { ComputorIdManager } from "./managers/computor-id-manger";
import NodeManager from "./managers/node-manager";
import StratumServer from "./stratum/stratum-server";
import { ONE_MINUTE } from "./consts/time";

async function main() {
    await ComputorIdManager.init();
    ComputorIdManager.createRandomIdWithMaxTotalHashrate(5000);
    await NodeManager.initToNodeSocket("82.197.173.132");
    await StratumServer.createServer(Number(process.env.STRATUM_PORT));
    await HttpServer.createServer(Number(process.env.HTTP_PORT));
    // console.log(ComputorIdManager.getComputorIds());
    // ComputorIdManager.autoBalanceComputorIdHashrate();
    // console.log(ComputorIdManager.getComputorIds());
    setTimeout(() => {
        ComputorIdManager.createRandomIdWithMaxTotalHashrate(1000);
    }, ONE_MINUTE);
}

main();
