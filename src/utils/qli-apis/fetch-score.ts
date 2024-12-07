import qliFetch from "./qli-fetch";

export default async function fetchScore() {
    try {
        let data = await qliFetch("https://api.qubic.li/My/Mining");
        return data?.seeds;
    } catch (error) {}
}
