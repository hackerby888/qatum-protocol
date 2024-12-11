#include <iostream>
#include <napi.h>
#include <immintrin.h>
#include <stdint.h>
#include "network.hpp"
#include "helper.hpp"
#include "k12.hpp"
#include "logger.hpp"

using namespace std;
using namespace Napi;

Socket qsocket;
bool isConnected = false;
string globalIp;

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

class SubmitSolutionWorker : public AsyncWorker
{
public:
    SubmitSolutionWorker(Function &callback, string ip, string nonceHex, string seedHex, string computorId)
        : AsyncWorker(callback)
    {
        this->nonceHex = nonceHex;
        this->seedHex = seedHex;
        this->computorId = computorId;
        this->ip = ip;
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
        isOk = sendSocket.sendSolution(computorPublicKey, nonce, seed) && isOk;
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
};

Napi::Value
initSocket(const Napi::CallbackInfo &info)
{
    log("error", "lol");
    log("error", "lol");
    log("error", "lol");
    Napi::Env env = info.Env();
    string ip = info[0].As<Napi::String>();
    globalIp = ip;
    Function cb = info[1].As<Function>();
    ConnectWorker *wk = new ConnectWorker(cb, ip);
    wk->Queue();
    return info.Env().Undefined();
}

Value getMiningCurrentMiningSeed(const Napi::CallbackInfo &info)
{
    Function cb = info[0].As<Function>();
    GetSeedWorker *wk = new GetSeedWorker(cb);
    wk->Queue();
    return info.Env().Undefined();
}
Napi::Value sendSol(const Napi::CallbackInfo &info)
{
    Function cb = info[4].As<Function>();
    SubmitSolutionWorker *wk = new SubmitSolutionWorker(cb, info[0].As<Napi::String>(), info[1].As<Napi::String>(), info[2].As<Napi::String>(), info[3].As<Napi::String>());
    wk->Queue();
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

    return exports;
}

NODE_API_MODULE(q, Init)