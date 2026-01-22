#pragma once

////////// Public Settings \\\\\\\\\\

/// Overriding for qatum settings

#define MAX_NUMBER_OF_PROCESSORS 1
#define NUMBER_OF_SOLUTION_PROCESSORS 1
#define USE_SCORE_CACHE 0

#define NUMBER_OF_TRANSACTIONS_PER_TICK 1024 // Must be 2^N

static constexpr unsigned long long HYPERIDENTITY_NUMBER_OF_INPUT_NEURONS = 512;  // K
static constexpr unsigned long long HYPERIDENTITY_NUMBER_OF_OUTPUT_NEURONS = 512; // L
static constexpr unsigned long long HYPERIDENTITY_NUMBER_OF_TICKS = 1000;         // N
static constexpr unsigned long long HYPERIDENTITY_NUMBER_OF_NEIGHBORS = 728;      // 2M. Must be divided by 2
static constexpr unsigned long long HYPERIDENTITY_NUMBER_OF_MUTATIONS = 150;
static constexpr unsigned long long HYPERIDENTITY_POPULATION_THRESHOLD = HYPERIDENTITY_NUMBER_OF_INPUT_NEURONS + HYPERIDENTITY_NUMBER_OF_OUTPUT_NEURONS + HYPERIDENTITY_NUMBER_OF_MUTATIONS; // P
static constexpr unsigned int HYPERIDENTITY_SOLUTION_THRESHOLD_DEFAULT = 321;

static constexpr unsigned long long ADDITION_NUMBER_OF_INPUT_NEURONS = 14; // K
static constexpr unsigned long long ADDITION_NUMBER_OF_OUTPUT_NEURONS = 8; // L
static constexpr unsigned long long ADDITION_NUMBER_OF_TICKS = 1000;       // N
static constexpr unsigned long long ADDITION_NUMBER_OF_NEIGHBORS = 728;    // 2M. Must be divided by 2
static constexpr unsigned long long ADDITION_NUMBER_OF_MUTATIONS = 150;
static constexpr unsigned long long ADDITION_POPULATION_THRESHOLD = ADDITION_NUMBER_OF_INPUT_NEURONS + ADDITION_NUMBER_OF_OUTPUT_NEURONS + ADDITION_NUMBER_OF_MUTATIONS; // P
static constexpr unsigned int ADDITION_SOLUTION_THRESHOLD_DEFAULT = 74200;

static constexpr long long NEURON_VALUE_LIMIT = 1LL;