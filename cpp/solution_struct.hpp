#pragma once
#include <iostream>
#include <vector>
#include <mutex>
#include <cstring>
#include <string>

using namespace std;
struct Solution
{
    char miningSeed[64];
    char nonce[64];
    char computorId[60];
    char md5Hash[32];

    Solution(const char *miningSeed, const char *nonce, const char *computorId, const char *md5Hash)
    {
        memcpy(this->miningSeed, miningSeed, 64);
        memcpy(this->nonce, nonce, 64);
        memcpy(this->computorId, computorId, 60);
        memcpy(this->md5Hash, md5Hash, 32);
    }
};

struct SolutionQueue
{
private:
    std::mutex mutex_;
    vector<Solution> solutions;

public:
    void addSolution(Solution solution)
    {
        std::lock_guard<std::mutex> lock(mutex_);
        solutions.push_back(solution);
    }

    Solution getSolution()
    {
        std::lock_guard<std::mutex> lock(mutex_);
        Solution solution = solutions.back();
        solutions.pop_back();
        return solution;
    }

    bool hasSolution()
    {
        std::lock_guard<std::mutex> lock(mutex_);
        return !solutions.empty();
    }

    void clear()
    {
        std::lock_guard<std::mutex> lock(mutex_);
        solutions.clear();
    }

    int size()
    {
        std::lock_guard<std::mutex> lock(mutex_);
        return solutions.size();
    }

    void print()
    {
        std::lock_guard<std::mutex> lock(mutex_);
        for (auto &solution : solutions)
        {
            cout << "Solution: " << solution.miningSeed << " " << solution.nonce << " " << solution.computorId << endl;
        }
    }
};
