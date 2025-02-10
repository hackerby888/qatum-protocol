import e from "express";
import { ONE_MINUTE } from "../consts/time";
import QatumDb from "../database/db";
import NodeManager from "./node-manager";
import { PaymentQutilData, Transaction } from "../types/type";
import LOG from "../utils/logger";
import { qfetch } from "../utils/qfetch";
import Explorer from "../utils/explorer";

namespace PaymentManager {
    let isEnablePayment = false;
    let epochsNeedTopPay: number[] = [];
    const PAYMENT_LIMIT_AT_A_TIME = 25; //max is 25

    let paidMap: { [key: string]: boolean } = {};

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

            if (epochsNeedTopPay.length === 0) {
                disablePayment();
                LOG(
                    "wallet",
                    `payment is disabled because no more epoch to pay`
                );
            }
        }
    }

    export async function checkIfTransactionIsOk(txhash: string, tick: number) {
        let transactions = await Explorer.getTransactionDataInTick(tick);
        const txStatus = transactions.find((f) => f.txId === txhash);
        if (txStatus) {
            return true;
        } else {
            return false;
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
                    let hasError = false;

                    let payment =
                        await QatumDb.getPaymentsAlongWithSolutionsValue(
                            epoch,
                            "unpaid",
                            PAYMENT_LIMIT_AT_A_TIME
                        );

                    if (payment && payment.length) {
                        let qutilData: PaymentQutilData[] = payment
                            .map((p) => {
                                if (paidMap[p.wallet + epoch]) {
                                    return null;
                                }
                                return {
                                    id: p.wallet,
                                    amount: p.reward,
                                };
                            })
                            .filter((p) => p !== null) as PaymentQutilData[];

                        if (qutilData.length > 0) {
                            LOG(
                                "wallet",
                                `paying ${
                                    qutilData.length
                                } payments in epoch ${epoch} total ${qutilData.reduce(
                                    (acc, p) => acc + p.amount,
                                    0
                                )} qubic`
                            );

                            try {
                                let {
                                    txhash,
                                    tick,
                                }: {
                                    txhash: string;
                                    tick: number;
                                } = await NodeManager.pay(qutilData);
                                //should mark as paid immediately to prevent double payment when server crash or restart
                                for (let i = 0; i < payment.length; i++) {
                                    await QatumDb.markPaymentAsPaid(
                                        payment[i].wallet,
                                        epoch,
                                        txhash
                                    );
                                }
                                let isOk = await checkIfTransactionIsOk(
                                    txhash,
                                    tick
                                );
                                if (isOk) {
                                    for (let i = 0; i < payment.length; i++) {
                                        paidMap[payment[i].wallet + epoch] =
                                            true;
                                    }
                                    LOG(
                                        "wallet",
                                        `paid ${
                                            qutilData.length
                                        } payments in epoch ${epoch} with ${txhash} total ${qutilData.reduce(
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
                                    for (let i = 0; i < payment.length; i++) {
                                        await QatumDb.markPaymentAsUnpaid(
                                            payment[i].wallet,
                                            epoch,
                                            txhash
                                        );
                                    }
                                    throw new Error(
                                        `transaction failed by network not accept for epoch ${epoch} txhash ${txhash}`
                                    );
                                }
                            } catch (e: any) {
                                hasError = true;
                                LOG(
                                    "error",
                                    `PaymentManager.watchAndPay: ${e.message}`
                                );
                            }
                        }
                    }

                    //paid all payments in this epoch
                    if (
                        (!payment ||
                            payment.length < PAYMENT_LIMIT_AT_A_TIME) &&
                        !hasError
                    ) {
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
