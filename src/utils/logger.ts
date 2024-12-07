import chalk from "chalk";

export default function LOG(
    type:
        | "node"
        | "error"
        | "stum"
        | "http"
        | "warning"
        | "pow"
        | "sys"
        | "wallet",
    message: string
) {
    function printPadding(colorer: any, text: string) {
        const NEEDED_PADDING = 7;
        const padding = NEEDED_PADDING - text.length;
        process.stdout.write(" ");
        process.stdout.write(colorer(text));
        for (let i = 0; i < padding - 1; i++) {
            process.stdout.write(" ");
        }
    }
    let date = new Date();
    let colorTerminal = {
        node: chalk.bold.blue,
        error: chalk.bold.red,
        stum: chalk.bold.magenta,
        http: chalk.bold.cyanBright,
        warning: chalk.bold.yellow,
        pow: chalk.bold.green,
        sys: chalk.bold.white,
        wallet: chalk.bold.hex("#8803fc"),
    };
    process.stdout.write(
        `${chalk.hex("#1A7F82")(
            `[${date.toISOString().replace("Z", "").split("T").join(" ")}] `
        )}`
    );
    printPadding(colorTerminal[type], type);
    process.stdout.write(` ${message}\n`);
}
