import { Collection, Db, MongoClient } from "mongodb";
import LOG from "../utils/logger";
import {
    EpochDbData,
    PaymentDbData,
    PaymentDbDataWithReward,
    Solution,
    SolutionNetState,
} from "../types/type";
import Explorer from "../utils/explorer";

namespace QatumDb {
    let database: Db;

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

        let collections = (await database.listCollections().toArray()).map(
            (c) => c.name
        );
        if (!collections.includes("solutions")) {
            await database.createCollection("solutions");

            //create index for md5Hash
            await getSolutionsCollection().createIndex(
                { md5Hash: 1 },
                { unique: true }
            );
            LOG("sys", "created solutions collection");
        }
    }

    export function getDb() {
        return database;
    }

    export function setDb(db: Db) {
        database = db;
    }

    export async function getPoolConfigType<T>(type: string) {
        if (!database) return;
        return (await getPoolConfigCollection().findOne(
            {
                type,
            },
            {
                projection: {
                    _id: 0,
                    type: 0,
                },
            }
        )) as unknown as T;
    }

    export async function setPoolConfigType<T>(type: string, data: T) {
        if (!database) return;
        return await getPoolConfigCollection().updateOne(
            {
                type,
            },
            {
                //@ts-ignore
                $set: data,
            },
            {
                upsert: true,
            }
        );
    }

    export function getPoolConfigCollection() {
        return database.collection("config");
    }

    export function getSolutionsCollection() {
        return database.collection("solutions");
    }

    export async function getSolutionsInEpoch(epoch: number) {
        if (!database) return;
        return await getSolutionsCollection()
            .find({ epoch })
            .project({
                _id: 0,
                md5Hash: 1,
                isSolution: 1,
                isWritten: 1,
                isShare: 1,
                from: 1,
            })
            .toArray();
    }

    export function insertSolution(solution: SolutionNetState) {
        try {
            if (!database) return;
            return getSolutionsCollection().insertOne({
                ...solution,
                epoch: Explorer.ticksData.tickInfo.epoch,
            });
        } catch (e: any) {
            LOG("error", `QatumDb.insertSolution: ${e.message}`);
        }
    }

    export function setIsWrittenSolution(md5Hash: string) {
        if (!database) return;
        getSolutionsCollection().updateOne(
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
        type: "all" | "paid" | "unpaid" = "all",
        limit: number = 0,
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
                    ...(type === "unpaid"
                        ? {
                              isPaid: false,
                          }
                        : type === "paid"
                        ? {
                              isPaid: true,
                          }
                        : {}),
                },
                useLimit ? { limit } : {}
            )
            .skip(offset)
            .project({ _id: 0 })
            .toArray()) as unknown as PaymentDbData[];

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

    export async function markPaymentAsUnpaid(
        wallet: string,
        epoch: number,
        txId: string | null = null
    ) {
        if (!database) return;
        return await database
            .collection("payments")
            .updateMany(
                { wallet, epoch },
                { $set: { isPaid: false, txId: txId } }
            );
    }
}

export default QatumDb;
