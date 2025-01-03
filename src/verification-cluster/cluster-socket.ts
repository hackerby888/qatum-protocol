import net from "net";
import LOG from "../utils/logger";
import QatumEvents from "../qatum/qatum-events";
import { SolutionManager } from "../managers/solution-manager";
import { Solution, SolutionResult } from "../types/type";
import NodeManager from "../managers/node-manager";
import os from "os";
import { ONE_SECOND } from "../consts/time";

let threads = Number(process.env.MAX_VERIFICATION_THREADS) || os.cpus().length;

namespace VerificationClusterServer {
    export async function createServer(port: number) {
        const server = net.createServer((socket) => {
            LOG("cluster", "new cluster node connected");
            socket.setKeepAlive(true);
            socket.setEncoding("utf-8");
            let buffer: string = "";

            const handler = async (data: string) => {
                let jsonObj = JSON.parse(data) as {
                    type: "get" | "set";
                    numberOfSolutions?: number;
                    solutionsVerified?: SolutionResult[];
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
                        jsonObj?.solutionsVerified as SolutionResult[];
                    solutions?.forEach((solution) => {
                        NodeManager.handleOnVerifiedSolution(solution);
                    });
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
                LOG("cluster", "cluster node disconnected");
            });

            socket.on("error", (e) => {
                LOG("error", e.message);
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
                    SolutionManager.push(
                        solution.seed,
                        solution.nonce,
                        solution.computorId
                    );
                }
            }
        };

        socket.connect(port, host, () => {
            LOG(
                "cluster",
                "connected to cluster main server " + host + ":" + port
            );

            setInterval(() => {
                if (SolutionManager.getVerifyingLength() < threads * 2) {
                    let needToPush =
                        threads * 2 - SolutionManager.getVerifyingLength();
                    socket.write(
                        JSON.stringify({
                            type: "get",
                            numberOfSolutions: needToPush,
                        }) + QatumEvents.DELIMITER
                    );
                }
            }, 100);

            setInterval(() => {
                if (SolutionManager.getVerifiedLength() > 0) {
                    let solutions =
                        SolutionManager.getVerifiedSolutionsResult() as SolutionResult[];
                    socket.write(
                        JSON.stringify({
                            type: "set",
                            solutionsVerified: solutions,
                        }) + QatumEvents.DELIMITER
                    );
                    SolutionManager.clearVerifiedSolutions();
                }
            }, ONE_SECOND);
        });

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
            LOG("cluster", "disconnected from cluster main server");
        });

        socket.on("error", (e) => {
            LOG("error", e.message);
        });
    }
}

export default VerificationClusterServer;
