import net from "net";
import LOG from "../utils/logger";
import { StratumSocket } from "../types/type";
import { randomUUID } from "crypto";
import StratumEvents from "./stratum-events";
import StratumInterface from "./stratum-interface";
import { ComputorIdManager } from "../managers/computor-id-manger";
import NodeManager from "../managers/node-manager";
import { SocketManager } from "../managers/socket-manager";
import { SolutionManager } from "../managers/solution-manager";

namespace StratumServer {
    export async function createServer(port: number): Promise<void> {
        const server = net.createServer((socket) => {
            let stratumSocket = socket as StratumSocket;
            stratumSocket.randomUUID = randomUUID();
            socket.setKeepAlive(true);
            socket.setEncoding("utf-8");
            let buffer: string = "";

            const handler = async (data: string) => {
                let jsonObj = JSON.parse(data);
                switch (jsonObj.id) {
                    case StratumEvents.eventsId.SUBSCRIBE:
                        {
                            let jsonObjTyped =
                                jsonObj as StratumInterface.Client.SubscribePacket;

                            stratumSocket.wallet = jsonObjTyped.wallet;
                            stratumSocket.worker = jsonObjTyped.worker;
                            let candicateId =
                                ComputorIdManager.getLowestHashrateActiveComputorId();
                            if (!candicateId) {
                                stratumSocket.write(
                                    StratumEvents.getAcceptedSubscribePacket(
                                        false,
                                        "No computor id available"
                                    )
                                );
                                socket.destroy();
                                return;
                            }
                            stratumSocket.write(
                                StratumEvents.getAcceptedSubscribePacket(
                                    true,
                                    null
                                )
                            );
                            stratumSocket.write(
                                StratumEvents.getNewComputorIdPacket(
                                    candicateId
                                )
                            );
                            stratumSocket.write(
                                StratumEvents.getNewSeedPacket(
                                    NodeManager.getMiningSeed()
                                )
                            );
                            stratumSocket.computorId = candicateId;
                            stratumSocket.isConnected = true;
                            SocketManager.addSocket(stratumSocket);
                        }
                        break;
                    case StratumEvents.eventsId.SUBMIT_RESULT:
                        {
                            let jsonObjTyped =
                                jsonObj as StratumInterface.Client.SubmitPacket;
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
                                stratumSocket.write(
                                    StratumEvents.getSubmitResultPacket(true)
                                );
                            } catch (e: any) {
                                stratumSocket.write(
                                    StratumEvents.getSubmitResultPacket(
                                        false,
                                        e.message
                                    )
                                );
                            }
                        }
                        break;
                    case StratumEvents.eventsId.REPORT_HASHRATE:
                        {
                            let jsonObjTyped =
                                jsonObj as StratumInterface.Client.ReportHashratePacket;

                            ComputorIdManager.updateHashrate(
                                jsonObjTyped.computorId ||
                                    stratumSocket.computorId,
                                stratumSocket.randomUUID,
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
                let dindex = buffer.indexOf(StratumEvents.DELIMITER);

                while (dindex > -1) {
                    try {
                        let string = buffer.substring(0, dindex);
                        handler(string);
                    } catch (e: any) {
                        LOG("error", e.message);
                    }

                    buffer = buffer.substring(
                        dindex + StratumEvents.DELIMITER.length
                    );
                    dindex = buffer.indexOf(StratumEvents.DELIMITER);
                }
            });

            socket.on("end", () => {
                SocketManager.removeSocket(stratumSocket);
                ComputorIdManager.removeWorker("", stratumSocket.randomUUID);
            });
        });
        server.listen(port, () => {
            LOG("stum", `stratum server is listening on port ${port}`);
        });
    }
}

export default StratumServer;
