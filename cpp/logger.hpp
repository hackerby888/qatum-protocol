#pragma once

#include <iostream>
#include <napi.h>
using namespace std;
using namespace Napi;

Napi::ThreadSafeFunction threadSafeLogger;
// bool callbackWasSet = false;

void initLogger(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    Napi::Function napiFunction = info[0].As<Napi::Function>();

    threadSafeLogger =
        Napi::ThreadSafeFunction::New(env, napiFunction, "threadSafeLogger", 0, 1);
}

void log(std::string type, std::string msg)
{
    auto callback = [type, msg](Napi::Env env, Napi::Function jsCallback)
    {
        jsCallback.Call({Napi::String::New(env, type), Napi::String::New(env, msg)});
    };

    threadSafeLogger.BlockingCall(callback);
}