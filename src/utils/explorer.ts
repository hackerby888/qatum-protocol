import { md5 } from "hash-wasm";
import { ONE_SECOND } from "../consts/time";
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

namespace Explorer {
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
                } else {
                    await new Promise((resolve) => setTimeout(resolve, 5000));
                    continue;
                }
            } catch (e: any) {
                await new Promise((resolve) => setTimeout(resolve, 5000));
                continue;
            }
        }
    }

    export async function getSolutionsDataInTick(tick: number) {
        let solutionsData: Solution[] = [];
        while (true) {
            try {
                let res = await qfetch(
                    `https://rpc.qubic.org/v1/ticks/${tick}/approved-transactions`
                );
                if (res.status === 200) {
                    let transactions = (await res.json())
                        .approvedTransactions as Transaction[];

                    for (let transaction of transactions) {
                        if (
                            !ComputorIdManager.getComputorId(
                                transaction.sourceId
                            )
                        )
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
                } else {
                    await wait(ONE_SECOND);
                    continue;
                }
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
