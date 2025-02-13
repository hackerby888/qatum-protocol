import express, { Request } from "express";
import cors from "cors";
import LOG from "../utils/logger";
import { ComputorIdManager } from "../managers/computor-id-manger";
import WorkerManager from "../managers/worker-manager";
import { SolutionManager } from "../managers/solution-manager";
import NodeManager from "../managers/node-manager";
import QatumDb from "../database/db";
import PaymentManager from "../managers/payment-manager";
import {
    ComputorEditableFields,
    ComputorIdDataApi,
    EpochDbData,
    MiningConfig,
} from "../types/type";
import ApiData from "../utils/qli-apis/global-data";
import { ClusterSocketManager } from "../verification-cluster/cluster-socket-manager";
import jwt from "jsonwebtoken";
import Explorer from "../utils/explorer";

namespace HttpServer {
    function verifyTokenMiddleware(req: Request, res: any, next: any) {
        try {
            if (!req.headers.token) {
                res.status(401).send({
                    error: "token is required",
                });
                return;
            }
            let token = (req.headers.token as string).split(" ")[1] as string;
            try {
                jwt.verify(token, process.env.SECRET_SEED as string);
            } catch (e: any) {
                res.status(401).send({
                    error: e.message,
                });
                return;
            }

            next();
        } catch (e: any) {
            res.status(500).send({
                error: e.message,
            });
        }
    }
    export async function createServer(httpPort: number) {
        const app = express();
        app.use(cors());
        app.use(express.json({ limit: "50mb" }));
        app.use(express.urlencoded({ limit: "50mb", extended: true }));

        app.get("/", (req, res) => {
            res.send("Hello Qubic!");
        });

        app.post("/login", (req, res) => {
            try {
                let user = req.body.user as string;
                let password = req.body.password as string;
                if (
                    user !== process.env.ADMIN_USERNAME ||
                    password !== process.env.ADMIN_PASSWORD
                ) {
                    res.status(401).send({
                        error: "invalid username or password",
                    });
                    return;
                }
                const token = jwt.sign(
                    { user: user },
                    process.env.SECRET_SEED as string,
                    {
                        expiresIn: "24h",
                    }
                );
                res.status(200).send({
                    isOk: true,
                    token,
                });
            } catch (e: any) {
                res.status(500).send({
                    error: e.message,
                });
            }
        });

        app.get("/nodes", verifyTokenMiddleware, (req, res) => {
            try {
                res.send({
                    nodeIps: NodeManager.nodeIps,
                    nodeIpsInactive: NodeManager.nodeIpsInactive,
                });
            } catch (e: any) {
                res.status(500).send({
                    error: e.message,
                });
            }
        });

        app.post("/nodes", verifyTokenMiddleware, (req, res) => {
            try {
                let nodesData = req.body as {
                    nodeIps: {
                        add: string[];
                        delete: string[];
                    };
                    nodeIpsInactive: {
                        add: string[];
                        delete: string[];
                    };
                };

                for (let ip of nodesData.nodeIps.add) {
                    NodeManager.pushNodeIp(ip);
                }

                for (let ip of nodesData.nodeIps.delete) {
                    NodeManager.removeNodeIp(ip);
                }

                for (let ip of nodesData.nodeIpsInactive.add) {
                    NodeManager.pushNodeIp(ip, "inactive");
                }

                for (let ip of nodesData.nodeIpsInactive.delete) {
                    NodeManager.removeNodeIp(ip, "inactive");
                }

                res.status(200).send({
                    isOk: true,
                });
            } catch (e: any) {
                res.status(500).send({
                    error: e.message,
                });
            }
        });

        app.get("/cluster", verifyTokenMiddleware, (req, res) => {
            res.send(ClusterSocketManager.toJson());
        });

        app.post(
            "/cluster/clear-inactive",
            verifyTokenMiddleware,
            (req, res) => {
                try {
                    ClusterSocketManager.clearInactiveSockets();
                    res.send({
                        isOk: true,
                    });
                } catch (e: any) {
                    res.status(500).send({
                        error: e.message,
                    });
                }
            }
        );

        app.get("/mining-config", verifyTokenMiddleware, (_, res) => {
            try {
                res.send(ComputorIdManager.getMiningConfig());
            } catch (e: any) {
                res.status(500).send({
                    error: e.message,
                });
            }
        });

        app.post("/mining-config", verifyTokenMiddleware, async (req, res) => {
            try {
                let miningConfig: MiningConfig = req.body as any;
                if (!miningConfig) {
                    res.status(400).send({
                        error: "miningConfig is required",
                    });
                    return;
                }
                ComputorIdManager.setMiningConfig(miningConfig);
                await ComputorIdManager.saveToDb();
                res.status(200).send({
                    isOk: true,
                });
            } catch (e: any) {
                res.status(500).send({
                    error: e.message,
                });
            }
        });

        app.get("/computor-id/detail", verifyTokenMiddleware, (req, res) => {
            try {
                let walletMap: {
                    [wallet: string]: {
                        workers: number;
                        hashrate: number;
                    };
                } = {};

                let computorId = req.query.computorId as string;

                if (!computorId) {
                    res.status(400).send({
                        error: "computorId is required",
                    });
                    return;
                }

                let theComputorId = ComputorIdManager.getComputorId(computorId);

                for (let workerId in theComputorId.workers) {
                    let wallet = WorkerManager.getWalletFromWorkerId(workerId);
                    if (wallet) {
                        if (!walletMap[wallet])
                            walletMap[wallet] = { workers: 0, hashrate: 0 };

                        walletMap[wallet].workers++;
                        walletMap[wallet].hashrate +=
                            theComputorId.workers[workerId] || 0;
                    }
                }

                let walletArray = Object.keys(walletMap).map((wallet) => {
                    return {
                        wallet,
                        ...walletMap[wallet],
                    };
                });

                res.status(200).send({
                    walletArray,
                });
            } catch (e: any) {
                res.status(500).send({
                    error: e.message,
                });
            }
        });

        app.get("/computor-ids", verifyTokenMiddleware, (req, res) => {
            try {
                res.send(ComputorIdManager.toApiFormat());
            } catch (e: any) {
                res.status(500).send({
                    error: e.message,
                });
            }
        });

        app.post("/computor-ids", verifyTokenMiddleware, async (req, res) => {
            try {
                let computorIds: ComputorIdDataApi[] = req.body.computorIds;

                if (!computorIds) {
                    res.status(400).send({
                        error: "computorIds is required",
                    });
                    return;
                }

                // we sort the computorIds by workers to make sure we always handle the delete after all
                computorIds = computorIds.sort((a, b) => b.workers - a.workers);

                let haveAddComputorId = false;

                for (let computorId of computorIds) {
                    if (!computorId?.id) {
                        continue;
                    }
                    //detect add
                    if (!ComputorIdManager.getComputorId(computorId.id)) {
                        ComputorIdManager.addComputorId(computorId.id, {
                            mining: computorId.mining,
                            followingAvgScore: computorId.followingAvgScore,
                            ip: computorId.ip,
                        });
                        haveAddComputorId = true;
                        continue;
                    }

                    //detect delete .workers = -1 means delete
                    if (computorId.workers === -1) {
                        if (ComputorIdManager.getComputorId(computorId.id)) {
                            ComputorIdManager.removeComputorId(computorId.id);
                            ComputorIdManager.syncNewComputorIdForSockets();
                        }
                        continue;
                    }

                    //detect update
                    let editableFields: ComputorEditableFields = {};
                    if (computorId.mining !== undefined)
                        editableFields.mining = computorId.mining;
                    if (computorId.followingAvgScore !== undefined)
                        editableFields.followingAvgScore =
                            computorId.followingAvgScore;
                    if (computorId.ip !== undefined)
                        editableFields.ip = computorId.ip;
                    ComputorIdManager.updateComputorId(
                        computorId.id,
                        editableFields
                    );
                    continue;
                }

                if (haveAddComputorId) {
                    await ComputorIdManager.fetchScoreV2(false, false, true);
                }

                res.status(200).send({
                    isOk: true,
                });
            } catch (e: any) {
                res.status(500).send({
                    error: e.message,
                });
            }
        });

        app.get("/workers", (req, res) => {
            try {
                let wallet = req.query.wallet as string;
                let needActive = req.query.needActive === "true";
                if (!wallet) {
                    res.status(400).send({
                        error: "wallet is required",
                    });
                    return;
                }
                res.send(WorkerManager.getWorkers(wallet, needActive, true));
            } catch (e: any) {
                res.status(500).send({
                    error: e.message,
                });
            }
        });

        app.post(
            "/solutions/system/enable",
            verifyTokenMiddleware,
            (req, res) => {
                try {
                    let enable = req.body.enable;
                    if (enable) SolutionManager.enable();
                    else SolutionManager.disable();
                    res.send({
                        isOk: true,
                    });
                } catch (e: any) {
                    res.status(500).send({
                        error: e.message,
                    });
                }
            }
        );

        app.get(
            "/solutions/system/enable",
            verifyTokenMiddleware,
            (req, res) => {
                res.send({
                    enable: SolutionManager.getIsEnable(),
                });
            }
        );

        app.get("/solutions", verifyTokenMiddleware, async (req, res) => {
            try {
                let epoch = Number(req.query.epoch);
                if (
                    isNaN(epoch) ||
                    epoch === Explorer.ticksData.tickInfo.epoch
                ) {
                    res.send({
                        ...SolutionManager.toJson(),
                        solutionsToSubmitQueue:
                            NodeManager.solutionsToSubmitQueue,
                    });
                } else {
                    //query from db
                    res.send(await QatumDb.getTotalSolutions(epoch));
                }
            } catch (e: any) {
                res.status(500).send({
                    error: e.message,
                });
            }
        });

        app.get("/globalStats", (req, res) => {
            res.send({
                ...WorkerManager.getGlobalStats(),
                isShareModeEpoch:
                    NodeManager.difficulty.net !== NodeManager.difficulty.pool,
                epoch: Explorer.ticksData.tickInfo.epoch,
                estimatedIts: ApiData.estimatedIts,
                solutionsPerHour: ApiData.solutionsPerHour,
                solutionsPerHourEpoch: ApiData.solutionsPerHourEpoch,
                avgScore: ApiData.avgScore,
            });
        });

        app.get("/restartThread", verifyTokenMiddleware, (req, res) => {
            try {
                NodeManager.restartVerifyThread();
                res.status(200).send({
                    isOk: true,
                });
            } catch (error: any) {
                res.status(500).send({
                    error: error.message,
                });
            }
        });

        app.post("/difficulty", verifyTokenMiddleware, async (req, res) => {
            try {
                let difficulty = req.body.difficulty as {
                    pool?: number;
                    net?: number;
                };

                if (!difficulty) {
                    res.status(400).send({
                        error: "difficulty is required",
                    });
                    return;
                }

                NodeManager.setDifficulty(difficulty);
                await NodeManager.saveToDb();
                res.status(200).send({
                    isOk: true,
                });
            } catch (error: any) {
                res.status(500).send({
                    error: error.message,
                });
            }
        });

        app.get("/difficulty", verifyTokenMiddleware, (req, res) => {
            res.send(NodeManager.getDifficulty());
        });

        app.get("/solutionData", verifyTokenMiddleware, async (req, res) => {
            try {
                let epoch = Number(req.query.epoch);
                if (!epoch) {
                    res.status(400).send({
                        error: "epoch is required",
                    });
                    return;
                }
                let result = await QatumDb.getEpochSolutionValue(epoch);
                if (result) res.send(result);
                else res.send({});
            } catch (error: any) {
                res.status(500).send({
                    error: error.message,
                });
            }
        });

        app.post("/solutionData", verifyTokenMiddleware, (req, res) => {
            try {
                let epochData = req.body as EpochDbData;
                epochData.epoch = Number(epochData.epoch);
                epochData.solutionValue = Number(epochData.solutionValue);
                epochData.shareValue = Number(epochData.shareValue);

                if (
                    isNaN(epochData.epoch) ||
                    isNaN(epochData.solutionValue) ||
                    isNaN(epochData.shareValue)
                ) {
                    res.status(400).send({
                        error: "epochData is required",
                    });
                    return;
                }

                QatumDb.setEpochSolutionValue(epochData);

                res.status(200).send({
                    isOk: true,
                });
            } catch (error: any) {
                res.status(500).send({
                    error: error.message,
                });
            }
        });

        app.get(
            "/payments/system/epoch",
            verifyTokenMiddleware,
            async (req, res) => {
                try {
                    res.send({
                        epochs: PaymentManager.getEpochsNeedToPay(),
                    });
                } catch (error: any) {
                    res.status(500).send({
                        error: error.message,
                    });
                }
            }
        );

        app.post(
            "/payments/system/epoch",
            verifyTokenMiddleware,
            async (req, res) => {
                try {
                    let epochs: {
                        add: number[];
                        remove: number[];
                    } = req.body.epochs;
                    if (!epochs) {
                        res.status(400).send({
                            error: "epochs is required",
                        });
                        return;
                    }

                    for (let epoch of epochs?.add || []) {
                        PaymentManager.pushEpochToPay(epoch);
                    }

                    for (let epoch of epochs?.remove || []) {
                        PaymentManager.removeEpochToPay(epoch);
                    }

                    res.send({ isOk: true });
                } catch (error: any) {
                    res.status(500).send({
                        error: error.message,
                    });
                }
            }
        );

        app.get(
            "/payments/system/enable",
            verifyTokenMiddleware,
            async (req, res) => {
                res.send({
                    enable: PaymentManager.isPaymentEnabled(),
                });
            }
        );

        app.post(
            "/payments/system/enable",
            verifyTokenMiddleware,
            async (req, res) => {
                try {
                    let enable = req.body.enable;
                    if (enable) PaymentManager.enablePayment();
                    else PaymentManager.disablePayment();
                    res.send({
                        isOk: true,
                    });
                } catch (error: any) {
                    res.status(500).send({
                        error: error.message,
                    });
                }
            }
        );

        app.get(
            "/payments/totalSolutions",
            verifyTokenMiddleware,
            async (req, res) => {
                try {
                    let epoch = Number(req.query.epoch);
                    if (isNaN(epoch)) {
                        res.status(400).send({
                            error: "epoch is required",
                        });
                        return;
                    }
                    res.send(await QatumDb.getTotalSolutions(epoch));
                } catch (error: any) {
                    res.status(500).send({
                        error: error.message,
                    });
                }
            }
        );

        app.get("/payments", async (req, res) => {
            try {
                let wallet = req.query.wallet as string;
                let limit = Number(req.query.limit);
                let offset = Number(req.query.offset);
                let type = req.query.type as "all" | "paid" | "unpaid";
                if (wallet) {
                    res.send(
                        await QatumDb.getPaymentsAlongWithSolutionsValue(
                            -1,
                            type,
                            limit,
                            offset,
                            wallet
                        )
                    );
                } else {
                    let epoch = Number(req.query.epoch);
                    if (isNaN(epoch)) {
                        res.status(400).send({
                            error: "epoch is required",
                        });
                        return;
                    }

                    verifyTokenMiddleware(req, res, async () => {
                        res.send(
                            await QatumDb.getPaymentsAlongWithSolutionsValue(
                                epoch,
                                type,
                                limit,
                                offset
                            )
                        );
                    });
                }
            } catch (error: any) {
                res.status(500).send({
                    error: error.message,
                });
            }
        });

        app.put("/payments", verifyTokenMiddleware, async (req, res) => {
            try {
                let paymentData = req.body as {
                    wallet: string;
                    epoch: number;
                    txId: string;
                };

                if (
                    !paymentData.wallet ||
                    !paymentData.epoch ||
                    !paymentData.txId
                ) {
                    res.status(400).send({
                        error: "paymentData is required",
                    });
                    return;
                }

                await QatumDb.markPaymentAsPaid(
                    paymentData.wallet,
                    paymentData.epoch,
                    paymentData.txId
                );

                res.status(200).send({
                    isOk: true,
                });
            } catch (error: any) {
                res.status(500).send({
                    error: error.message,
                });
            }
        });

        app.listen(httpPort, () => {
            LOG("http", `http server listening on port ${httpPort}`);
        });
    }
}

export default HttpServer;
