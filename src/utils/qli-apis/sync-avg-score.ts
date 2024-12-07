import ApiData from "./global-data";
import qliFetch from "./qli-fetch";

export default async function syncAvgScore() {
    try {
        let data = await qliFetch("https://api.qubic.li/Score/Get");
        if (!isNaN(data?.averageScore)) {
            ApiData.avgScore = data?.averageScore;
            return data?.averageScore;
        }

        return undefined;
    } catch (error) {}
}
