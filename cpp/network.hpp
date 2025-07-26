#pragma once

#ifdef _MSC_VER
#include <intrin.h>
#include <winsock2.h>
#include <Ws2tcpip.h>

#pragma comment(lib, "ws2_32.lib")

#else
#include "immintrin.h"
#include <sys/socket.h>
#include <arpa/inet.h>
#include <unistd.h>
#endif

#include <iostream>
#include <string.h>
#include <cstdint>
#include <vector>
#include "helper.hpp"
#include <thread>
#include "logger.hpp"
#define ZERO _mm256_setzero_si256()
#define MESSAGE_TYPE_SOLUTION 0
#define REQUEST_SYSTEM_INFO 46
#define RESPOND_SYSTEM_INFO 47
#define BROADCAST_TRANSACTION 24
#define SIGNATURE_SIZE 64
#define PORT 21841

using namespace std;

constexpr int QUTIL_CONTRACT_ID = 4;

enum qutilFunctionId
{
    GetSendToManyV1Fee = 1,
};

enum qutilProcedureId
{
    SendToManyV1 = 1,
    BurnQubic = 2,
};

struct SendToManyV1_input
{
    uint8_t addresses[25][32];
    int64_t amounts[25];
};

struct BurnQubic_input
{
    long long amount;
};
struct BurnQubic_output
{
    long long amount;
};

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

typedef struct
{
    unsigned char sourcePublicKey[32];
    unsigned char destinationPublicKey[32];
    long long amount;
    unsigned int tick;
    unsigned short inputType;
    unsigned short inputSize;
} Transaction;

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

struct RequestContractFunction // Invokes contract function
{
    unsigned int contractIndex;
    unsigned short inputType;
    unsigned short inputSize;
    // Variable-size input

    static constexpr unsigned char type()
    {
        return 42;
    }
};

struct RespondContractFunction // Returns result of contract function invocation
{
    // Variable-size output; the size must be 0 if the invocation has failed for whatever reason (e.g. no a function registered for [inputType], or the function has timed out)

    static constexpr unsigned char type()
    {
        return 43;
    }
};

struct GetSendToManyV1Fee_output
{
    long long fee; // Number of billionths
    static constexpr unsigned char type()
    {
        return 43;
    }
};

struct QutilResult
{
    unsigned int tick;
    string txHash;
};

struct Socket
{
    int mSocket = 1;
    bool isConnected = false;
#ifdef _MSC_VER
    int connect(const char *nodeIp, int nodePort)
    {
        isConnected = false;
        WSADATA wsaData;
        if (WSAStartup(MAKEWORD(2, 0), &wsaData) != 0)
        {
            return -1;
        }

        int serverSocket = socket(AF_INET, SOCK_STREAM, 0);
        size_t tv = 1000;
        setsockopt(serverSocket, SOL_SOCKET, SO_RCVTIMEO, (const char *)&tv, sizeof tv);
        setsockopt(serverSocket, SOL_SOCKET, SO_SNDTIMEO, (const char *)&tv, sizeof tv);

        sockaddr_in addr;
        memset((char *)&addr, 0, sizeof(addr));
        addr.sin_family = AF_INET;
        addr.sin_port = htons(nodePort);

        if (inet_pton(AF_INET, nodeIp, &addr.sin_addr) <= 0)
        {
            log("error", "error translating command line ip address to usable one.");
            return -1;
        }

        if (::connect(serverSocket, (const sockaddr *)&addr, sizeof(addr)) < 0)
        {
            log("error", "error connecting to node " + string(nodeIp) + " on port " + to_string(nodePort));
            close();
            return -1;
        }

        isConnected = true;
        mSocket = serverSocket;
        flush();
        return serverSocket;
    }
#else
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
            return -1;
        }

        if (::connect(serverSocket, (const sockaddr *)&addr, sizeof(addr)) < 0)
        {
            return -1;
        }

        mSocket = serverSocket;
        isConnected = true;
        flush();
        return serverSocket;
    }
#endif

    void flush()
    {
        uint8_t tmp[1024];
        int recvByte = receiveData(tmp, 1024);
        while (recvByte > 0)
        {
            recvByte = receiveData(tmp, 1024);
        }
    }

    int
    receiveData(uint8_t *buffer, int sz)
    {
        return recv(mSocket, (char *)buffer, sz, 0);
    }

    bool sendData(uint8_t *buffer, int sz)
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
#ifdef _MSC_VER
        closesocket(mSocket);
        WSACleanup();
#else

        ::close(mSocket);
#endif
    }

    bool sendSolution(__m256i &computorPublicKey, unsigned char *nonce, unsigned char *randomSeed, const char *secretSeed)
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
        packet.header.setType(BroadcastMessage::type);

        uint8_t signingPublicKey[32] = {0};
        uint8_t privateKey[32] = {0};
        uint8_t subseed[32] = {0};

        getSubseedFromSeed((uint8_t *)secretSeed, subseed);
        getPrivateKeyFromSubSeed(subseed, privateKey);
        getPublicKeyFromSeed(secretSeed, signingPublicKey);

        memcpy(packet.message.sourcePublicKey, signingPublicKey, sizeof(packet.message.sourcePublicKey));
        memcpy(packet.message.destinationPublicKey, &computorPublicKey, sizeof(packet.message.destinationPublicKey));

        unsigned char sharedKeyAndGammingNonce[64];
        memset(sharedKeyAndGammingNonce, 0, 32);

        // If provided seed is the for computor public key, generate sharedKey into first 32 bytes to encrypt message
        if (memcmp(&computorPublicKey, signingPublicKey, 32) == 0)
        {
            getSharedKey(privateKey, (const unsigned char *)&computorPublicKey, sharedKeyAndGammingNonce);
        }

        // Last 32 bytes of sharedKeyAndGammingNonce is randomly created so that gammingKey[0] = 0 (MESSAGE_TYPE_SOLUTION)
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

        // Sign the message
        uint8_t signature[64];
        signData(secretSeed, (const uint8_t *)&packet + sizeof(RequestResponseHeader), sizeof(packet) - sizeof(RequestResponseHeader) - 64, signature);
        memcpy(packet.signature, signature, 64);

        // {
        //     cout << "TEST PACKET ON NODE" << endl;
        //     uint8_t digest[32];
        //     RequestResponseHeader *testPacket = (RequestResponseHeader *)&packet;
        //     BroadcastMessage *request = testPacket->getPayload<BroadcastMessage>();
        //     const unsigned int messageSize = testPacket->size() - sizeof(RequestResponseHeader);
        //     // check signature
        //     KangarooTwelve((uint8_t *)request, messageSize - 64, digest, sizeof(digest));
        //     if (verify(request->sourcePublicKey, digest, (((const unsigned char *)request) + (messageSize - 64))))
        //     {
        //         unsigned char backendSharedKeyAndGammingNonce[64];
        //         memset(backendSharedKeyAndGammingNonce, 0, 32);

        //         if (memcmp(request->sourcePublicKey, request->destinationPublicKey, 32) == 0)
        //         {
        //             cout << "sourcePublicKey and destinationPublicKey are the same (msg is encrypted)" << endl;
        //             if (!getSharedKey(privateKey, request->sourcePublicKey, backendSharedKeyAndGammingNonce))
        //             {
        //                 cout << "error while get shared key" << endl;
        //             }
        //         }

        //         memcpy(&backendSharedKeyAndGammingNonce[32], &request->gammingNonce, 32);
        //         unsigned char backendGammingKey[32];
        //         memset(backendGammingKey, 0, 32);
        //         KangarooTwelve64To32(backendSharedKeyAndGammingNonce, backendGammingKey);
        //         unsigned char backendGamma[64];
        //         int messagePayloadSize = testPacket->size() - sizeof(RequestResponseHeader) - sizeof(BroadcastMessage) - 64;
        //         KangarooTwelve(backendGammingKey, sizeof(backendGammingKey), backendGamma, messagePayloadSize);
        //         for (unsigned int j = 0; j < messagePayloadSize; j++)
        //         {
        //             ((unsigned char *)request)[sizeof(BroadcastMessage) + j] ^= backendGamma[j];
        //         }
        //         unsigned char *backenSeed = ((unsigned char *)request + sizeof(BroadcastMessage));
        //         unsigned char *backendNonce = ((unsigned char *)request + sizeof(BroadcastMessage) + 32);
        //         char hex[64];
        //         byteToHex(backenSeed, hex, 32);
        //         cout << "backendSeed: " << hex << endl;
        //         byteToHex(backendNonce, hex, 32);
        //         cout << "backendNonce: " << hex << endl;
        //     }
        //     else
        //     {
        //         cout << "Signature verification failed" << endl;
        //     }
        // }

        int retry = 0;
        while (!sendData((uint8_t *)&packet, packet.header.size()))
        {
            this_thread::sleep_for(std::chrono::milliseconds(500));
            if (retry++ >= 3)
            {
                return false;
            }
        }

        return true;
    }

    bool sendSolutionBytes(const unsigned char *packet)
    {
        // {
        //     cout << "first byte of packet: " << (int)packet[0] << endl;
        //     cout << "TEST PACKET ON NODE" << endl;
        //     uint8_t digest[32];
        //     RequestResponseHeader *testPacket = (RequestResponseHeader *)packet;
        //     BroadcastMessage *request = testPacket->getPayload<BroadcastMessage>();
        //     const unsigned int messageSize = testPacket->size() - sizeof(RequestResponseHeader);
        //     cout << "messageSize: " << messageSize << endl;
        //     // check signature
        //     KangarooTwelve((uint8_t *)request, messageSize - 64, digest, sizeof(digest));
        //     cout << "first digest bytes : ";
        //     for (int i = 0; i < 32; i++)
        //     {
        //         cout << (int)digest[i] << " ";
        //     }
        //     cout << endl;
        //     if (verify(request->sourcePublicKey, digest, (((const unsigned char *)request) + (messageSize - 64))))
        //     {
        //         unsigned char backendSharedKeyAndGammingNonce[64];
        //         memset(backendSharedKeyAndGammingNonce, 0, 32);

        //         if (memcmp(request->sourcePublicKey, request->destinationPublicKey, 32) == 0)
        //         {
        //             cout << "sourcePublicKey and destinationPublicKey are the same (msg is encrypted)" << endl;
        //             // should never go here
        //             // if (!getSharedKey(privateKey, request->sourcePublicKey, backendSharedKeyAndGammingNonce))
        //             // {
        //             //     cout << "error while get shared key" << endl;
        //             // }
        //         }

        //         memcpy(&backendSharedKeyAndGammingNonce[32], &request->gammingNonce, 32);
        //         unsigned char backendGammingKey[32];
        //         memset(backendGammingKey, 0, 32);
        //         KangarooTwelve64To32(backendSharedKeyAndGammingNonce, backendGammingKey);
        //         unsigned char backendGamma[64];
        //         int messagePayloadSize = testPacket->size() - sizeof(RequestResponseHeader) - sizeof(BroadcastMessage) - 64;
        //         KangarooTwelve(backendGammingKey, sizeof(backendGammingKey), backendGamma, messagePayloadSize);
        //         for (unsigned int j = 0; j < messagePayloadSize; j++)
        //         {
        //             ((unsigned char *)request)[sizeof(BroadcastMessage) + j] ^= backendGamma[j];
        //         }
        //         unsigned char *backenSeed = ((unsigned char *)request + sizeof(BroadcastMessage));
        //         unsigned char *backendNonce = ((unsigned char *)request + sizeof(BroadcastMessage) + 32);
        //         char hex[64];
        //         byteToHex(backenSeed, hex, 32);
        //         cout << "backendSeed: " << hex << endl;
        //         byteToHex(backendNonce, hex, 32);
        //         cout << "backendNonce: " << hex << endl;
        //     }
        //     else
        //     {
        //         cout << "Signature verification failed" << endl;
        //     }
        // }

        // send the data
        int retry = 0;
        while (!sendData((uint8_t *)packet, ((RequestResponseHeader *)packet)->size()))
        {
            this_thread::sleep_for(std::chrono::milliseconds(500));
            if (retry++ >= 3)
            {
                return false;
            }
        }

        return true;
    }

    long long getSendToManyV1Fee()
    {
        struct
        {
            RequestResponseHeader header;
            RequestContractFunction rcf;
        } packet;
        packet.header.checkAndSetSize(sizeof(packet));
        packet.header.randomizeDejavu();
        packet.header.setType(RequestContractFunction::type());
        packet.rcf.inputSize = 0;
        packet.rcf.inputType = qutilFunctionId::GetSendToManyV1Fee;
        packet.rcf.contractIndex = QUTIL_CONTRACT_ID;
        sendData((uint8_t *)&packet, packet.header.size());

        GetSendToManyV1Fee_output fee;
        memset(&fee, 0, sizeof(GetSendToManyV1Fee_output));
        try
        {
            fee = receivePacketWithHeaderAs<GetSendToManyV1Fee_output>();
            return fee.fee;
        }
        catch (std::logic_error &e)
        {
            cout << e.what() << endl;
            return -1;
        }
    }

    int receiveDataBig(uint8_t *buffer, int sz)
    {
        int count = 0;
        while (sz)
        {
            int chunk = (std::min)(sz, 1024);
            int recvByte = receiveData(buffer + count, chunk);
            count += recvByte;
            sz -= recvByte;
        }
        return count;
    }

    template <typename T>
    T receivePacketWithHeaderAs()
    {
        // first receive the
        uint8_t *mBuffer = new uint8_t[sizeof(T)];
        RequestResponseHeader header;
        int recvByte = receiveData((uint8_t *)&header, sizeof(RequestResponseHeader));
        if (recvByte != sizeof(RequestResponseHeader))
        {
            throw std::logic_error("No connection.");
        }
        if (header.type() != T::type())
        {
            throw std::logic_error("Unexpected header type: " + std::to_string(header.type()) + " (expected: " + std::to_string(T::type()) + ").");
        }

        int packetSize = header.size();
        int remainingSize = packetSize - sizeof(RequestResponseHeader);
        T result;
        memset(&result, 0, sizeof(T));
        if (remainingSize)
        {
            memset(mBuffer, 0, sizeof(T));
            // receive the rest, allow 5 tries because sometimes not all requested bytes are received
            int recvByteTotal = 0;
            for (int i = 0; i < 5; ++i)
            {
                if (remainingSize > 4096)
                    recvByte = receiveDataBig(mBuffer + recvByteTotal, remainingSize);
                else
                    recvByte = receiveData(mBuffer + recvByteTotal, remainingSize);
                recvByteTotal += recvByte;
                remainingSize -= recvByte;
                if (!remainingSize)
                    break;
            }
            if (remainingSize)
            {
                throw std::logic_error("Unexpected data size: missing " + std::to_string(remainingSize) + " bytes, expected a total of " + std::to_string(packetSize) + " bytes (incl. header).");
            }
            result = *((T *)mBuffer);
        }
        return result;
    }

    // paymentCsvString format
    //  ID,Amount\n (25)
    QutilResult qutilSendToManyV1(string paymentCsvString, const char *secretSeed, uint32_t pCurrentTick)
    {
        QutilResult result;
        memset(&result, 0, sizeof(QutilResult));

        long long fee = getSendToManyV1Fee();
        if (fee == -1)
            return result;

        std::vector<std::string> addresses;
        std::vector<int64_t> amounts;

        while (paymentCsvString.find("\n") != string::npos)
        {
            string line = paymentCsvString.substr(0, paymentCsvString.find("\n"));
            paymentCsvString = paymentCsvString.substr(paymentCsvString.find("\n") + 1);
            string address = line.substr(0, line.find(","));
            string amount = line.substr(line.find(",") + 1);

            if (address.size() == 60 && stoll(amount) > 0)
            {
                addresses.push_back(address);
                amounts.push_back(stoll(amount));
            }

            if (addresses.size() >= 25)
            {
                break;
            }
        }

        uint8_t sourcePublicKey[32] = {0};
        uint8_t privateKey[32] = {0};
        uint8_t subseed[32] = {0};
        uint8_t destPublicKey[32] = {0};
        uint8_t digest[32] = {0};
        uint8_t signature[64] = {0};
        char publicIdentity[128] = {0};
        char txHash[128] = {0};

        getSubseedFromSeed((uint8_t *)secretSeed, subseed);
        getPrivateKeyFromSubSeed(subseed, privateKey);
        getPublicKeyFromSeed(secretSeed, sourcePublicKey);
        const bool isLowerCase = false;
        getIdentityFromPublicKey(sourcePublicKey, publicIdentity, isLowerCase);

        ((uint64_t *)destPublicKey)[0] = QUTIL_CONTRACT_ID;
        ((uint64_t *)destPublicKey)[1] = 0;
        ((uint64_t *)destPublicKey)[2] = 0;
        ((uint64_t *)destPublicKey)[3] = 0;

        struct
        {
            RequestResponseHeader header;
            Transaction transaction;
            SendToManyV1_input stm;
            unsigned char signature[64];
        } packet;

        memset(&packet.stm, 0, sizeof(SendToManyV1_input));
        packet.transaction.amount = 0;

        for (int i = 0; i < std::min(25, int(addresses.size())); i++)
        {

            getPublicKeyFromIdentity((const unsigned char *)addresses[i].data(), packet.stm.addresses[i]);
            packet.stm.amounts[i] = amounts[i];
            packet.transaction.amount += amounts[i];
        }

        packet.transaction.amount += fee;
        memcpy(packet.transaction.sourcePublicKey, sourcePublicKey, 32);
        memcpy(packet.transaction.destinationPublicKey, destPublicKey, 32);
        uint32_t currentTick = pCurrentTick;
        packet.transaction.tick = currentTick + 10;
        packet.transaction.inputType = qutilProcedureId::SendToManyV1;
        packet.transaction.inputSize = sizeof(SendToManyV1_input);

        KangarooTwelve((unsigned char *)&packet.transaction,
                       sizeof(packet.transaction) + sizeof(SendToManyV1_input),
                       digest,
                       32);

        signData(secretSeed, (unsigned char *)&packet.transaction, sizeof(packet.transaction) + sizeof(SendToManyV1_input), signature);
        memcpy(packet.signature, signature, 64);
        packet.header.checkAndSetSize(sizeof(packet));
        packet.header.setDejavu(0);
        packet.header.setType(BROADCAST_TRANSACTION);
        bool sentOk = sendData((uint8_t *)&packet, packet.header.size());

        if (!sentOk)
        {
            return result;
        }

        KangarooTwelve((unsigned char *)&packet.transaction,
                       sizeof(packet.transaction) + sizeof(SendToManyV1_input) + SIGNATURE_SIZE,
                       digest,
                       32);
        getTxHashFromDigest(digest, txHash);

        result.tick = currentTick + 10;
        result.txHash = txHash;

        return result;
    }

    uint32_t getTickNumberFromNode()
    {
        CurrentSystemInfo csi = getSystemInfo();
        return csi.tick;
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

// 168 bytes
struct RawSolution
{
    RequestResponseHeader header;
    BroadcastMessage message;
    unsigned char solutionMiningSeed[32];
    unsigned char solutionNonce[32];
};

bool prepareSolutionDataNative(__m256i &computorPublicKey, unsigned char *nonce, unsigned char *randomSeed, const char *secretSeed, const char *indentity, const unsigned char *solution)
{
    RawSolution packet;

    packet.header.checkAndSetSize(sizeof(packet) + SIGNATURE_SIZE);
    packet.header.setDejavu(0);
    packet.header.setType(BroadcastMessage::type);

    uint8_t signingPublicKey[32] = {0};
    uint8_t privateKey[32] = {0};
    uint8_t subseed[32] = {0};

    getSubseedFromSeed((uint8_t *)secretSeed, subseed);
    getPrivateKeyFromSubSeed(subseed, privateKey);
    getPublicKeyFromIdentity((const unsigned char *)indentity, signingPublicKey);

    memcpy(packet.message.sourcePublicKey, signingPublicKey, sizeof(packet.message.sourcePublicKey));
    memcpy(packet.message.destinationPublicKey, &computorPublicKey, sizeof(packet.message.destinationPublicKey));

    unsigned char sharedKeyAndGammingNonce[64];
    memset(sharedKeyAndGammingNonce, 0, 32);

    // If provided seed is the for computor public key, generate sharedKey into first 32 bytes to encrypt message
    if (memcmp(&computorPublicKey, signingPublicKey, 32) == 0)
    {
        getSharedKey(privateKey, (const unsigned char *)&computorPublicKey, sharedKeyAndGammingNonce);
    }

    // Last 32 bytes of sharedKeyAndGammingNonce is randomly created so that gammingKey[0] = 0 (MESSAGE_TYPE_SOLUTION)
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

    memcpy((void *)solution, &packet, sizeof(packet));

    return true;
}
