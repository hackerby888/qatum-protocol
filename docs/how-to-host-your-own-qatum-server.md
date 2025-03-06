# Backend

> For linux you should run these commands first:
> `sudo apt-get update` > `sudo apt-get install build-essential`

##### Requirement

-   Nodejs
-   Linux : GCC or Clang | Windows: MSVC Compiler
-   Python >= 3.12
-   AVX2 or AVX512

##### Run

-   npm install
-   npm run configure
-   npm run build
-   npm start

##### Environment Variable

Create `.env` file on project's root folder and edit following variables

Example for `main` mode

```
# database (optional)
MONGODB = "mongodb://localhost:27017/" # payment system won't work if database is not used
# true or false | if you dont use rpc, all solutions will be considered as not written
USE_RPC_API = "true"

# admin credentials (go to /login)
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin"

MODE = "main" # main | verify
# main: your server will be a pool that miners can connect and mining
# verify: your server will help the main server speed up verification process, miners can't connect to this server and mining

MAX_VERIFICATION_THREADS = 1 # remove this line to use max threads
HTTP_PORT = 3000
QATUM_PORT = 3001
CLUSTER_PORT = 3002
NODE_IPS = "0.0.0.0,127.0.0.1" # qubic nodes ip, should add 4 ips with highest ticks in https://app.qubic.li/network/live
SECRET_SEED = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" # qubic secret seed used to submit solution (must has at least 1 billion qubic) and pay reward for miners

# POOL equal to  NET --> Solo Mode
# POOL less than NET  --> Share Mode
# NET_DIFFICULTY need to be same as current qubic solution threshold
INITIAL_POOL_DIFFICULTY = 80
INITIAL_NET_DIFFICULTY = 80
```
Example for `verify` mode

```
MODE = "verify" # main | verify
# main: your server will be a pool that miners can connect and mining
# verify: your server will help the main server speed up verification process, miners can't connect to this server and mining

MAX_VERIFICATION_THREADS = 1 # remove this line to use max threads

# POOL equal to  NET --> Solo Mode
# POOL less than NET  --> Share Mode
# NET_DIFFICULTY need to be same as current qubic solution threshold
INITIAL_POOL_DIFFICULTY = 80
INITIAL_NET_DIFFICULTY = 80

# only set when MODE = "verify"
CLUSTER_MAIN_SERVER = "host:port" # qatum main server which this verification server will help
```

# Frontend

#### Change API

Change Qatum API by set enviroment variable `VITE_API_SERVER`

#### Build

Run `npm run build`, out dir is `./dist`

#### Admin Portal

Go to `https://host/login` and use admin credentials to login
