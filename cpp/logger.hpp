#pragma once

#include <iostream>
#include <napi.h>
using namespace std;
using namespace Napi;

// Napi::ThreadSafeFunction threadSafeCallback;
// bool callbackWasSet = false;

void initLogger(const Napi::CallbackInfo &info)
{
    // Napi::Env env = info.Env();

    // if (info.Length() < 1)
    // {
    //     throw Napi::Error::New(env, "Missing argument");
    // }

    // if (!info[0].IsFunction())
    // {
    //     throw Napi::TypeError::New(env, "Wrong argument type");
    // }

    // Napi::Function napiFunction = info[0].As<Napi::Function>();

    // threadSafeCallback =
    //     Napi::ThreadSafeFunction::New(env, napiFunction, "Callback", 0, 1);

    // callbackWasSet = true;
}

void log(std::string type, std::string msg)
{
    // auto callback = [type, msg](Napi::Env env, Napi::Function jsCallback)
    // {
    //     jsCallback.Call({Napi::String::New(env, type), Napi::String::New(env, msg)});
    // };

    // threadSafeCallback.NonBlockingCall(callback);
    // threadSafeCallback.Release();
    cout << msg << endl;
}