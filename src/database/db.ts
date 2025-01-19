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
        return database
            .collection("epoch")
            .updateOne(
                { epoch: epochData.epoch },
                { $set: { value: epochData.value } },
                { upsert: true }
            );
    }

    export function getEpochSolutionValue(epoch: number) {
        if (!database) return;
        return database.collection("epoch").findOne({ epoch });
    }

    export async function getPaymentsAlongWithSolutionsValue(epoch: number) {
        if (!database) return;
        let payments: PaymentDbData[] = (await database
            .collection("payments")
            .find({ epoch })
            .toArray()) as unknown as PaymentDbData[];
        let solutions: EpochDbData = (await database
            .collection("solutions")
            .findOne({ epoch })) as unknown as EpochDbData;

        payments?.forEach((payment) => {
            (payment as PaymentDbDataWithReward).reward =
                payment.solutionsWritten * solutions.value;
        });

        return payments as PaymentDbDataWithReward[];
    }
}

export default QatumDb;
