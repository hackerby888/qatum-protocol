namespace ApiData {
    let token: string = "";
    export let avgScore: number = 0;
    export let estimatedIts: number = 0;
    export let solutionsPerHour: number = 0;
    export let solutionsPerHourEpoch: number = 0;

    export function setToken(itoken: string) {
        token = itoken;
    }

    export function getToken() {
        return token;
    }
}
export default ApiData;
