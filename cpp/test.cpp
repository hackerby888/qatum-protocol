#pragma once
#include <iostream>
#include "keyUtils.hpp"

using namespace std;
int main()
{
    const char *seed1 = "caaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaac";
    const char *seed2 = "caaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab";
    const char *msg = "hellodasdasdasas";

    uint8_t signature1[64];
    uint8_t signature2[64];
    signData(seed1, (const uint8_t *)msg, strlen(msg), signature1);
    signData(seed2, (const uint8_t *)msg, strlen(msg), signature2);

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