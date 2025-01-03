#include <iostream>
#include <napi.h>
#include <immintrin.h>
#include <stdint.h>
#include <atomic>
#include "network.hpp"
#include "helper.hpp"
#include "keyUtils.hpp"
#include "logger.hpp"
#include "overload.hpp"
#include "public_settings.hpp"
#include "score.hpp"
#include "solution_struct.hpp"

using namespace std;
using namespace Napi;

Socket qsocket;
string globalIp;

Napi::ThreadSafeFunction tsfn;
std::atomic_bool stop_thread = false;
SolutionQueue *solutionQueue;
void VerifySolutionThread(SolutionQueue *solutionQueue, ScoreFunction<DATA_LENGTH, NUMBER_OF_HIDDEN_NEURONS, NUMBER_OF_NEIGHBOR_NEURONS, MAX_DURATION, NUMBER_OF_OPTIMIZATION_STEPS> *score, unsigned long long threadId)
{
    score->initMemory();
    while (true)
    {
        if (stop_thread)
            break;

        while (solutionQueue->hasSolution())
        {
            if (stop_thread)
                break;

            Solution solution = solutionQueue->getSolution();

            m256i computorPublicKey;
            m256i nonce256;
            m256i seed256;
            string md5Hash = solution.md5Hash;

            hexToByte(solution.nonce, nonce256.m256i_u8, 32);
            hexToByte(solution.miningSeed, seed256.m256i_u8, 32);
            getPublicKeyFromIdentity((const unsigned char *)solution.computorId, (unsigned char *)&computorPublicKey);
            score->initMiningData(seed256);
            unsigned int resultScore = (*score)(0, computorPublicKey, seed256, nonce256);

            bool isSolution = score->isValidScore(resultScore) && score->isGoodScore(resultScore, SOLUTION_THRESHOLD_DEFAULT);
            tsfn.BlockingCall([isSolution, md5Hash](Napi::Env env, Napi::Function jsCallback)
                              {   HandleScope scope(env);   Object obj = Object::New(env); obj.Set("md5Hash", md5Hash); obj.Set("isSolution", isSolution);  jsCallback.Call({obj}); });
        }

        this_thread::sleep_for(chrono::milliseconds(100));
    }

    score->freeMemory();
    delete score;
}

/////////// Workers ///////////
class ConnectWorker : public AsyncWorker
{
public:
    ConnectWorker(Function &callback, string ip)
        : AsyncWorker(callback), ip(ip) {}

    ~ConnectWorker() {}

    void Execute() override
    {
        if (qsocket.isConnected)
        {
            qsocket.close();
            qsocket.connect(ip.c_str(), PORT);
        }
        else
        {
            qsocket.connect(ip.c_str(), PORT);
        }
    }

    void OnOK() override
    {
        HandleScope scope(Env());
        Callback().Call({Boolean::New(Env(), qsocket.isConnected)});
    }

private:
    string ip;
};

class GetSeedWorker : public AsyncWorker
{
public:
    GetSeedWorker(Function &callback)
        : AsyncWorker(callback) {}

    ~GetSeedWorker() {}

    void Execute() override
    {
        Socket qsocket;
        bool connectOk = qsocket.connect(globalIp.c_str(), PORT) != -1;

        if (connectOk)
        {
            CurrentSystemInfo infoz = qsocket.getSystemInfo();
            bool isOk = true;
            char *infozPtr = (char *)&infoz;
            int sum = 0;
            for (int i = 0; i < sizeof(CurrentSystemInfo); i++)
            {
                sum += (int)infozPtr[i];
            }
            if (sum == 0)
            {
                isOk = false;
            }
            char hex[64];
            unsigned char seed[32] __attribute((aligned(32)));
            memcpy(seed, infoz.randomMiningSeed, 32);
            byteToHex(seed, hex, 32);
            seedHex = isOk ? string((const char *)hex, 64) : "-1";
            qsocket.close();
        }
        else
        {
            seedHex = "-1";
        }
    }

    void OnOK() override
    {
        HandleScope scope(Env());
        Callback().Call({String::New(Env(), seedHex)});
    }

private:
    std::string seedHex;
};

class VerifySolutionWorker : public AsyncWorker
{
public:
    VerifySolutionWorker(Number &threads, Function &callback)
        : AsyncWorker(callback)
    {

        tsfn = Napi::ThreadSafeFunction::New(
            Env(),
            callback,
            "VerifyCb",
            0,
            1,
            [](Napi::Env) {
            });

        this->numberOfthreads = threads.Int64Value();
    }

    ~VerifySolutionWorker() {}

    void Execute() override
    {

        vector<thread> threadsPool;
        solutionQueue = new SolutionQueue();

        for (unsigned long long i = 0; i < numberOfthreads; i++)
        {
            thread thread_1 = thread(VerifySolutionThread, solutionQueue, new ScoreFunction<DATA_LENGTH, NUMBER_OF_HIDDEN_NEURONS, NUMBER_OF_NEIGHBOR_NEURONS, MAX_DURATION, NUMBER_OF_OPTIMIZATION_STEPS>(1), i);
            threadsPool.push_back(move(thread_1));
        }
        for (auto &thread_1 : threadsPool)
        {
            thread_1.join();
        }

        tsfn.Release();
        delete solutionQueue;
    }

    void OnOK() override
    {
        HandleScope scope(Env());
        Callback().Call({});
    }

public:
    unsigned long long numberOfthreads;
};

class SubmitSolutionWorker : public AsyncWorker
{
public:
    SubmitSolutionWorker(Function &callback, string ip, string nonceHex, string seedHex, string computorId, string secretSeed)
        : AsyncWorker(callback)
    {
        this->nonceHex = nonceHex;
        this->seedHex = seedHex;
        this->computorId = computorId;
        this->ip = ip;
        this->secretSeed = secretSeed;
    }

    ~SubmitSolutionWorker() {}

    void Execute() override
    {
        unsigned char nonce[32];
        unsigned char seed[32];
        __m256i computorPublicKey;
        hexToByte(nonceHex.c_str(), nonce, 32);
        hexToByte(seedHex.c_str(), seed, 32);
        getPublicKeyFromIdentity((const unsigned char *)computorId.c_str(), (unsigned char *)&computorPublicKey);
        Socket sendSocket;
        isOk = sendSocket.connect(ip.c_str(), PORT) != -1;
        isOk = sendSocket.sendSolution(computorPublicKey, nonce, seed, secretSeed.c_str()) && isOk;
    }

    void OnOK() override
    {
        HandleScope scope(Env());
        Callback().Call({Boolean::New(Env(), isOk)});
    }

private:
    bool isOk;
    string seedHex;
    string nonceHex;
    string computorId;
    string ip;
    string secretSeed;
};

/////////// Native Funtions ///////////
Napi::Value initVerifyThread(const Napi::CallbackInfo &info)
{
    Number num = info[0].As<Number>();
    Function cb = info[1].As<Function>();

    VerifySolutionWorker *wk = new VerifySolutionWorker(num, cb);
    wk->Queue();

    return info.Env().Undefined();
}

Napi::Value stopVerifyThread(const Napi::CallbackInfo &info)
{
    stop_thread = true;
    return info.Env().Undefined();
}

Napi::Value initSocket(const Napi::CallbackInfo &info)
{

    Napi::Env env = info.Env();
    string ip = info[0].As<Napi::String>();
    globalIp = ip;
    Function cb = info[1].As<Function>();
    ConnectWorker *wk = new ConnectWorker(cb, ip);
    wk->Queue();
    return info.Env().Undefined();
}

Napi::Value getMiningCurrentMiningSeed(const Napi::CallbackInfo &info)
{
    Function cb = info[0].As<Function>();
    GetSeedWorker *wk = new GetSeedWorker(cb);
    wk->Queue();
    return info.Env().Undefined();
}

Napi::Value sendSol(const Napi::CallbackInfo &info)
{
    Function cb = info[5].As<Function>();
    SubmitSolutionWorker *wk = new SubmitSolutionWorker(cb, info[0].As<Napi::String>(), info[1].As<Napi::String>(), info[2].As<Napi::String>(), info[3].As<Napi::String>(), info[4].As<Napi::String>());
    wk->Queue();
    return info.Env().Undefined();
}

Napi::Value pushSolutionToVerifyQueue(const Napi::CallbackInfo &info)
{
    // string seed = info[0].As<Napi::String>().Utf8Value();
    // cout << seed.c_str() << endl;
    string seed = info[0].As<Napi::String>().Utf8Value();
    string nonce = info[1].As<Napi::String>().Utf8Value();
    string computorId = info[2].As<Napi::String>().Utf8Value();
    string md5Hash = info[3].As<Napi::String>().Utf8Value();

    solutionQueue->addSolution(Solution(seed.c_str(), nonce.c_str(), computorId.c_str(), md5Hash));

    return info.Env().Undefined();
}

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set(Napi::String::New(env, "initSocket"),
                Napi::Function::New(env, initSocket));

    exports.Set(Napi::String::New(env, "getMiningCurrentMiningSeed"),
                Napi::Function::New(env, getMiningCurrentMiningSeed));

    exports.Set(Napi::String::New(env, "sendSol"),
                Napi::Function::New(env, sendSol));

    exports.Set(Napi::String::New(env, "initLogger"),
                Napi::Function::New(env, initLogger));

    exports.Set(Napi::String::New(env, "initVerifyThread"),
                Napi::Function::New(env, initVerifyThread));

    exports.Set(Napi::String::New(env, "stopVerifyThread"),
                Napi::Function::New(env, stopVerifyThread));

    exports.Set(Napi::String::New(env, "pushSolutionToVerifyQueue"),
                Napi::Function::New(env, pushSolutionToVerifyQueue));

    return exports;
}

NODE_API_MODULE(q, Init)