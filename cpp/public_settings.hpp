#pragma once

////////// Public Settings \\\\\\\\\\

/// Overriding for qatum settings

#define MAX_NUMBER_OF_PROCESSORS 1
#define NUMBER_OF_SOLUTION_PROCESSORS 1
#define USE_SCORE_CACHE 0

#define NUMBER_OF_TRANSACTIONS_PER_TICK 1024 // Must be 2^N

#define DATA_LENGTH 256
#define NUMBER_OF_HIDDEN_NEURONS 3000
#define NUMBER_OF_NEIGHBOR_NEURONS 3000
#define MAX_DURATION 9000000
#define NUMBER_OF_OPTIMIZATION_STEPS 60
#define NEURON_VALUE_LIMIT 1LL
#define SOLUTION_THRESHOLD_DEFAULT 137