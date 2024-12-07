import { StratumSocket } from "../types/type";

namespace SocketManager {
    let socketMap: {
        [key: string]: StratumSocket;
    } = {};

    export function addSocket(socket: StratumSocket) {
        socketMap[socket.randomUUID] = socket;
    }

    export function removeSocket(socket: StratumSocket) {
        delete socketMap[socket.randomUUID];
    }

    export function getSocket(uuid: string) {
        return socketMap[uuid];
    }

    export function getSocketMap() {
        return socketMap;
    }

    export function broadcast(data: string) {
        for (let key in socketMap) {
            if (!socketMap[key].isConnected) continue;
            socketMap[key].write(data);
        }
    }
}

export { SocketManager };
