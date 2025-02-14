import { DATA_PATH } from "../consts/path";
import { ClusterData, ClusterSocket } from "../types/type";
import fs from "fs";
import LOG from "../utils/logger";
import Platform from "../platform/platform";
export namespace ClusterSocketManager {
    let socketMap: {
        [key: string]: ClusterData;
    } = {};

    let isDiskLoaded = false;

    export function addSocket(socket: ClusterSocket) {
        socketMap[socket.randomUUID] = {
            randomUUID: socket.randomUUID,
            ip: socket.ip,
            isConnected: socket.isConnected,
            cpu: socket.cpu,
            threads: socket.threads,
            solutionsVerified: socket.solutionsVerified,
            useThreads: socket.useThreads,
        };
    }

    export function removeSocket(socket: ClusterSocket) {
        delete socketMap[socket.randomUUID];
    }

    export function getSocket(uuid: string) {
        return socketMap[uuid];
    }

    export function getSocketMap() {
        return socketMap;
    }

    export function markAsDisconnected(uuid: string) {
        if (!socketMap[uuid]) return;
        socketMap[uuid].isConnected = false;
    }

    export function clearInactiveSockets() {
        for (let key in socketMap) {
            if (!socketMap[key].isConnected) {
                delete socketMap[key];
            }
        }
    }

    export function increaseSolutionsVerified(uuid: string, num: number = 1) {
        if (!socketMap[uuid]) return;
        socketMap[uuid].solutionsVerified += num;
    }

    export function resetSolutionsVerifiedForAll() {
        for (let key in socketMap) {
            socketMap[key].solutionsVerified = 0;
        }
    }

    export function toJson() {
        let socketMapJson: { [key: string]: ClusterData } = {};
        for (let key in socketMap) {
            socketMapJson[key] = {
                randomUUID: socketMap[key].randomUUID,
                ip: socketMap[key].ip,
                isConnected: socketMap[key].isConnected,
                cpu: socketMap[key].cpu,
                threads: socketMap[key].threads,
                solutionsVerified: socketMap[key].solutionsVerified,
                useThreads: socketMap[key].useThreads,
            };
        }

        let socketsArray = Object.values(socketMapJson) as ClusterData[];

        return socketsArray;
    }

    export function markAllDisconnected() {
        for (let key in socketMap) {
            socketMap[key].isConnected = false;
        }
    }

    export async function saveData() {
        if (!isDiskLoaded) return;
        await saveToDisk();
    }

    export async function saveToDisk() {
        try {
            fs.writeFileSync(
                `${DATA_PATH}/cluster-sockets.json`,
                JSON.stringify(socketMap)
            );
        } catch (error: any) {
            LOG("error", `ClusterSocketManager.saveToDisk: ${error.message}`);
        }
    }

    export async function loadData() {
        await loadFromDisk();
        isDiskLoaded = true;
    }

    export async function loadFromDisk() {
        try {
            let socketMapJson = JSON.parse(
                fs.readFileSync(`${DATA_PATH}/cluster-sockets.json`, "utf-8")
            );
            socketMap = socketMapJson;
            markAllDisconnected();
        } catch (error: any) {
            if (error.message.includes("no such file or directory")) {
                LOG(
                    "sys",
                    `cluster-sockets.json not found, will create new one`
                );
            } else {
                LOG(
                    "error",
                    "ClusterSocketManager.loadFromDisk: " + error.message
                );
                await Platform.exit(1);
            }
        }
    }
}
