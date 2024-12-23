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

let buffer = "";
socket.on("data", (data) => {
    buffer += data.toString();

    while (buffer.includes(StratumEvents.DELIMITER)) {
        let packet = buffer.slice(0, buffer.indexOf(StratumEvents.DELIMITER));
        buffer = buffer.slice(buffer.indexOf(StratumEvents.DELIMITER) + 1);
        let jsonObj = JSON.parse(packet);
        console.log(jsonObj);
        if (jsonObj.id === StratumEvents.eventsId.NEW_COMPUTOR_ID) {
            socket.write(
                JSON.stringify({
                    id: StratumEvents.eventsId.SUBMIT_RESULT,
                    nonce: "fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffa",
                    seed: "fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc",
                    computorId: jsonObj.computorId,
                }) + "\n"
            );
        }
    }
});
