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
                                socket.destroy();
                                return;
                            }
                            qatumSocket.write(
                                QatumEvents.getAcceptedSubscribePacket(
                                    true,
                                    null
                                )
                            );
                            qatumSocket.write(
                                QatumEvents.getNewComputorIdPacket(candicateId)
                            );
                            qatumSocket.write(
                                QatumEvents.getNewSeedPacket(
                                    NodeManager.getMiningSeed()
                                )
                            );
                            qatumSocket.computorId = candicateId;
                            qatumSocket.isConnected = true;
                            SocketManager.addSocket(qatumSocket);
                        }
                        break;
                    case QatumEvents.eventsId.SUBMIT_RESULT:
                        {
                            let jsonObjTyped =
                                jsonObj as QatumInterface.Client.SubmitPacket;
                            try {
                                if (
                                    jsonObjTyped.computorId.length !== 60 ||
                                    jsonObjTyped.nonce.length !== 64 ||
                                    jsonObjTyped.seed.length !== 64
                                ) {
                                    throw new Error(
                                        "invalid submit packet (wrong length)"
                                    );
                                }
                                let result = await SolutionManager.push(
                                    jsonObjTyped.seed,
                                    jsonObjTyped.nonce,
                                    jsonObjTyped.computorId
                                );

                                if (!result) {
                                    throw new Error("duplicate solution");
                                }

                                ComputorIdManager.writeSolution(
                                    jsonObjTyped.computorId,
                                    jsonObjTyped.nonce,
                                    jsonObjTyped.seed
                                );
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
                            let jsonObjTyped =
                                jsonObj as QatumInterface.Client.ReportHashratePacket;

                            ComputorIdManager.updateHashrate(
                                jsonObjTyped.computorId ||
                                    qatumSocket.computorId,
                                qatumSocket.randomUUID,
                                jsonObjTyped.hashrate
                            );
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
                        LOG("error", e.message);
                    }

                    buffer = buffer.substring(
                        dindex + QatumEvents.DELIMITER.length
                    );
                    dindex = buffer.indexOf(QatumEvents.DELIMITER);
                }
            });

            socket.on("end", () => {
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
