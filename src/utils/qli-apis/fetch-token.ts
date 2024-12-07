import ApiData from "./global-data";

export default async function fetchToken(
    { userName, password } = { userName: "", password: "" },
    isSetGlobal = true
) {
    let data = await fetch("https://api.qubic.li/Auth/Login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            userName: userName,
            password: password,
            twoFactorCode: "",
        }),
    }).then((data) => data.json());

    if (isSetGlobal) ApiData.setToken(data.token);

    return data.token;
}
