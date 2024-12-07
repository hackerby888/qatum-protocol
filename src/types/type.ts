import net from "net";

type StratumSocket = net.Socket & {
    isConnected: boolean;
    randomUUID: string;
    computorId: string;
    wallet: string;
    worker: string;
};

export { StratumSocket };
