{
    "description": "Knowledge base hybrid search with RRF",
    "phase_results_processors": [
        {
            "score-ranker-processor": {
                "combination": {
                    "technique": "rrf",
                    "rank_constant": 60,
                }
            }
        }
    ],
}