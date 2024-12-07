import net from "net";
import LOG from "../utils/logger";
import { StratumSocket } from "../types/type";
import { randomUUID } from "crypto";
import StratumEvents from "./stratum-events";
import StratumInterface from "./stratum-interface";
import { ComputorIdManager } from "../managers/computor-id-manger";
import NodeManager from "../managers/node-manager";
import { SocketManager } from "../managers/socket-manager";

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
                            StratumEvents.getAcceptedSubscribePacket(true, null)
                        );
                        stratumSocket.write(candicateId);
                        stratumSocket.write(
                            StratumEvents.getNewSeedPacket("0")
                        );
                        stratumSocket.isConnected = true;
                        SocketManager.addSocket(stratumSocket);
                        break;
                    case StratumEvents.eventsId.SUBMIT_RESULT:
                        let jsonObjTyped2 =
                            jsonObj as StratumInterface.Client.SubmitPacket;
                        try {
                            let result = await NodeManager.sendSolution(
                                jsonObjTyped2.nonce,
                                jsonObjTyped2.seed,
                                jsonObjTyped2.computorId
                            );
                            stratumSocket.write(
                                StratumEvents.getSubmitResultPacket(result)
                            );
                        } catch (e) {
                            stratumSocket.write(
                                StratumEvents.getSubmitResultPacket(false)
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

            socket.on("end", () => {});
        });
        server.listen(port, () => {
            LOG("stum", `Stratum server is listening on port ${port}`);
        });
    }
}

export default StratumServer;
