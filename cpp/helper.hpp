#pragma once
#include "immintrin.h"
#include "string.h"
#include <cstdint>

#include "keyUtils.hpp"

static void randomNonce(unsigned char *nonce)
{
    _rdrand64_step((unsigned long long *)&nonce[0]);
    _rdrand64_step((unsigned long long *)&nonce[8]);
    _rdrand64_step((unsigned long long *)&nonce[16]);
    _rdrand64_step((unsigned long long *)&nonce[24]);
}

static void byteToHex(const uint8_t *byte, char *hex, const int sizeInByte)
{
    for (int i = 0; i < sizeInByte; i++)
    {
        sprintf(hex + i * 2, "%02x", byte[i]);
    }
}

static void hexToByte(const char *hex, uint8_t *byte, const int sizeInByte)
{
    for (int i = 0; i < sizeInByte; i++)
    {
        sscanf(hex + i * 2, "%2hhx", &byte[i]);
    }
}

static inline bool isZero(const __m256i &a)
{
    return _mm256_testz_si256(a, a) == 1;
}

static inline void zero256(__m256i &a)
{
    a = _mm256_setzero_si256();
}
