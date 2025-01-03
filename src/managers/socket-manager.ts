import { QatumSocket } from "../types/type";

namespace SocketManager {
    let socketMap: {
        [key: string]: QatumSocket;
    } = {};

    export function addSocket(socket: QatumSocket) {
        socketMap[socket.randomUUID] = socket;
    }

    export function removeSocket(socket: QatumSocket) {
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
