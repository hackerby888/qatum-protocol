import { ComputorIdManager } from "./managers/computor-id-manger";
import NodeManager from "./managers/node-manager";
import StratumServer from "./stratum/stratum-server";

async function main() {
    await StratumServer.createServer(Number(process.env.STRATUM_PORT || 5000));
    await NodeManager.initToNodeSocket("82.197.173.132");
    await NodeManager.sendSolution(
        "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        "UFKEDQHDBSBMSCMABBWBPJYNAHGBTGUMFXNVDHPALBVRVATVTGFEHTCCUGAA"
    );
    // ComputorIdManager.createRandomIdWithMaxTotalHashrate(1000);
    // ComputorIdManager.createRandomIdWithMaxTotalHashrate(3000);
    // ComputorIdManager.createRandomIdWithMaxTotalHashrate(3000, false);
    // console.log(ComputorIdManager.getComputorIds());
    // ComputorIdManager.autoBalanceComputorIdHashrate();
    // console.log(ComputorIdManager.getComputorIds());
}

main();
