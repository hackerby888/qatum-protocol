import fetchToken from "./fetch-token";
import ApiData from "./global-data";

export default async function qliFetch(
    url: string,
    method: string = "GET",
    body?: any | undefined,
    fixedToken?: string | undefined
) {
    if (!ApiData.getToken() && !fixedToken) {
        try {
            await fetchToken({
                userName: process.env.QLI_USERNAME as string,
                password: process.env.QLI_PASSWORD as string,
            });
        } catch (error) {}
    }

    let tries = 0;
    while (tries++ < 3) {
        let res = await fetch(url, {
            method,
            body: JSON.stringify(body),
            headers: {
                Authorization: `Bearer ${fixedToken || ApiData.getToken()}`,
                "Content-Type": "application/json",
            },
        });

        if (res.status === 401) {
            if (!fixedToken) await fetchToken();
            continue;
        } else {
            return res.json();
        }
    }
}
