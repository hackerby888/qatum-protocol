#pragma once
#include "immintrin.h"
#include "string.h"
#include <cstdint>
static void randomNonce(unsigned char *nonce)
{
    _rdrand64_step((unsigned long long *)&nonce[0]);
    _rdrand64_step((unsigned long long *)&nonce[8]);
    _rdrand64_step((unsigned long long *)&nonce[16]);
    _rdrand64_step((unsigned long long *)&nonce[24]);
}

static void getIdentityFromPublicKey(unsigned char *publicKey, unsigned short *identity, bool isLowerCase)
{
    for (int i = 0; i < 4; i++)
    {
        unsigned long long publicKeyFragment = *((unsigned long long *)&publicKey[i << 3]);
        for (int j = 0; j < 14; j++)
        {
            identity[i * 14 + j] = publicKeyFragment % 26 + (isLowerCase ? L'a' : L'A');
            publicKeyFragment /= 26;
        }
    }
    unsigned int identityBytesChecksum;
    KangarooTwelve(publicKey, 32, (unsigned char *)&identityBytesChecksum, 3);
    identityBytesChecksum &= 0x3FFFF;
    for (int i = 0; i < 4; i++)
    {
        identity[56 + i] = identityBytesChecksum % 26 + (isLowerCase ? L'a' : L'A');
        identityBytesChecksum /= 26;
    }
    identity[60] = 0;
}

static bool getPublicKeyFromIdentity(const unsigned char *identity, unsigned char *publicKey)
{
    unsigned char publicKeyBuffer[32];
    for (int i = 0; i < 4; i++)
    {
        *((unsigned long long *)&publicKeyBuffer[i << 3]) = 0;
        for (int j = 14; j-- > 0;)
        {
            if (identity[i * 14 + j] < 'A' || identity[i * 14 + j] > 'Z')
            {
                return false;
            }

            *((unsigned long long *)&publicKeyBuffer[i << 3]) = *((unsigned long long *)&publicKeyBuffer[i << 3]) * 26 + (identity[i * 14 + j] - 'A');
        }
    }
    *((__m256i *)publicKey) = *((__m256i *)publicKeyBuffer);

    return true;
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