#pragma once
#include <iostream>
#include "keyUtils.hpp"

using namespace std;
int main()
{
    string seed1 = "caaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaac";
    string seed2 = "caaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab";
    string msg = "hello";

    uint8_t signature1[64];
    uint8_t signature2[64];
    signData(seed1.c_str(), (const uint8_t *)msg.c_str(), msg.size(), signature1);
    signData(seed2.c_str(), (const uint8_t *)msg.c_str(), msg.size(), signature2);

    cout << "signature1: ";
    for (int i = 0; i < 64; i++)
    {
        cout << hex << (int)signature1[i];
    }
    cout << endl;

    cout << "signature2: ";
    for (int i = 0; i < 64; i++)
    {
        cout << hex << (int)signature2[i];
    }
    return 0;
}