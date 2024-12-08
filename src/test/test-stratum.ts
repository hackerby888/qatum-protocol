import "dotenv/config";
import net from "net";
import StratumEvents from "../stratum/stratum-events";

let socket = net.connect(Number(process.env.STRATUM_PORT), "localhost", () => {
    console.log("Connected to stratum server");
});
socket.write(
    JSON.stringify({
        id: StratumEvents.eventsId.SUBSCRIBE,
        wallet: "wallet",
        worker: "wallet",
    }) + "\n"
);

setTimeout(() => {
    socket.write(
        JSON.stringify({
            id: StratumEvents.eventsId.REPORT_HASHRATE,
            hashrate: 1,
        }) + "\n"
    );
}, 5000);
socket.on("data", (data) => {
    console.log(data.toString());
});
