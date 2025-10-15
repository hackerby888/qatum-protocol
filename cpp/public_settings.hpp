#pragma once

////////// Public Settings \\\\\\\\\\

/// Overriding for qatum settings

#define MAX_NUMBER_OF_PROCESSORS 1
#define NUMBER_OF_SOLUTION_PROCESSORS 1
#define USE_SCORE_CACHE 0

#define NUMBER_OF_TRANSACTIONS_PER_TICK 1024 // Must be 2^N

static constexpr unsigned long long NUMBER_OF_INPUT_NEURONS = 512;  // K
static constexpr unsigned long long NUMBER_OF_OUTPUT_NEURONS = 512; // L
static constexpr unsigned long long NUMBER_OF_TICKS = 1000;          // N
static constexpr unsigned long long NUMBER_OF_NEIGHBORS = 728;      // 2M. Must be divided by 2
static constexpr unsigned long long NUMBER_OF_MUTATIONS = 150;
static constexpr unsigned long long POPULATION_THRESHOLD = NUMBER_OF_INPUT_NEURONS + NUMBER_OF_OUTPUT_NEURONS + NUMBER_OF_MUTATIONS; // P
static constexpr long long NEURON_VALUE_LIMIT = 1LL;
static constexpr unsigned int SOLUTION_THRESHOLD_DEFAULT = 321;
