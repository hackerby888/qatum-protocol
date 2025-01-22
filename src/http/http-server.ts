import express from "express";
import cors from "cors";
import LOG from "../utils/logger";
import { ComputorIdManager } from "../managers/computor-id-manger";
import WorkerManager from "../managers/worker-manager";
import { SolutionManager } from "../managers/solution-manager";
import NodeManager from "../managers/node-manager";
import QatumDb from "../database/db";
import PaymentManager from "../managers/payment-manager";
import { EpochDbData } from "../types/type";

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
                res.status(500).send(e.message);
            }
        });

        app.put("/mining-config", (req, res) => {
            try {
                let miningConfig: {
                    diffHashRateToBalance: number;
                    diffSolutionToBalance: number;
                    avgOverRate: number;
                } = req.body as any;
                ComputorIdManager.setMiningConfig(miningConfig);
                res.status(200).send({
                    isOk: true,
                });
            } catch (e: any) {
                res.status(500).send(e.message);
            }
        });

        app.get("/computor-ids", (req, res) => {
            try {
                res.send(ComputorIdManager.getComputorIds());
            } catch (e: any) {
                res.status(500).send(e.message);
            }
        });

        app.post("/computor-id", async (req, res) => {
            try {
                let computorId = req.body.computorId as string;
                if (!computorId) {
                    res.status(400).send("computorId is required");
                    return;
                }
                let settings: {
                    ip?: string;
                    mining?: boolean;
                    followingAvgScore?: boolean;
                } = req.body.settings || {};
                ComputorIdManager.addComputorId(computorId, settings);
                res.status(200).send({
                    isOk: true,
                });
            } catch (e: any) {
                res.status(500).send(e.message);
            }
        });

        app.put("/computor-id", (req, res) => {
            try {
                let computorId = req.body.computorId as string;
                if (!computorId) {
                    res.status(400).send("computorId is required");
                    return;
                }
                let settings: {
                    ip?: string;
                    mining?: boolean;
                    followingAvgScore?: boolean;
                } = req.body.settings || {};
                ComputorIdManager.updateComputorId(computorId, settings);
                res.status(200).send({
                    isOk: true,
                });
            } catch (e: any) {
                res.status(500).send(e.message);
            }
        });

        app.delete("/computor-id", (req, res) => {
            try {
                let computorId = req.body.computorId as string;
                if (!computorId) {
                    res.status(400).send("computorId is required");
                    return;
                }
                ComputorIdManager.removeComputorId(computorId);
                ComputorIdManager.syncNewComputorIdForSockets();
                res.status(200).send({
                    isOk: true,
                });
            } catch (e: any) {
                res.status(500).send(e.message);
            }
        });

        app.get("/workers", (req, res) => {
            try {
                let wallet = req.query.wallet as string;
                let needActive = req.query.needActive === "true";
                if (!wallet) {
                    res.status(400).send("wallet is required");
                    return;
                }
                res.send(WorkerManager.getWorkers(wallet, needActive, true));
            } catch (e: any) {
                res.status(500).send(e.message);
            }
        });

        app.get("/solutions", (req, res) => {
            try {
                res.send(SolutionManager.toJson());
            } catch (e: any) {
                res.status(500).send(e.message);
            }
        });

        app.get("/globalStats", (req, res) => {
            res.send(WorkerManager.getGlobalStats());
        });

        app.get("/restartThread", (req, res) => {
            try {
                NodeManager.restartVerifyThread();
                res.status(200).send({
                    isOk: true,
                });
            } catch (error: any) {
                res.status(500).send(error.message);
            }
        });

        app.post("/difficulty", (req, res) => {
            try {
                let difficulty = req.body.difficulty as {
                    pool?: number;
                    net?: number;
                };

                if (!difficulty) {
                    res.status(400).send("difficulty is required");
                    return;
                }

                NodeManager.setDifficulty(difficulty);

                res.status(200).send({
                    isOk: true,
                });
            } catch (error: any) {
                res.status(500).send(error.message);
            }
        });

        app.get("/difficulty", (req, res) => {
            res.send(NodeManager.getDifficulty());
        });

        app.get("/solutionData", async (req, res) => {
            try {
                let epoch = Number(req.query.epoch);
                if (!epoch) {
                    res.status(400).send("epoch is required");
                    return;
                }
                res.send(await QatumDb.getEpochSolutionValue(epoch));
            } catch (error: any) {
                res.status(500).send(error.message);
            }
        });

        app.post("/solutionData", (req, res) => {
            try {
                let epochData = req.body as EpochDbData;

                if (
                    isNaN(epochData.epoch) ||
                    isNaN(epochData.solutionValue) ||
                    isNaN(epochData.shareValue)
                ) {
                    res.status(400).send("epochData is required");
                    return;
                }

                QatumDb.setEpochSolutionValue(epochData);

                res.status(200).send({
                    isOk: true,
                });
            } catch (error: any) {
                res.status(500).send(error.message);
            }
        });
        app.post("/payments/system/pushEpoch", async (req, res) => {
            try {
                let epoch = Number(req.body.epoch);
                PaymentManager.pushEpochToPay(epoch);
                res.send({ isOk: true });
            } catch (error: any) {
                res.status(500).send(
                    "Error while pushing epoch to system payments: " +
                        error.message
                );
            }
        });

        app.get("/payments/system/enable", async (req, res) => {
            try {
                let enable = req.query.enable === "true";
                if (enable) PaymentManager.enablePayment();
                else PaymentManager.disablePayment();
                res.send({
                    isOk: true,
                });
            } catch (error: any) {
                res.status(500).send(
                    "Error while switch enability system payments: " +
                        error.message
                );
            }
        });

        app.get("/payments/totalSolutions", async (req, res) => {
            try {
                let epoch = Number(req.query.epoch);
                if (isNaN(epoch)) {
                    res.status(400).send("epoch is required");
                    return;
                }
                res.send(await QatumDb.getTotalSolutions(epoch));
            } catch (error: any) {
                res.status(500).send(error.message);
            }
        });

        app.get("/payments", async (req, res) => {
            try {
                let epoch = Number(req.query.epoch);
                let needToBeUnpaid = req.query.needToBeUnpaid === "true";
                res.send(
                    await QatumDb.getPaymentsAlongWithSolutionsValue(
                        epoch,
                        needToBeUnpaid
                    )
                );
            } catch (error: any) {
                res.status(500).send(error.message);
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
                    res.status(400).send("paymentData is required");
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
                res.status(500).send(error.message);
            }
        });

        app.listen(httpPort, () => {
            LOG("http", `http server listening on port ${httpPort}`);
        });
    }
}

export default HttpServer;
