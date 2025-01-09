import "dotenv/config";
import net from "net";
import StratumEvents from "../qatum/qatum-events";

let socket = net.connect(Number(process.env.QATUM_PORT), "localhost", () => {
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
            for (let i = 0; i < 50; i++) {
                socket.write(
                    JSON.stringify({
                        id: StratumEvents.eventsId.SUBMIT,
                        nonce: "716c692b637564618d014b16b9c332e4e6abb443a451a659e289eccfca618d96",
                        seed: `b7e44710c68b3dc391d666529ce87176273c89482b9d372f2e86f1b87268ce71`,
                        computorId:
                            "PRKMZXJAOZERDCGLQUVESFWAHAABWIVWCPSLYBHWWFGADFZEONJATUBAMRQC",
                    }) + "\n"
                );
                socket.write(
                    JSON.stringify({
                        id: StratumEvents.eventsId.SUBMIT,
                        nonce: "716c692b637564618d005626ab3ac572435c1718e5ad1244bb5d599135c4d78f",
                        seed: `9e71612623790b3f7f817d783bb01d1f2dc638fe665d909786e7146098207${i
                            .toString()
                            .padStart(3, "0")}`,
                        computorId: jsonObj.computorId,
                    }) + "\n"
                );
            }
        }
    }
});
