// Generated from C# ContractRules and ContractErrors; do not edit.
export const rules = {
  "schemaVersion": "0.2",
  "ruleEdition": "2026/27",
  "attemptDeadlineMs": 15000,
  "contextEvidenceIds": [
    "DECISION-ORIGINAL",
    "DECISION-REVIEW",
    "MATCH-SCORE-BEFORE",
    "MATCH-SCORE-AFTER"
  ],
  "eventKinds": [
    "PASS",
    "RECEIVER_TOUCH",
    "SHOT",
    "GOAL",
    "REVIEW_STARTED",
    "REVIEW_READY"
  ],
  "wordLimits": {
    "CASUAL": 90,
    "ANALYST": 220
  },
  "recapWordLimit": 40,
  "retryable": {
    "INVALID_REQUEST": false,
    "SCENARIO_NOT_FOUND": false,
    "CONTENT_VERSION_MISMATCH": false,
    "MODEL_NOT_CONFIGURED": false,
    "MODEL_UNAVAILABLE": true,
    "TIMEOUT": true,
    "INVALID_OUTPUT": true
  },
  "factExpectations": {
    "S1": [
      {
        "key": "PASS_TIME_OBSERVED",
        "value": {
          "__typename": "BooleanFactValue",
          "boolean": true
        },
        "status": "SUPPLIED"
      },
      {
        "key": "RECEIVER_IN_OPPONENTS_HALF",
        "value": {
          "__typename": "BooleanFactValue",
          "boolean": true
        },
        "status": "SUPPLIED"
      },
      {
        "key": "RECEIVER_AHEAD_OF_BALL",
        "value": {
          "__typename": "BooleanFactValue",
          "boolean": true
        },
        "status": "SUPPLIED"
      },
      {
        "key": "RECEIVER_VS_SECOND_LAST",
        "value": {
          "__typename": "PositionFactValue",
          "position": "NEARER"
        },
        "status": "SUPPLIED"
      },
      {
        "key": "ACTIVE_INVOLVEMENT",
        "value": {
          "__typename": "InvolvementFactValue",
          "involvement": "TOUCH"
        },
        "status": "SUPPLIED"
      },
      {
        "key": "PLAY_TYPE",
        "value": {
          "__typename": "PlayTypeFactValue",
          "playType": "OPEN_PLAY"
        },
        "status": "SUPPLIED"
      },
      {
        "key": "INTERVENING_OPPONENT_TOUCH",
        "value": {
          "__typename": "BooleanFactValue",
          "boolean": false
        },
        "status": "SUPPLIED"
      }
    ],
    "S2": [
      {
        "key": "PASS_TIME_OBSERVED",
        "value": {
          "__typename": "BooleanFactValue",
          "boolean": true
        },
        "status": "SUPPLIED"
      },
      {
        "key": "RECEIVER_IN_OPPONENTS_HALF",
        "value": {
          "__typename": "BooleanFactValue",
          "boolean": true
        },
        "status": "SUPPLIED"
      },
      {
        "key": "RECEIVER_AHEAD_OF_BALL",
        "value": {
          "__typename": "BooleanFactValue",
          "boolean": true
        },
        "status": "SUPPLIED"
      },
      {
        "key": "RECEIVER_VS_SECOND_LAST",
        "value": {
          "__typename": "PositionFactValue",
          "position": "LEVEL"
        },
        "status": "SUPPLIED"
      },
      {
        "key": "ACTIVE_INVOLVEMENT",
        "value": {
          "__typename": "InvolvementFactValue",
          "involvement": "TOUCH"
        },
        "status": "SUPPLIED"
      },
      {
        "key": "PLAY_TYPE",
        "value": {
          "__typename": "PlayTypeFactValue",
          "playType": "OPEN_PLAY"
        },
        "status": "SUPPLIED"
      },
      {
        "key": "INTERVENING_OPPONENT_TOUCH",
        "value": {
          "__typename": "BooleanFactValue",
          "boolean": false
        },
        "status": "SUPPLIED"
      }
    ],
    "S3": [
      {
        "key": "PASS_TIME_OBSERVED",
        "value": {
          "__typename": "BooleanFactValue",
          "boolean": false
        },
        "status": "SUPPLIED"
      },
      {
        "key": "RECEIVER_IN_OPPONENTS_HALF",
        "value": {
          "__typename": "BooleanFactValue",
          "boolean": true
        },
        "status": "SUPPLIED"
      },
      {
        "key": "RECEIVER_AHEAD_OF_BALL",
        "value": null,
        "status": "MISSING"
      },
      {
        "key": "RECEIVER_VS_SECOND_LAST",
        "value": null,
        "status": "MISSING"
      },
      {
        "key": "ACTIVE_INVOLVEMENT",
        "value": {
          "__typename": "InvolvementFactValue",
          "involvement": "TOUCH"
        },
        "status": "SUPPLIED"
      },
      {
        "key": "PLAY_TYPE",
        "value": {
          "__typename": "PlayTypeFactValue",
          "playType": "OPEN_PLAY"
        },
        "status": "SUPPLIED"
      },
      {
        "key": "INTERVENING_OPPONENT_TOUCH",
        "value": {
          "__typename": "BooleanFactValue",
          "boolean": false
        },
        "status": "SUPPLIED"
      }
    ]
  }
} as const
