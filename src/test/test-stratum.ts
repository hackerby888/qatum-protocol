import "dotenv/config";
import net from "net";
import StratumEvents from "../qatum/qatum-events";

function generateRandomString(length: number) {
    const characters = "abcdefghijklmnopqrstuvwxyz";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += characters.charAt(
            Math.floor(Math.random() * characters.length)
        );
    }
    return result;
}

let socket = net.connect(
    Number(process.env.QATUM_PORT),
    "server.qatum.org",
    () => {
        console.log("Connected to stratum server");
    }
);
socket.write(
    JSON.stringify({
        id: StratumEvents.eventsId.SUBSCRIBE,
        wallet: "AAAJYLCWSGXJBERNBNIFQRSUZPBDKBMEVZGKMZQKYCKWLUHBCJBWAQAAZHIL",
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
let computorId = "";
let seed = "";
socket.on("data", (data) => {
    buffer += data.toString();

    const handleTest = () => {
        // socket.write(
        //     JSON.stringify({
        //         id: StratumEvents.eventsId.SUBMIT,
        //         nonce: "3a69b875ddf7645a13410a565ea52fd0d56c5913076f369c71a7508bb6ad887f",
        //         seed: "81fc8bb834fb7e50bedb54609b25258eeba39a6be69ebbbd8982121d7639b95b",
        //         computorId:
        //             "SIKTFXJDOVODFBCBGPXZKEAMSYWBMUMKQADKGWURBAWRMKPWJLQGNIBFOTIC",
        //     }) + "\n"
        // );
        for (let i = 0; i < 1; i++) {
            socket.write(
                JSON.stringify({
                    id: StratumEvents.eventsId.SUBMIT,
                    //random nonce 64 char
                    nonce: "af4f826acecad6bf536edef3f712dad2be5dc703de6fda78b99220d2ccabe7c9fa6491e44c99332704cd64c43a037c30a71547380cc9139947442890e080665a".substring(
                        64
                    ),
                    seed: "af4f826acecad6bf536edef3f712dad2be5dc703de6fda78b99220d2ccabe7c9fa6491e44c99332704cd64c43a037c30a71547380cc9139947442890e080665a".substring(
                        0,
                        64
                    ),
                    computorId: computorId,
                }) + "\n"
            );
        }

        //write 5 random string as nonce and seed

        for (let i = 0; i < 5; i++) {
            let nonce = generateRandomString(64);
            let seed = generateRandomString(64);
            console.log("Sending nonce:", nonce, "seed:", seed);
            socket.write(
                JSON.stringify({
                    id: StratumEvents.eventsId.SUBMIT,
                    nonce,
                    seed,
                    computorId: computorId,
                }) + "\n"
            );
        }
    };

    while (buffer.includes(StratumEvents.DELIMITER)) {
        let packet = buffer.slice(0, buffer.indexOf(StratumEvents.DELIMITER));
        buffer = buffer.slice(buffer.indexOf(StratumEvents.DELIMITER) + 1);
        let jsonObj = JSON.parse(packet);
        console.log(jsonObj);
        if (jsonObj.id === StratumEvents.eventsId.NEW_COMPUTOR_ID) {
            computorId = jsonObj.computorId;
            if (computorId && seed) handleTest();
        } else if (jsonObj.id === StratumEvents.eventsId.NEW_SEED) {
            seed = jsonObj.seed;
            if (computorId && seed) handleTest();
        }
    }
});
