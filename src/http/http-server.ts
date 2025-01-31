import express from "express";
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

namespace HttpServer {
    export async function createServer(httpPort: number) {
        const app = express();
        app.use(cors());
        app.use(express.json({ limit: "50mb" }));
        app.use(express.urlencoded({ limit: "50mb", extended: true }));

        app.get("/", (req, res) => {
            res.send("Hello Qubic!");
        });

        app.get("/mining-config", (req, res) => {
            try {
                res.send(ComputorIdManager.getMiningConfig());
            } catch (e: any) {
                res.status(500).send({
                    error: e.message,
                });
            }
        });

        app.post("/mining-config", (req, res) => {
            try {
                let miningConfig: MiningConfig = req.body as any;
                if (!miningConfig) {
                    res.status(400).send({
                        error: "miningConfig is required",
                    });
                    return;
                }
                ComputorIdManager.setMiningConfig(miningConfig);
                res.status(200).send({
                    isOk: true,
                });
            } catch (e: any) {
                res.status(500).send({
                    error: e.message,
                });
            }
        });

        app.get("/computor-id/detail", (req, res) => {
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

        app.get("/computor-ids", (req, res) => {
            try {
                res.send(ComputorIdManager.toApiFormat());
            } catch (e: any) {
                res.status(500).send({
                    error: e.message,
                });
            }
        });

        app.post("/computor-ids", async (req, res) => {
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
                        continue;
                    }

                    //detect delete .workers = -1 means delete
                    if (computorId.workers === -1) {
                        ComputorIdManager.removeComputorId(computorId.id);
                        ComputorIdManager.syncNewComputorIdForSockets();
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

        app.get("/solutions", (req, res) => {
            try {
                res.send(SolutionManager.toJson());
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
                epoch: ComputorIdManager.ticksData.tickInfo.epoch,
                estimatedIts: ApiData.estimatedIts,
                solutionsPerHour: ApiData.solutionsPerHour,
                solutionsPerHourEpoch: ApiData.solutionsPerHourEpoch,
                avgScore: ApiData.avgScore,
            });
        });

        app.get("/restartThread", (req, res) => {
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

        app.post("/difficulty", (req, res) => {
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

                res.status(200).send({
                    isOk: true,
                });
            } catch (error: any) {
                res.status(500).send({
                    error: error.message,
                });
            }
        });

        app.get("/difficulty", (req, res) => {
            res.send(NodeManager.getDifficulty());
        });

        app.get("/solutionData", async (req, res) => {
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

        app.post("/solutionData", (req, res) => {
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

        app.get("/payments/system/epoch", async (req, res) => {
            try {
                res.send({
                    epochs: PaymentManager.getEpochsNeedToPay(),
                });
            } catch (error: any) {
                res.status(500).send({
                    error: error.message,
                });
            }
        });

        app.post("/payments/system/epoch", async (req, res) => {
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
        });

        app.get("/payments/system/enable", async (req, res) => {
            res.send({
                enable: PaymentManager.isPaymentEnabled(),
            });
        });

        app.post("/payments/system/enable", async (req, res) => {
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
        });

        app.get("/payments/totalSolutions", async (req, res) => {
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
        });

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
                    res.send(
                        await QatumDb.getPaymentsAlongWithSolutionsValue(
                            epoch,
                            type,
                            limit,
                            offset
                        )
                    );
                }
            } catch (error: any) {
                res.status(500).send({
                    error: error.message,
                });
            }
        });

        app.put("/payments", async (req, res) => {
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
