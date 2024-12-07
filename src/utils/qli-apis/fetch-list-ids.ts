import qliFetch from "./qli-fetch";

export default async function fetchListIds() {
    try {
        let data = await qliFetch("https://api.qubic.li/My/Get");
        return data?.myData;
    } catch (error) {}
}
