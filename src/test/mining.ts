import "dotenv/config";

import NodeManager from "../managers/node-manager";

async function main() {
    await NodeManager.init(
        process.env.NODE_IPS as string,
        process.env.SECRET_SEED as string
    );

    while (!NodeManager.initedVerifyThread) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log("NodeManager initialized for verification thread");

    try {
        await NodeManager.sendSolution(
            //random nonce 64 char
            "bac371cd7692f03762ac518379f187855b3e8f2d8e2a79e690ef6ee70cd12a1b",
            //random seed 64 char
            "e10f37494a5772bfa80891790aa28f693e494ddac5252be836f1651249ebb509",
            //random computorId 60 char
            "VSCQIVMRJGUTKFHWFAHFTROWCKSCEOTNSBKKASYEQERNVHSBEDZKQQREOQGL"
        );
        console.log("Solution sent successfully");
    } catch (error) {
        console.error("Error sending solution:", error);
    }
}

main();
