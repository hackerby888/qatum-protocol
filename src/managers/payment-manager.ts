import e from "express";
import { ONE_MINUTE } from "../consts/time";
import QatumDb from "../database/db";
import NodeManager from "./node-manager";
import { PaymentQutilData } from "../types/type";
import LOG from "../utils/logger";
import { qfetch } from "../utils/qfetch";

namespace PaymentManager {
    let isEnablePayment = false;
    let epochsNeedTopPay: number[] = [];
    const PAYMENT_LIMIT_AT_A_TIME = 25;

    export function init() {
        enablePayment();
        watchAndPay();
    }

    export function getEpochsNeedToPay() {
        return epochsNeedTopPay;
    }

    export function enablePayment() {
        isEnablePayment = true;
    }

    export function disablePayment() {
        isEnablePayment = false;
    }

    export function isPaymentEnabled() {
        return isEnablePayment;
    }

    export function pushEpochToPay(epoch: number) {
        if (!epochsNeedTopPay.includes(epoch)) {
            epochsNeedTopPay.push(epoch);
        }
    }

    export function removeEpochToPay(epoch: number) {
        if (epochsNeedTopPay.includes(epoch)) {
            epochsNeedTopPay = epochsNeedTopPay.filter((e) => e !== epoch);

            LOG(
                "wallet",
                `removed epoch ${epoch} from payment list, remaining ${epochsNeedTopPay.length} epochs`
            );
        }
    }

    export async function checkIfTransactionIsOk(txhash: string, tick: number) {
        while (true) {
            try {
                let res = await qfetch(
                    `https://rpc.qubic.org/v1/ticks/${tick}/approved-transactions`
                );

                if (res.status === 200) {
                    let transactions = await res.json();
                    const txStatus = transactions.transactionsStatus.find(
                        (f: { txId: string }) => f.txId === txhash
                    );
                    if (txStatus) {
                        return true;
                    } else {
                        return false;
                    }
                } else if (res.status === 404) {
                    const errorStatus = await res.json();
                    if (errorStatus.code === 123) {
                        await new Promise((resolve) =>
                            setTimeout(resolve, 5000)
                        );
                        continue;
                    } else {
                        return false;
                    }
                } else {
                    return false;
                }
            } catch (e: any) {
                await new Promise((resolve) => setTimeout(resolve, 5000));
                continue;
            }
        }
    }

    export function watchAndPay() {
        let isProcessing = false;
        setInterval(async () => {
            try {
                if (
                    isEnablePayment &&
                    !isProcessing &&
                    epochsNeedTopPay.length
                ) {
                    isProcessing = true;
                    let epoch = epochsNeedTopPay[0];

                    let payment =
                        await QatumDb.getPaymentsAlongWithSolutionsValue(
                            epoch,
                            "unpaid",
                            PAYMENT_LIMIT_AT_A_TIME
                        );

                    if (payment && payment.length) {
                        let qutilData: PaymentQutilData[] = payment.map(
                            (p) => ({
                                id: p.wallet,
                                amount: p.reward,
                            })
                        );
                        await NodeManager.pay(qutilData)
                            .then(
                                async ({
                                    txhash,
                                    tick,
                                }: {
                                    txhash: string;
                                    tick: number;
                                }) => {
                                    let isOk = await checkIfTransactionIsOk(
                                        txhash,
                                        tick
                                    );
                                    if (isOk) {
                                        payment.forEach(async (p) => {
                                            await QatumDb.markPaymentAsPaid(
                                                p.wallet,
                                                epoch,
                                                txhash
                                            );
                                        });
                                        LOG(
                                            "wallet",
                                            `paid ${
                                                qutilData.length
                                            } payments in epoch ${epoch} with txhash ${txhash} total ${qutilData.reduce(
                                                (acc, p) => acc + p.amount,
                                                0
                                            )} qubic`
                                        );
                                        payment.forEach((p) => {
                                            LOG(
                                                "wallet",
                                                `paid ${p.wallet} with ${p.reward} qutil in epoch ${epoch}`
                                            );
                                        });
                                    } else {
                                        LOG(
                                            "error",
                                            `PaymentManager.watchAndPay: transaction failed for epoch ${epoch} txhash ${txhash}`
                                        );
                                    }
                                }
                            )
                            .catch((e: any) => {
                                LOG(
                                    "error",
                                    `PaymentManager.watchAndPay: ${e.message}`
                                );
                            });
                    }

                    //paid all payments in this epoch
                    if (!payment || payment.length < PAYMENT_LIMIT_AT_A_TIME) {
                        removeEpochToPay(epoch);
                    }

                    isProcessing = false;
                }
            } catch (e: any) {
                isProcessing = false;
                LOG("error", `PaymentManager.watchAndPay: ${e.message}`);
            }
        }, ONE_MINUTE);
    }
}

export default PaymentManager;
