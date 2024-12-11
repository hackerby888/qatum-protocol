#pragma once
#include "immintrin.h"
#include <sys/socket.h>
#include <arpa/inet.h>
#include <iostream>
#include <string.h>
#include <cstdint>
#include <vector>
#include <unistd.h>
#include "k12.hpp"
#include "helper.hpp"
#include <thread>
#include "logger.hpp"

#define ZERO _mm256_setzero_si256()
#define MESSAGE_TYPE_SOLUTION 0
#define REQUEST_SYSTEM_INFO 46
#define RESPOND_SYSTEM_INFO 47
#define PORT 21841

using namespace std;

struct RequestResponseHeader
{
private:
    unsigned char _size[3];
    unsigned char _type;
    unsigned int _dejavu;

public:
    // The maximum size that a message may have (encoded in 3 bytes)
    static constexpr unsigned int max_size = 0xFFFFFF;

    // Return the size of the message
    inline unsigned int size() const
    {
        return (*((unsigned int *)_size)) & 0xFFFFFF;
    }

    // Set message size with compile-time check
    template <unsigned int size>
    constexpr inline void setSize()
    {
        static_assert(size <= max_size);
        _size[0] = (unsigned char)size;
        _size[1] = (unsigned char)(size >> 8);
        _size[2] = (unsigned char)(size >> 16);
    }

    // Set message size with run-time check of size (returns false if message is too big)
    inline bool checkAndSetSize(unsigned int size)
    {
        if (size > max_size)
            return false;

        _size[0] = (unsigned char)size;
        _size[1] = (unsigned char)(size >> 8);
        _size[2] = (unsigned char)(size >> 16);
        return true;
    }

    inline bool isDejavuZero() const
    {
        return !_dejavu;
    }

    inline unsigned int dejavu() const
    {
        return _dejavu;
    }

    inline void setDejavu(unsigned int dejavu)
    {
        _dejavu = dejavu;
    }

    inline void randomizeDejavu()
    {
        _rdrand32_step(&_dejavu);
        if (!_dejavu)
        {
            _dejavu = 1;
        }
    }

    inline unsigned char type() const
    {
        return _type;
    }

    inline void setType(const unsigned char type)
    {
        _type = type;
    }

    // Return pointer to payload, which is stored behind the header.
    // The type() is not checked against the PayloadType!
    template <typename PayloadType>
    inline PayloadType *getPayload()
    {
        return reinterpret_cast<PayloadType *>(this + 1);
    }

    // Check if the payload size is as expected.
    inline bool checkPayloadSize(unsigned int expected_payload_size) const
    {
        return size() == expected_payload_size + sizeof(RequestResponseHeader);
    }

    // Check if the payload size is in the expected range.
    inline bool checkPayloadSizeMinMax(unsigned int min_payload_size, unsigned int max_payload_size) const
    {
        return min_payload_size + sizeof(RequestResponseHeader) <= size() && size() <= max_payload_size + sizeof(RequestResponseHeader);
    }

    // Get size of the payload (without checking validity of overall size).
    inline unsigned int getPayloadSize() const
    {
        return this->size() - sizeof(RequestResponseHeader);
    }
};

struct BroadcastMessage
{
    unsigned char sourcePublicKey[32];
    unsigned char destinationPublicKey[32];
    unsigned char gammingNonce[32];

    enum
    {
        type = 1,
    };
};

typedef struct
{
    short version;
    unsigned short epoch;
    unsigned int tick;
    unsigned int initialTick;
    unsigned int latestCreatedTick;

    unsigned short initialMillisecond;
    unsigned char initialSecond;
    unsigned char initialMinute;
    unsigned char initialHour;
    unsigned char initialDay;
    unsigned char initialMonth;
    unsigned char initialYear;

    unsigned int numberOfEntities;
    unsigned int numberOfTransactions;

    uint8_t randomMiningSeed[32];
    int solutionThreshold;
} CurrentSystemInfo;

typedef struct
{
    unsigned char sourcePublicKey[32];
    unsigned char destinationPublicKey[32];
    unsigned char gammingNonce[32];
} Message;

struct Socket
{
    int mSocket = 1;
    bool isConnected = false;
    int connect(const char *nodeIp, int nodePort)
    {
        isConnected = false;
        int serverSocket = socket(AF_INET, SOCK_STREAM, 0);
        timeval tv;
        tv.tv_sec = 2;
        tv.tv_usec = 0;
        setsockopt(serverSocket, SOL_SOCKET, SO_RCVTIMEO, (const char *)&tv, sizeof tv);
        setsockopt(serverSocket, SOL_SOCKET, SO_SNDTIMEO, (const char *)&tv, sizeof tv);
        sockaddr_in addr;
        memset((char *)&addr, 0, sizeof(addr));
        addr.sin_family = AF_INET;
        addr.sin_port = htons(nodePort);

        if (inet_pton(AF_INET, nodeIp, &addr.sin_addr) <= 0)
        {
            log("error", "addon: error translating command line ip address to usable one");
            return -1;
        }

        if (::connect(serverSocket, (const sockaddr *)&addr, sizeof(addr)) < 0)
        {
            log("error", "addon: failed to connect " + string(nodeIp));
            return -1;
        }

        mSocket = serverSocket;
        isConnected = true;
        return serverSocket;
    }

    int receiveData(uint8_t *buffer, int sz)
    {
        return recv(mSocket, (char *)buffer, sz, 0);
    }

    int sendData(uint8_t *buffer, int sz)
    {
        try
        {
            int size = sz;
            int numberOfBytes;
            while (size)
            {
                if ((numberOfBytes = send(mSocket, (char *)buffer, size, 0)) <= 0)
                {
                    return 0;
                }
                buffer += numberOfBytes;
                size -= numberOfBytes;
            }

            return size == 0;
        }
        catch (const std::exception &e)
        {
            isConnected = false;
            return 0;
        }
    }

    bool receiveDataAll(std::vector<uint8_t> &receivedData)
    {
        receivedData.resize(0);
        uint8_t tmp[1024];
        int recvByte = receiveData(tmp, 1024);
        while (recvByte > 0)
        {
            receivedData.resize(recvByte + receivedData.size());
            memcpy(receivedData.data() + receivedData.size() - recvByte, tmp, recvByte);
            recvByte = receiveData(tmp, 1024);
        }
        if (receivedData.size() == 0)
        {
            return false;
        }

        return true;
    }

    void close()
    {
        ::close(mSocket);
    }

    bool sendSolution(__m256i &computorPublicKey, unsigned char *nonce, unsigned char *randomSeed)
    {
        struct
        {
            RequestResponseHeader header;
            BroadcastMessage message;
            unsigned char solutionMiningSeed[32];
            unsigned char solutionNonce[32];
            unsigned char signature[64];
        } packet;

        packet.header.checkAndSetSize(sizeof(packet));
        packet.header.setDejavu(0);
        packet.header.setType(MESSAGE_TYPE_SOLUTION);

        memset(packet.message.sourcePublicKey, 0, sizeof(packet.message.sourcePublicKey));
        memcpy(packet.message.destinationPublicKey, &computorPublicKey, sizeof(packet.message.destinationPublicKey));

        unsigned char sharedKeyAndGammingNonce[64];
        memset(sharedKeyAndGammingNonce, 0, 32);
        unsigned char gammingKey[32];
        do
        {
            _rdrand64_step((unsigned long long *)&packet.message.gammingNonce[0]);
            _rdrand64_step((unsigned long long *)&packet.message.gammingNonce[8]);
            _rdrand64_step((unsigned long long *)&packet.message.gammingNonce[16]);
            _rdrand64_step((unsigned long long *)&packet.message.gammingNonce[24]);
            memcpy(&sharedKeyAndGammingNonce[32], packet.message.gammingNonce, 32);
            KangarooTwelve64To32(sharedKeyAndGammingNonce, gammingKey);
        } while (gammingKey[0]);

        unsigned char gamma[32 + 32];
        KangarooTwelve(gammingKey, sizeof(gammingKey), gamma, sizeof(gamma));
        for (unsigned int i = 0; i < 32; i++)
        {
            packet.solutionMiningSeed[i] = randomSeed[i] ^ gamma[i];
            packet.solutionNonce[i] = nonce[i] ^ gamma[i + 32];
        }

        _rdrand64_step((unsigned long long *)&packet.signature[0]);
        _rdrand64_step((unsigned long long *)&packet.signature[8]);
        _rdrand64_step((unsigned long long *)&packet.signature[16]);
        _rdrand64_step((unsigned long long *)&packet.signature[24]);
        _rdrand64_step((unsigned long long *)&packet.signature[32]);
        _rdrand64_step((unsigned long long *)&packet.signature[40]);
        _rdrand64_step((unsigned long long *)&packet.signature[48]);
        _rdrand64_step((unsigned long long *)&packet.signature[56]);

        // {
        //     cout << "TEST PACKET ON NODE" << endl;
        //     RequestResponseHeader *testPacket = (RequestResponseHeader *)&packet;
        //     BroadcastMessage *request = testPacket->getPayload<BroadcastMessage>();
        //     unsigned char backendSharedKeyAndGammingNonce[64];
        //     memcpy(&backendSharedKeyAndGammingNonce[32], &request->gammingNonce, 32);
        //     unsigned char backendGammingKey[32];
        //     KangarooTwelve64To32(backendSharedKeyAndGammingNonce, backendGammingKey);
        //     memset(backendSharedKeyAndGammingNonce, 0, 32);
        //     unsigned char backendGamma[64];
        //     int messagePayloadSize = testPacket->size() - sizeof(RequestResponseHeader) - sizeof(BroadcastMessage) - 64;
        //     KangarooTwelve(backendGammingKey, sizeof(backendGammingKey), backendGamma, messagePayloadSize);
        //     for (unsigned int j = 0; j < messagePayloadSize; j++)
        //     {
        //         ((unsigned char *)request)[sizeof(BroadcastMessage) + j] ^= gamma[j];
        //     }
        //     unsigned char *backenSeed = ((unsigned char *)request + sizeof(BroadcastMessage));
        //     unsigned char *backendNonce = ((unsigned char *)request + sizeof(BroadcastMessage) + 32);
        //     char hex[64];
        //     byteToHex(backenSeed, hex, 32);
        //     cout << "backendSeed: " << hex << endl;
        //     byteToHex(backendNonce, hex, 32);
        //     cout << "backendNonce: " << hex << endl;
        // }

        int retry = 0;
        while (!sendData((uint8_t *)&packet, packet.header.size()))
        {
            cout << "addon: failed to send solution to node\n";
            this_thread::sleep_for(std::chrono::milliseconds(500));
            if (retry++ >= 3)
            {
                return false;
            }
        }

        return true;
    }

    CurrentSystemInfo
    getSystemInfo()
    {
        CurrentSystemInfo result;
        memset(&result, 0, sizeof(CurrentSystemInfo));

        struct
        {
            RequestResponseHeader header;
        } packet;
        packet.header.checkAndSetSize(sizeof(packet));
        packet.header.randomizeDejavu();
        packet.header.setType(REQUEST_SYSTEM_INFO);

        bool isOk = sendData((uint8_t *)&packet, packet.header.size());
        if (!isOk)
        {
            return result;
        }

        std::vector<uint8_t> buffer;
        if (!receiveDataAll(buffer))
        {
            return result;
        }
        uint8_t *data = buffer.data();
        int recvByte = buffer.size();
        int ptr = 0;
        while (ptr < recvByte)
        {
            auto header = (RequestResponseHeader *)(data + ptr);
            if (header->type() == RESPOND_SYSTEM_INFO)
            {
                auto curSystemInfo = (CurrentSystemInfo *)(data + ptr + sizeof(RequestResponseHeader));
                result = *curSystemInfo;
            }
            ptr += header->size();
        }
        return result;
    }
};