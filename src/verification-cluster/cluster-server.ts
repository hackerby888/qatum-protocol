import net from "net";
import LOG from "../utils/logger";
import QatumEvents from "../qatum/qatum-events";
import { SolutionManager } from "../managers/solution-manager";
import { ClusterSocket, Solution, SolutionNetState } from "../types/type";
import NodeManager from "../managers/node-manager";
import os from "os";
import { FIVE_SECONDS, ONE_SECOND } from "../consts/time";
import { randomUUID } from "crypto";
import { ClusterSocketManager } from "./cluster-socket-manager";
import { wait } from "../utils/wait";
let threads = Number(process.env.MAX_VERIFICATION_THREADS) || os.cpus().length;
namespace VerificationClusterServer {
    export async function createServer(port: number) {
        if (isNaN(port)) {
            return LOG(
                "warning",
                "cluster server port is not set, your cluster node will not be able to connect to the main server"
            );
        }
        const server = net.createServer((socket) => {
            LOG(
                "cluster",
                `new cluster node connected ${socket.remoteAddress}`
            );
            let clusterSocket = socket as ClusterSocket;
            clusterSocket.randomUUID = randomUUID();
            socket.setKeepAlive(true);
            socket.setEncoding("utf-8");
            let buffer: string = "";

            const handler = async (data: string) => {
                let jsonObj = JSON.parse(data) as {
                    type: "get" | "set" | "register";
                    numberOfSolutions?: number;
                    solutionsVerified?: SolutionNetState[];
                    cpu?: string;
                    threads?: number;
                    useThreads?: number;
                };

                if (jsonObj.type === "get") {
                    let solutions = SolutionManager.addNSolutionToVerifying(
                        jsonObj.numberOfSolutions as number,
                        true
                    );

                    socket.write(
                        JSON.stringify({
                            type: "get",
                            solutions,
                        }) + QatumEvents.DELIMITER
                    );
                } else if (jsonObj.type === "set") {
                    let solutions =
                        jsonObj?.solutionsVerified as SolutionNetState[];
                    solutions?.forEach((solution) => {
                        NodeManager.handleOnVerifiedSolution(solution, true);
                    });

                    if (isNaN(clusterSocket.solutionsVerified))
                        clusterSocket.solutionsVerified = 0;

                    ClusterSocketManager.increaseSolutionsVerified(
                        clusterSocket.randomUUID,
                        solutions.length
                    );
                } else if (jsonObj.type === "register") {
                    clusterSocket.ip = socket.remoteAddress as string;
                    clusterSocket.randomUUID = randomUUID();
                    clusterSocket.solutionsVerified = 0;
                    clusterSocket.cpu = jsonObj.cpu as string;
                    clusterSocket.threads = jsonObj.threads as number;
                    clusterSocket.useThreads = jsonObj.useThreads as number;
                    clusterSocket.isConnected = true;
                    ClusterSocketManager.addSocket(clusterSocket);
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
                        LOG(
                            "error",
                            "VerificationClusterServer.createServer: " +
                                e.message
                        );
                    }

                    buffer = buffer.substring(
                        dindex + QatumEvents.DELIMITER.length
                    );
                    dindex = buffer.indexOf(QatumEvents.DELIMITER);
                }
            });

            socket.on("close", () => {
                LOG("cluster", "cluster node disconnected");
                ClusterSocketManager.markAsDisconnected(
                    clusterSocket.randomUUID
                );
            });

            socket.on("error", (e) => {
                LOG(
                    "error",
                    "VerificationClusterServer.createServer: " + e.message
                );
            });
        });
        server.listen(port, () => {
            LOG("cluster", `cluster server is listening on port ${port}`);
        });
    }

    export function connectToServer(server: string) {
        let host = server.split(":")[0];
        let port = parseInt(server.split(":")[1]);
        let socket = new net.Socket();
        let buffer: string = "";
        let getSolutionIntervalId: NodeJS.Timeout | null;
        let submitSolutionId: NodeJS.Timeout | null;
        let cpu: string = os.cpus()[0].model;
        let maxThreads: number = os.cpus().length;

        const handler = async (data: string) => {
            let jsonObj = JSON.parse(data) as {
                type: "get";
                solutions: Solution[];
            };

            if (jsonObj.type === "get") {
                for (let solution of jsonObj.solutions) {
                    LOG(
                        "cluster",
                        `pushing ${solution.md5Hash} solution to cluster`
                    );
                    SolutionManager.push(solution);
                }
            }
        };

        const onConnect = async () => {
            LOG(
                "cluster",
                "connected to cluster main server " + host + ":" + port
            );

            socket.write(
                JSON.stringify({
                    type: "register",
                    cpu,
                    threads: maxThreads,
                    useThreads: threads,
                }) + QatumEvents.DELIMITER
            );

            await wait(ONE_SECOND * 5);

            getSolutionIntervalId = setInterval(() => {
                if (SolutionManager.getVerifyingLength() < threads * 2) {
                    let needToPush =
                        threads * 2 - SolutionManager.getVerifyingLength();

                    if (!needToPush) return;

                    socket.write(
                        JSON.stringify({
                            type: "get",
                            numberOfSolutions: needToPush,
                        }) + QatumEvents.DELIMITER
                    );
                }
            }, 100);

            submitSolutionId = setInterval(() => {
                if (SolutionManager.getVerifiedLength() > 0) {
                    let solutions =
                        SolutionManager.getVerifiedSolutionsResult() as SolutionNetState[];

                    if (!solutions.length) return;

                    socket.write(
                        JSON.stringify({
                            type: "set",
                            solutionsVerified: solutions,
                        }) + QatumEvents.DELIMITER
                    );
                    SolutionManager.clearVerifiedSolutions();
                }
            }, ONE_SECOND);
        };

        socket.connect(port, host, onConnect);

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
                    LOG(
                        "error",
                        "VerificationClusterServer.connectToServer: " +
                            e.message
                    );
                }

                buffer = buffer.substring(
                    dindex + QatumEvents.DELIMITER.length
                );
                dindex = buffer.indexOf(QatumEvents.DELIMITER);
            }
        });

        socket.on("close", () => {
            LOG("cluster", "disconnected from cluster main server");
            if (getSolutionIntervalId) clearInterval(getSolutionIntervalId);
            if (submitSolutionId) clearInterval(submitSolutionId);
            getSolutionIntervalId = null;
            submitSolutionId = null;
            socket.destroy();
            setTimeout(() => {
                LOG("cluster", "reconnecting to cluster main server");
                connectToServer(server);
            }, FIVE_SECONDS);
        });

        socket.on("error", (e) => {
            LOG("warning", e.message);
        });
    }
}

export default VerificationClusterServer;
