import "dotenv/config";
import net from "net";
import StratumEvents from "../qatum/qatum-events";

let socket = net.connect(Number(process.env.QATUM_PORT), "localhost", () => {
    console.log("Connected to stratum server");
});
socket.write(
    JSON.stringify({
        id: StratumEvents.eventsId.SUBSCRIBE,
        wallet: "wwwwww",
        worker: "ww2",
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
                        nonce: "716c692b637564618f005650c1c2379fa17789938e3c5844956e68c031a2c670",
                        seed: `df981a543e71952f527d4e4df2552375e261fbec22b4b0395c6737bfec2e9a57`,
                        computorId:
                            "MSKFZNEKCTUIYBIJCMPGZFQYHHCDBVPLJHOVGFHFXCUDIVQQUQYLGZIGMXPN",
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
