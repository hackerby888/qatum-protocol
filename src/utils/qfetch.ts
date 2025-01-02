import fetchRetry from "fetch-retry";

export const qfetch = fetchRetry(fetch, {
    retries: 2,
    retryDelay: 500,
});
