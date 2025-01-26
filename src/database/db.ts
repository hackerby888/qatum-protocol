import { Collection, Db, MongoClient } from "mongodb";
import LOG from "../utils/logger";
import {
    EpochDbData,
    PaymentDbData,
    PaymentDbDataWithReward,
    Solution,
    SolutionNetState,
} from "../types/type";
import { ComputorIdManager } from "../managers/computor-id-manger";

namespace QatumDb {
    let database: Db;
    let solutionsCollection: Collection;
    export async function connectDB() {
        LOG(
            "sys",
            `connecting to database ${
                process.env.MONGO_DB || "mongodb://localhost:27017"
            }`
        );
        let dbClient = new MongoClient(
            process.env.MONGO_DB || "mongodb://localhost:27017"
        );
        await dbClient.connect();
        QatumDb.setDb(dbClient.db("qatum") as Db);

        getSolutionsCollection();
    }

    export function getDb() {
        return database;
    }

    export function setDb(db: Db) {
        database = db;
    }

    export function getSolutionsCollection() {
        if (!database) return;
        if (!solutionsCollection) {
            solutionsCollection = database.collection("solutions");
        }
        return solutionsCollection;
    }

    export function insertSolution(solution: SolutionNetState) {
        if (!database) return;
        return solutionsCollection.insertOne({
            ...solution,
            insertedAt: Date.now(),
            epoch: ComputorIdManager.ticksData.tickInfo.epoch,
        });
    }

    export function setIsWrittenSolution(md5Hash: string) {
        if (!database) return;
        solutionsCollection.updateOne(
            { md5Hash },
            { $set: { isWritten: true } }
        );
    }

    export function insertRewardPayments(rewardPayments: PaymentDbData[]) {
        if (!database) return;
        return database.collection("payments").insertMany(rewardPayments);
    }

    export function setEpochSolutionValue(epochData: EpochDbData) {
        if (!database) return;
        return database.collection("epoch").updateOne(
            { epoch: epochData.epoch },
            {
                $set: {
                    solutionValue: epochData.solutionValue,
                    shareValue: epochData.shareValue,
                },
            },
            { upsert: true }
        );
    }

    export function getEpochSolutionValue(epoch: number) {
        if (!database) return;
        return database.collection("epoch").findOne({ epoch });
    }

    export async function getTotalSolutions(epoch: number) {
        if (!database) return;
        let allPayments = await database
            .collection("payments")
            .find({ epoch })
            .toArray();

        let totalSolutionsShare = allPayments.reduce(
            (acc, payment) => acc + payment.solutionsShare,
            0
        );

        let totalSolutionsWritten = allPayments.reduce(
            (acc, payment) => acc + payment.solutionsWritten,
            0
        );

        let totalSolutionVerified = allPayments.reduce(
            (acc, payment) => acc + payment.solutionsVerified,
            0
        );

        return {
            totalSolutionsShare,
            totalSolutionsWritten,
            totalSolutionVerified,
        };
    }

    export async function getPaymentsAlongWithSolutionsValue(
        epoch: number,
        needToBeUnpaid: boolean = true,
        limit: number = 1,
        offset: number = 0,
        wallet?: string
    ) {
        if (!database) return;
        let useLimit = limit > 0;
        let payments: PaymentDbData[] = (await database
            .collection("payments")
            .find(
                {
                    ...(wallet
                        ? {
                              wallet,
                          }
                        : {
                              epoch,
                          }),
                    ...(needToBeUnpaid
                        ? {
                              isPaid: false,
                          }
                        : {}),
                },
                useLimit ? { limit } : {}
            )
            .skip(offset)
            .project({ _id: 0 })
            .toArray()) as unknown as PaymentDbData[];

        console.log({
            ...(wallet
                ? {
                      wallet,
                  }
                : {
                      epoch,
                  }),
            ...(needToBeUnpaid
                ? {
                      isPaid: false,
                  }
                : {}),
        });
        console.log(payments);
        let solutions: EpochDbData[] = [];

        if (!wallet) {
            let epochData = (await database
                .collection("epoch")
                .findOne({ epoch })) as unknown as EpochDbData;
            if (epochData) {
                solutions.push(epochData);
            }
        } else {
            for (let i = 0; i < payments.length; i++) {
                let epochData = (await database.collection("epoch").findOne({
                    epoch: payments[i].epoch,
                })) as unknown as EpochDbData;
                if (epochData) {
                    solutions.push(epochData);
                }
            }
        }

        if (!payments || !payments.length || !solutions) return [];

        payments?.forEach((payment) => {
            let isShareModeEpoch = payment.solutionsShare > 0;
            let solutionValue = solutions.find(
                (solution) => solution.epoch === payment.epoch
            )?.solutionValue as number;
            let shareValue = solutions.find(
                (solution) => solution.epoch === payment.epoch
            )?.shareValue as number;
            (payment as PaymentDbDataWithReward).reward = !isShareModeEpoch
                ? Math.floor(payment.solutionsWritten * solutionValue || 0)
                : Math.floor(payment.solutionsShare * shareValue || 0);
        });

        return payments as PaymentDbDataWithReward[];
    }

    export async function markPaymentAsPaid(
        wallet: string,
        epoch: number,
        txId: string
    ) {
        if (!database) return;
        return await database
            .collection("payments")
            .updateMany({ wallet, epoch }, { $set: { isPaid: true, txId } });
    }
}

export default QatumDb;
