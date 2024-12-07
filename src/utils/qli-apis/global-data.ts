namespace ApiData {
    let token: string = "";
    export let avgScore: number = 0;

    export function setToken(itoken: string) {
        token = itoken;
    }

    export function getToken() {
        return token;
    }
}
export default ApiData;
