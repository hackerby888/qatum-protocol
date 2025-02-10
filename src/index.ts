import "dotenv/config";

import HttpServer from "./http/http-server";
import { ComputorIdManager } from "./managers/computor-id-manger";
import NodeManager from "./managers/node-manager";
import fs from "fs";
import { DATA_PATH } from "./consts/path";
import Platform from "./platform/platform";
import { SolutionManager } from "./managers/solution-manager";
import QatumServer from "./qatum/qatum-server";
import VerificationClusterServer from "./verification-cluster/cluster-server";
import os from "os";
import LOG from "./utils/logger";
import WorkerManager from "./managers/worker-manager";
import QatumDb from "./database/db";
import PaymentManager from "./managers/payment-manager";
import commandLineArgs from "command-line-args";
import Explorer from "./utils/explorer";

const optionDefinitions = [{ name: "mode", alias: "m", type: String }];
const options = commandLineArgs(optionDefinitions);

function createDataPath() {
    if (!fs.existsSync(DATA_PATH)) {
        fs.mkdirSync(DATA_PATH);
    }
}

async function main() {
    createDataPath();
    let mode = options.mode || process.env.MODE;
    if (mode === "main") {
        if (process.env.MONGODB_URI) {
            await QatumDb.connectDB();
        } else {
            LOG(
                "warning",
                "MONGODB_URI is not defined, skipping database connection (the pool still working)"
            );
        }
        await Explorer.init();
        Platform.loadData();
        await ComputorIdManager.init();
        WorkerManager.init();
        SolutionManager.init();
        PaymentManager.init();
        await NodeManager.init(
            process.env.NODE_IPS as string,
            process.env.SECRET_SEED as string
        );
        await QatumServer.createServer(Number(process.env.QATUM_PORT));
        await HttpServer.createServer(Number(process.env.HTTP_PORT));
        await VerificationClusterServer.createServer(
            Number(process.env.CLUSTER_PORT)
        );
    } else if (mode === "verify") {
        if (!process.env.CLUSTER_MAIN_SERVER) {
            LOG("error", "CLUSTER_MAIN_SERVER is not defined");
            Platform.exit(1);
        }
        NodeManager.initLogger();
        VerificationClusterServer.connectToServer(
            process.env.CLUSTER_MAIN_SERVER as string
        );
        SolutionManager.init();
        NodeManager.initVerifyThread(
            Number(process.env.MAX_VERIFICATION_THREADS) || os.cpus().length
        );
    } else {
        LOG("error", "mode is not defined");
        Platform.exit(1);
    }
}

main();

process.on("SIGINT", () => {
    Platform.exit(0);
});

process.on("uncaughtException", (err) => {
    LOG("error", err.message);
    Platform.exit(1);
});
