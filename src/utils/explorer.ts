import { md5 } from "hash-wasm";
import { FIVE_SECONDS, ONE_SECOND } from "../consts/time";
import { ComputorIdManager } from "../managers/computor-id-manger";
import {
    Solution,
    SolutionData,
    TickData,
    TickInfo,
    Transaction,
} from "../types/type";
import { qfetch } from "./qfetch";
import { wait } from "./wait";
import { DATA_PATH } from "../consts/path";
import fs from "fs";
import LOG from "./logger";

namespace Explorer {
    export let ticksData: TickInfo;
    export let currentEpoch: number = 0;
    let isDiskLoaded = false;
    export function loadFromDisk() {
        try {
            ticksData = JSON.parse(
                fs.readFileSync(`${DATA_PATH}/ticksData.json`).toString()
            );
            currentEpoch = ticksData.tickInfo.epoch;
            isDiskLoaded = true;
        } catch (error: any) {
            if (error.message.includes("no such file or directory")) {
                isDiskLoaded = true;
                LOG("sys", `ticksData.json not found, creating new one`);
            } else {
                LOG("error", "Explorer.loadFromDisk" + error.message);
            }
        }
    }

    export function saveToDisk() {
        if (!isDiskLoaded) return;

        fs.writeFileSync(
            `${DATA_PATH}/ticksData.json`,
            JSON.stringify(ticksData)
        );
    }

    export function getSolutionDataFromTransaction(
        transaction: Transaction
    ): SolutionData | null {
        if (
            transaction.destId ===
                "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFXIB" &&
            transaction.inputType === 2 &&
            transaction.inputHex.length === 128
        ) {
            return {
                miningSeed: transaction.inputHex.slice(0, 64),
                nonce: transaction.inputHex.slice(64),
            };
        }

        return null;
    }

    // dont need this anymore, but keep it for future use
    // async function syncEmptyTicks() {
    //     let localEmptyTicks = await qfetch(
    //         `https://rpc.qubic.org/v2/epochs/${ticksData.tickInfo.epoch}/empty-ticks?pageSize=100000`
    //     )
    //         .then((data) => data.json())
    //         .then((data) => data.emptyTicks);

    //     if (Array.isArray(localEmptyTicks)) {
    //         emptyTicks = localEmptyTicks;
    //     } else {
    //         throw new Error("failed to fetch empty ticks");
    //     }
    // }

    export async function init() {
        try {
            await Explorer.syncTicksData();
            //should overwrite if disk data exists
            loadFromDisk();
        } catch (error: any) {
            LOG(
                "error",
                "Explorer.init: failed to connect to qubic rpc server"
            );
            return await init();
        }
    }

    export async function syncTicksData() {
        let localTicksData: TickInfo = await Explorer.getTickInfo();

        if (!isNaN(localTicksData?.tickInfo?.epoch)) {
            ticksData = localTicksData;
        } else {
            throw new Error("failed to fetch ticks data");
        }

        let localTicksData2 = await Explorer.getGeneralTickData();

        if (
            !Array.isArray(localTicksData2?.ticks) ||
            !((localTicksData2?.ticks as TickData[]).length > 0)
        ) {
            throw new Error("failed to fetch ticks data");
        }

        ticksData.tickInfo.tick = localTicksData2.ticks[0].tickNumber;
    }

    export async function getTransactionDataInTick(tick: number) {
        while (true) {
            try {
                let res = await qfetch(
                    `https://rpc.qubic.org/v1/ticks/${tick}/approved-transactions`
                );

                if (res.status === 200) {
                    let transactions = (await res.json())
                        .approvedTransactions as Transaction[];
                    return transactions;
                } else if (res.status === 400) {
                    //handle case where tick is skipped
                    let data: {
                        code: number;
                    } = await res.json();
                    if (data.code === 11) {
                        return [];
                    } else {
                        await wait(FIVE_SECONDS);
                        continue;
                    }
                } else {
                    await wait(FIVE_SECONDS);
                    continue;
                }
            } catch (e: any) {
                await wait(FIVE_SECONDS);
                continue;
            }
        }
    }

    export async function getSolutionsDataInTick(tick: number) {
        let solutionsData: Solution[] = [];
        while (true) {
            try {
                let transactions = await getTransactionDataInTick(tick);
                for (let transaction of transactions) {
                    if (!ComputorIdManager.getComputorId(transaction.sourceId))
                        continue;

                    let solutionData =
                        getSolutionDataFromTransaction(transaction);

                    if (solutionData)
                        solutionsData.push({
                            seed: solutionData.miningSeed,
                            nonce: solutionData.nonce,
                            computorId: transaction.sourceId,
                            md5Hash: await md5(
                                solutionData.miningSeed +
                                    solutionData.nonce +
                                    transaction.sourceId
                            ),
                            submittedAt: 0,
                        });
                }

                return solutionsData;
            } catch (e: any) {
                await wait(ONE_SECOND);
                continue;
            }
        }
    }

    export async function getTickInfo(): Promise<TickInfo> {
        return await qfetch(`https://rpc.qubic.org/v1/tick-info`).then((data) =>
            data.json()
        );
    }

    export async function getGeneralTickData() {
        return (await qfetch(
            `https://rpc.qubic.org/v2/epochs/147/ticks?desc=true&pageSize=1&page=1`
        ).then((data) => data.json())) as {
            ticks: TickData[];
        };
    }

    export async function getTransactionsOfAId(
        computorId: string,
        startTick: number,
        endTick: number
    ) {
        return await qfetch(
            `https://rpc.qubic.org/v2/identities/${computorId}/transfers?startTick=${startTick}&endTick=${endTick}`
        );
    }
}

export default Explorer;
