#include <iostream>
#include <napi.h>
#include <immintrin.h>
#include <stdint.h>
#include "network.hpp"
#include "helper.hpp"
#include "k12.hpp"

using namespace std;
using namespace Napi;

Socket qsocket;
bool isConnected = false;

class GetSeedWorker : public AsyncWorker
{
public:
    GetSeedWorker(Function &callback)
        : AsyncWorker(callback) {}

    ~GetSeedWorker() {}

    void Execute() override
    {
        CurrentSystemInfo infoz = qsocket.getSystemInfo();
        char hex[64];
        unsigned char seed[32] __attribute((aligned(32)));
        memcpy(seed, infoz.randomMiningSeed, 32);
        byteToHex(seed, hex, 32);
        seedHex = string((const char *)hex, 64);
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

Napi::Boolean
initSocket(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    string ip = info[0].As<Napi::String>();
    bool isOk = false;
    if (!qsocket.isConnected)
    {
        isOk = qsocket.connect(ip.c_str(), PORT) != -1;
        qsocket.isConnected = isOk;
    }
    else
    {
        qsocket.close();
        isOk = qsocket.connect(ip.c_str(), PORT) != -1;
    }
    return Napi::Boolean::New(env, isOk);
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

    return exports;
}

NODE_API_MODULE(q, Init)