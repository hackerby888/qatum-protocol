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
import QatumDb from "../database/db";
import Platform from "../platform/platform";

namespace Explorer {
    export let ticksData: TickInfo;
    export let currentEpoch: number = 0;
    let initFailedTimes = 0;
    let isDiskLoaded = false;
    let isUsingRpcApi = process.env.USE_RPC_API === "true";
    export async function loadData() {
        await loadFromDisk();
        await loadFromDb();
        currentEpoch = ticksData.tickInfo.epoch;
        isDiskLoaded = true;
    }

    export async function loadFromDb() {
        let dbTicksData = await QatumDb.getPoolConfigType("ticks-data");
        if (dbTicksData) {
            ticksData = {
                ...ticksData,
                ...dbTicksData,
            };
        }
    }

    export async function loadFromDisk() {
        try {
            ticksData = JSON.parse(
                fs.readFileSync(`${DATA_PATH}/ticksData.json`).toString()
            );
        } catch (error: any) {
            if (error.message.includes("no such file or directory")) {
                LOG("sys", `ticksData.json not found, will create new one`);
            } else {
                LOG("error", "Explorer.loadFromDisk" + error.message);
                await Platform.exit(1);
            }
        }
    }

    export async function saveData() {
        if (!isDiskLoaded) return;
        await saveToDisk();
        await saveToDb();
    }

    export async function saveToDb() {
        await QatumDb.setPoolConfigType("ticks-data", ticksData);
    }

    export async function saveToDisk() {
        try {
            fs.writeFileSync(
                `${DATA_PATH}/ticksData.json`,
                JSON.stringify(ticksData)
            );
        } catch (error: any) {
            LOG("error", `Explorer.saveToDisk: ${error.message}`);
        }
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
            if (!isUsingRpcApi) return;
            await Explorer.syncTicksData();
        } catch (error: any) {
            if (initFailedTimes++ > 10) {
                return;
            }
            LOG(
                "error",
                "Explorer.init: failed to connect to qubic rpc server"
            );
            await wait(FIVE_SECONDS);
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

        let localTicksData2 = await Explorer.getGeneralTickData(
            ticksData.tickInfo.epoch
        );

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
                            from: "network",
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

    export async function getGeneralTickData(epoch: number) {
        return (await qfetch(
            `https://rpc.qubic.org/v2/epochs/${epoch}/ticks?desc=true&pageSize=1&page=1`
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
