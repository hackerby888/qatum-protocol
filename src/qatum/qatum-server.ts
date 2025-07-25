import net from "net";
import LOG from "../utils/logger";
import { QatumSocket } from "../types/type";
import { randomUUID } from "crypto";
import QatumEvents from "./qatum-events";
import QatumInterface from "./qatum-interface";
import { ComputorIdManager } from "../managers/computor-id-manger";
import NodeManager from "../managers/node-manager";
import { SocketManager } from "../managers/socket-manager";
import { SolutionManager } from "../managers/solution-manager";
import WorkerManager from "../managers/worker-manager";
import { RateLimiterMemory } from "rate-limiter-flexible";

const rateLimitOptions = {
    points: 10,
    duration: 1,
};

const rateLimiter = new RateLimiterMemory(rateLimitOptions);

namespace QatumServer {
    export async function createServer(port: number): Promise<void> {
        const server = net.createServer((socket) => {
            let qatumSocket = socket as QatumSocket;
            qatumSocket.randomUUID = randomUUID();
            socket.setKeepAlive(true);
            socket.setEncoding("utf-8");
            let buffer: string = "";

            const handler = async (data: string) => {
                let jsonObj = JSON.parse(data);
                switch (jsonObj.id) {
                    case QatumEvents.eventsId.SUBSCRIBE:
                        {
                            try {
                                if (qatumSocket.isConnected) {
                                    throw new Error("already subscribed");
                                }

                                let jsonObjTyped =
                                    jsonObj as QatumInterface.Client.SubscribePacket;

                                qatumSocket.wallet = jsonObjTyped.wallet;
                                qatumSocket.worker = jsonObjTyped.worker;
                                let candicateId =
                                    ComputorIdManager.getLowestHashrateActiveComputorId();
                                if (!candicateId) {
                                    qatumSocket.write(
                                        QatumEvents.getAcceptedSubscribePacket(
                                            false,
                                            "No computor id available"
                                        )
                                    );
                                    return;
                                }
                                WorkerManager.createWorker(
                                    qatumSocket.wallet,
                                    qatumSocket.randomUUID,
                                    qatumSocket.worker
                                );
                                qatumSocket.write(
                                    QatumEvents.getAcceptedSubscribePacket(
                                        true,
                                        null
                                    )
                                );
                                qatumSocket.write(
                                    QatumEvents.getNewDifficultyPacket(
                                        NodeManager.difficulty.pool
                                    )
                                );
                                qatumSocket.write(
                                    QatumEvents.getNewComputorIdPacket(
                                        candicateId
                                    )
                                );
                                qatumSocket.write(
                                    QatumEvents.getNewSeedPacket(
                                        NodeManager.getMiningSeed()
                                    )
                                );
                                qatumSocket.computorId = candicateId;
                                qatumSocket.isConnected = true;
                                SocketManager.addSocket(qatumSocket);
                            } catch (e: any) {
                                qatumSocket.write(
                                    QatumEvents.getAcceptedSubscribePacket(
                                        false,
                                        e.message
                                    )
                                );
                            }
                        }
                        break;
                    case QatumEvents.eventsId.SUBMIT:
                        {
                            let jsonObjTyped =
                                jsonObj as QatumInterface.Client.SubmitPacket;
                            try {
                                await rateLimiter
                                    .consume(
                                        (socket.remoteAddress as string) ||
                                            "unknown",
                                        1
                                    )
                                    .then((rateLimiterRes) => {
                                        if (
                                            rateLimiterRes.remainingPoints <= 0
                                        ) {
                                            throw new Error("");
                                        }
                                    })
                                    .catch((e) => {
                                        throw new Error(
                                            `rate limit exceeded ip ${socket.remoteAddress}`
                                        );
                                    });

                                if (!qatumSocket.isConnected) {
                                    throw new Error("worker not subscribed");
                                }

                                if (
                                    jsonObjTyped.computorId.length !== 60 ||
                                    jsonObjTyped.nonce.length !== 64 ||
                                    jsonObjTyped.seed.length !== 64
                                ) {
                                    throw new Error(
                                        "invalid submit packet (wrong length)"
                                    );
                                }

                                if (
                                    jsonObjTyped.seed.toLocaleLowerCase() !==
                                        NodeManager.getMiningSeed().toLocaleLowerCase() ||
                                    parseInt(jsonObjTyped.seed, 16) === 0
                                ) {
                                    if (!process.env.QATUM_ACCEPT_ALL_SEED)
                                        throw new Error("invalid seed");
                                }

                                if (
                                    !ComputorIdManager.getComputorId(
                                        jsonObjTyped.computorId
                                    )
                                ) {
                                    throw new Error("invalid computor id");
                                }

                                let pushOk =
                                    await SolutionManager.pushToPendingToGetInQueue(
                                        jsonObjTyped.seed,
                                        jsonObjTyped.nonce,
                                        jsonObjTyped.computorId,
                                        qatumSocket.wallet,
                                        qatumSocket.randomUUID
                                    );

                                if (!pushOk) {
                                    throw new Error("duplicate solution");
                                }

                                qatumSocket.write(
                                    QatumEvents.getSubmitResultPacket(true)
                                );
                            } catch (e: any) {
                                qatumSocket.write(
                                    QatumEvents.getSubmitResultPacket(
                                        false,
                                        e.message
                                    )
                                );
                            }
                        }
                        break;
                    case QatumEvents.eventsId.REPORT_HASHRATE:
                        {
                            try {
                                if (!qatumSocket.isConnected) {
                                    throw new Error("worker not subscribed");
                                }

                                let jsonObjTyped =
                                    jsonObj as QatumInterface.Client.ReportHashratePacket;

                                ComputorIdManager.updateHashrate(
                                    jsonObjTyped.computorId ||
                                        qatumSocket.computorId,
                                    qatumSocket.randomUUID,
                                    jsonObjTyped.hashrate
                                );
                                WorkerManager.updateHashrate(
                                    qatumSocket.wallet,
                                    qatumSocket.randomUUID,
                                    jsonObjTyped.hashrate
                                );
                            } catch (e: any) {
                                LOG(
                                    "error",
                                    `QatumServer.createServer.handler.REPORT_HASHRATE: ` +
                                        e.message
                                );
                            }
                        }
                        break;
                    default:
                        socket.destroy();
                        break;
                }
            };

            socket.on("data", (data) => {
                // Prevent ddos
                if (Buffer.byteLength(data, "utf8") > 10240) {
                    return socket.destroy();
                }

                buffer += data;
                let dindex = buffer.indexOf(QatumEvents.DELIMITER);

                while (dindex > -1) {
                    try {
                        let string = buffer.substring(0, dindex);
                        handler(string);
                    } catch (e: any) {
                        LOG("error", "QatumServer.createServer: " + e.message);
                    }

                    buffer = buffer.substring(
                        dindex + QatumEvents.DELIMITER.length
                    );
                    dindex = buffer.indexOf(QatumEvents.DELIMITER);
                }
            });

            socket.on("error", (err) => {
                if (err.message === "read ECONNRESET") {
                    return;
                }

                LOG("error", "QatumServer.createServer: " + err.message);
            });

            socket.on("close", () => {
                WorkerManager.setInactive(
                    qatumSocket.wallet,
                    qatumSocket.randomUUID
                );
                SocketManager.removeSocket(qatumSocket);
                ComputorIdManager.removeWorker("", qatumSocket.randomUUID);
            });
        });
        server.listen(port, () => {
            LOG("stum", `qatum server is listening on port ${port}`);
        });
    }
}

export default QatumServer;
