import net from "net";

type StratumSocket = net.Socket & {
    isConnected: boolean;
    randomUUID: string;
    wallet: string;
    worker: string;
};

export { StratumSocket };
