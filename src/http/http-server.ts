import express from "express";
import cors from "cors";
import LOG from "../utils/logger";
import { ComputorIdManager } from "../managers/computor-id-manger";

namespace HttpServer {
    export async function createServer(httpPort: number) {
        const app = express();
        app.use(cors());
        app.use(express.json({ limit: "50mb" }));
        app.use(express.urlencoded({ limit: "50mb", extended: true }));

        app.get("/", (req, res) => {
            res.send("Hello World!");
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
                    diffToBalance: number;
                } = req.body as any;
                ComputorIdManager.setMiningConfig(miningConfig);
                res.status(200).send();
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
                await ComputorIdManager.setAliasForAllComputorId();
                res.status(200).send("");
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
                res.status(200).send("");
            } catch (e: any) {
                res.status(500).send(e.message);
            }
        });

        app.listen(httpPort, () => {
            LOG("http", `http server listening on port ${httpPort}`);
        });
    }
}

export default HttpServer;
