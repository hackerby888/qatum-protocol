#pragma once

#include <cstdio>

// Acquire lock, may block
#define ACQUIRE(lock)

// Try to acquire lock and return if successful (without blocking)
#define TRY_ACQUIRE(lock)

// Release lock
#define RELEASE(lock)

#define PROFILE_SCOPE()

#define ASSERT(condition)

void logToConsole(const wchar_t *message)
{
    printf("%ls\n", message);
}

typedef short CHAR16;