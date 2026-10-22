// Generated from shared fixtures through the in-memory GraphQL schema; never import into the app entry.
import type { ExplainMutation, ExplainMutationVariables, ScenarioQuery, ScenariosQuery } from '../../client/src/contracts/graphql.generated'

export const scenarioResponses = [
  {
    "data": {
      "scenario": {
        "__typename": "Scenario",
        "schemaVersion": "0.2",
        "contentVersion": "stub-0.2.0",
        "id": "S1",
        "synthetic": true,
        "label": "S1 - complete evidence (T02 test stub)",
        "match": {
          "homeTeam": "Cedar Test FC",
          "awayTeam": "Harbour Test FC",
          "incidentMinute": 67,
          "scoreBefore": {
            "home": 0,
            "away": 0
          }
        },
        "originalDecision": "GOAL_AWARDED",
        "suppliedReviewOutcome": "GOAL_DISALLOWED",
        "scoreAfterReview": {
          "home": 0,
          "away": 0
        },
        "interpretation": "OFFSIDE_SUPPORTED",
        "facts": [
          {
            "id": "F-PASS",
            "key": "PASS_TIME_OBSERVED",
            "status": "SUPPLIED",
            "sourceLabel": "Synthetic T02 authoring; not camera evidence",
            "value": {
              "__typename": "BooleanFactValue",
              "boolean": true
            }
          },
          {
            "id": "F-HALF",
            "key": "RECEIVER_IN_OPPONENTS_HALF",
            "status": "SUPPLIED",
            "sourceLabel": "Synthetic T02 authoring; not camera evidence",
            "value": {
              "__typename": "BooleanFactValue",
              "boolean": true
            }
          },
          {
            "id": "F-BALL",
            "key": "RECEIVER_AHEAD_OF_BALL",
            "status": "SUPPLIED",
            "sourceLabel": "Synthetic T02 authoring; not camera evidence",
            "value": {
              "__typename": "BooleanFactValue",
              "boolean": true
            }
          },
          {
            "id": "F-POSITION",
            "key": "RECEIVER_VS_SECOND_LAST",
            "status": "SUPPLIED",
            "sourceLabel": "Synthetic T02 authoring; not camera evidence",
            "value": {
              "__typename": "PositionFactValue",
              "position": "NEARER"
            }
          },
          {
            "id": "F-TOUCH",
            "key": "ACTIVE_INVOLVEMENT",
            "status": "SUPPLIED",
            "sourceLabel": "Synthetic T02 authoring; not camera evidence",
            "value": {
              "__typename": "InvolvementFactValue",
              "involvement": "TOUCH"
            }
          },
          {
            "id": "F-PLAY",
            "key": "PLAY_TYPE",
            "status": "SUPPLIED",
            "sourceLabel": "Synthetic T02 authoring; not camera evidence",
            "value": {
              "__typename": "PlayTypeFactValue",
              "playType": "OPEN_PLAY"
            }
          },
          {
            "id": "F-OPPONENT",
            "key": "INTERVENING_OPPONENT_TOUCH",
            "status": "SUPPLIED",
            "sourceLabel": "Synthetic T02 authoring; not camera evidence",
            "value": {
              "__typename": "BooleanFactValue",
              "boolean": false
            }
          }
        ],
        "rules": [
          {
            "id": "R-OFFSIDE",
            "title": "IFAB Law 11 - provisional fixture reference",
            "section": "11.1 and 11.2",
            "publisher": "IFAB",
            "url": "https://www.theifab.com/downloads/laws-of-the-game-202627-single-pages?l=en",
            "edition": "2026/27",
            "checkedOn": null,
            "reviewStatus": "DRAFT",
            "summary": "This draft fixture separates the supplied position at the pass from playing the pass. It is not a reviewed interpretation."
          }
        ],
        "events": [
          {
            "id": "E-PASS",
            "offsetMs": 0,
            "kind": "PASS",
            "label": "Synthetic pass; compressed demonstration timing",
            "revealFactIds": [
              "F-PASS",
              "F-HALF",
              "F-BALL",
              "F-POSITION",
              "F-PLAY",
              "F-OPPONENT"
            ]
          },
          {
            "id": "E-TOUCH",
            "offsetMs": 1000,
            "kind": "RECEIVER_TOUCH",
            "label": "Synthetic receiver touch",
            "revealFactIds": [
              "F-TOUCH"
            ]
          },
          {
            "id": "E-SHOT",
            "offsetMs": 2000,
            "kind": "SHOT",
            "label": "Synthetic shot",
            "revealFactIds": []
          },
          {
            "id": "E-GOAL",
            "offsetMs": 3000,
            "kind": "GOAL",
            "label": "Synthetic original goal award",
            "revealFactIds": []
          },
          {
            "id": "E-REVIEW",
            "offsetMs": 4000,
            "kind": "REVIEW_STARTED",
            "label": "Synthetic review begins",
            "revealFactIds": []
          },
          {
            "id": "E-READY",
            "offsetMs": 5000,
            "kind": "REVIEW_READY",
            "label": "Prototype evidence pack ready, not an official review",
            "revealFactIds": []
          }
        ],
        "diagram": {
          "status": "ILLUSTRATIVE",
          "direction": "LEFT_TO_RIGHT",
          "markers": [
            {
              "id": "M-PASSER",
              "role": "PASSER",
              "label": "Illustrative passer",
              "x": 40,
              "y": 50
            },
            {
              "id": "M-BALL",
              "role": "BALL",
              "label": "Illustrative ball",
              "x": 42,
              "y": 50
            },
            {
              "id": "M-RECEIVER",
              "role": "RECEIVER",
              "label": "Illustrative receiver",
              "x": 75,
              "y": 45
            },
            {
              "id": "M-OPPONENT",
              "role": "OPPONENT",
              "label": "Illustrative second-last opponent",
              "x": 70,
              "y": 60
            }
          ],
          "secondLastReferenceX": 70,
          "textAlternative": "Illustrative markers only; positions are not measurements."
        },
        "comparison": {
          "pairId": "PAIR-01",
          "otherScenarioId": "S2",
          "changedFactKey": "RECEIVER_VS_SECOND_LAST"
        },
        "authoredExplanations": {
          "casual": {
            "sourceMode": "AUTHORED",
            "status": "COMPLETE",
            "interpretation": "OFFSIDE_SUPPORTED",
            "headline": {
              "id": "C-HEAD",
              "text": "The supplied facts support offside in this synthetic example.",
              "evidenceIds": [
                "F-POSITION",
                "F-BALL",
                "F-HALF",
                "F-TOUCH"
              ],
              "ruleIds": [
                "R-OFFSIDE"
              ]
            },
            "points": [
              {
                "id": "C-POINT",
                "text": "The receiver is supplied as nearer the goal line than the second-last opponent and then plays the pass.",
                "evidenceIds": [
                  "F-POSITION",
                  "F-TOUCH"
                ],
                "ruleIds": [
                  "R-OFFSIDE"
                ]
              }
            ],
            "limitations": [
              "Synthetic authored T02 test stub, not referee evidence.",
              "Rule interpretation is draft; source and expert review have not been performed."
            ],
            "recap": {
              "id": "C-RECAP",
              "text": "The supplied review disallows the goal; the illustrative score stays 0-0.",
              "evidenceIds": [
                "DECISION-REVIEW",
                "MATCH-SCORE-AFTER"
              ],
              "ruleIds": []
            }
          },
          "analyst": {
            "sourceMode": "AUTHORED",
            "status": "COMPLETE",
            "interpretation": "OFFSIDE_SUPPORTED",
            "headline": {
              "id": "A-HEAD",
              "text": "The authored interpretation supports offside from the supplied position and involvement.",
              "evidenceIds": [
                "F-POSITION",
                "F-BALL",
                "F-HALF",
                "F-TOUCH"
              ],
              "ruleIds": [
                "R-OFFSIDE"
              ]
            },
            "points": [
              {
                "id": "A-POINT",
                "text": "The supplied pass-time observation places the receiver in the opponents\u0027 half, ahead of the ball and nearer the goal line than the second-last opponent. Playing the pass is a separate supplied involvement fact.",
                "evidenceIds": [
                  "F-PASS",
                  "F-HALF",
                  "F-BALL",
                  "F-POSITION",
                  "F-TOUCH"
                ],
                "ruleIds": [
                  "R-OFFSIDE"
                ]
              }
            ],
            "limitations": [
              "Synthetic authored T02 test stub, not referee evidence.",
              "Rule interpretation is draft; source and expert review have not been performed."
            ],
            "recap": {
              "id": "A-RECAP",
              "text": "The original goal award and supplied disallowance are distinct; the illustrative score remains 0-0.",
              "evidenceIds": [
                "DECISION-ORIGINAL",
                "DECISION-REVIEW",
                "MATCH-SCORE-AFTER"
              ],
              "ruleIds": []
            }
          }
        }
      }
    }
  },
  {
    "data": {
      "scenario": {
        "__typename": "Scenario",
        "schemaVersion": "0.2",
        "contentVersion": "stub-0.2.0",
        "id": "S2",
        "synthetic": true,
        "label": "S2 - changed position (T02 test stub)",
        "match": {
          "homeTeam": "Cedar Test FC",
          "awayTeam": "Harbour Test FC",
          "incidentMinute": 67,
          "scoreBefore": {
            "home": 0,
            "away": 0
          }
        },
        "originalDecision": "GOAL_AWARDED",
        "suppliedReviewOutcome": "GOAL_CONFIRMED",
        "scoreAfterReview": {
          "home": 1,
          "away": 0
        },
        "interpretation": "NO_OFFSIDE_SUPPORTED",
        "facts": [
          {
            "id": "F-PASS",
            "key": "PASS_TIME_OBSERVED",
            "status": "SUPPLIED",
            "sourceLabel": "Synthetic T02 authoring; not camera evidence",
            "value": {
              "__typename": "BooleanFactValue",
              "boolean": true
            }
          },
          {
            "id": "F-HALF",
            "key": "RECEIVER_IN_OPPONENTS_HALF",
            "status": "SUPPLIED",
            "sourceLabel": "Synthetic T02 authoring; not camera evidence",
            "value": {
              "__typename": "BooleanFactValue",
              "boolean": true
            }
          },
          {
            "id": "F-BALL",
            "key": "RECEIVER_AHEAD_OF_BALL",
            "status": "SUPPLIED",
            "sourceLabel": "Synthetic T02 authoring; not camera evidence",
            "value": {
              "__typename": "BooleanFactValue",
              "boolean": true
            }
          },
          {
            "id": "F-POSITION",
            "key": "RECEIVER_VS_SECOND_LAST",
            "status": "SUPPLIED",
            "sourceLabel": "Synthetic T02 authoring; not camera evidence",
            "value": {
              "__typename": "PositionFactValue",
              "position": "LEVEL"
            }
          },
          {
            "id": "F-TOUCH",
            "key": "ACTIVE_INVOLVEMENT",
            "status": "SUPPLIED",
            "sourceLabel": "Synthetic T02 authoring; not camera evidence",
            "value": {
              "__typename": "InvolvementFactValue",
              "involvement": "TOUCH"
            }
          },
          {
            "id": "F-PLAY",
            "key": "PLAY_TYPE",
            "status": "SUPPLIED",
            "sourceLabel": "Synthetic T02 authoring; not camera evidence",
            "value": {
              "__typename": "PlayTypeFactValue",
              "playType": "OPEN_PLAY"
            }
          },
          {
            "id": "F-OPPONENT",
            "key": "INTERVENING_OPPONENT_TOUCH",
            "status": "SUPPLIED",
            "sourceLabel": "Synthetic T02 authoring; not camera evidence",
            "value": {
              "__typename": "BooleanFactValue",
              "boolean": false
            }
          }
        ],
        "rules": [
          {
            "id": "R-OFFSIDE",
            "title": "IFAB Law 11 - provisional fixture reference",
            "section": "11.1 and 11.2",
            "publisher": "IFAB",
            "url": "https://www.theifab.com/downloads/laws-of-the-game-202627-single-pages?l=en",
            "edition": "2026/27",
            "checkedOn": null,
            "reviewStatus": "DRAFT",
            "summary": "This draft fixture separates the supplied position at the pass from playing the pass. It is not a reviewed interpretation."
          }
        ],
        "events": [
          {
            "id": "E-PASS",
            "offsetMs": 0,
            "kind": "PASS",
            "label": "Synthetic pass; compressed demonstration timing",
            "revealFactIds": [
              "F-PASS",
              "F-HALF",
              "F-BALL",
              "F-POSITION",
              "F-PLAY",
              "F-OPPONENT"
            ]
          },
          {
            "id": "E-TOUCH",
            "offsetMs": 1000,
            "kind": "RECEIVER_TOUCH",
            "label": "Synthetic receiver touch",
            "revealFactIds": [
              "F-TOUCH"
            ]
          },
          {
            "id": "E-SHOT",
            "offsetMs": 2000,
            "kind": "SHOT",
            "label": "Synthetic shot",
            "revealFactIds": []
          },
          {
            "id": "E-GOAL",
            "offsetMs": 3000,
            "kind": "GOAL",
            "label": "Synthetic original goal award",
            "revealFactIds": []
          },
          {
            "id": "E-REVIEW",
            "offsetMs": 4000,
            "kind": "REVIEW_STARTED",
            "label": "Synthetic review begins",
            "revealFactIds": []
          },
          {
            "id": "E-READY",
            "offsetMs": 5000,
            "kind": "REVIEW_READY",
            "label": "Prototype evidence pack ready, not an official review",
            "revealFactIds": []
          }
        ],
        "diagram": {
          "status": "ILLUSTRATIVE",
          "direction": "LEFT_TO_RIGHT",
          "markers": [
            {
              "id": "M-PASSER",
              "role": "PASSER",
              "label": "Illustrative passer",
              "x": 40,
              "y": 50
            },
            {
              "id": "M-BALL",
              "role": "BALL",
              "label": "Illustrative ball",
              "x": 42,
              "y": 50
            },
            {
              "id": "M-RECEIVER",
              "role": "RECEIVER",
              "label": "Illustrative receiver",
              "x": 70,
              "y": 45
            },
            {
              "id": "M-OPPONENT",
              "role": "OPPONENT",
              "label": "Illustrative second-last opponent",
              "x": 70,
              "y": 60
            }
          ],
          "secondLastReferenceX": 70,
          "textAlternative": "Illustrative markers only; positions are not measurements."
        },
        "comparison": {
          "pairId": "PAIR-01",
          "otherScenarioId": "S1",
          "changedFactKey": "RECEIVER_VS_SECOND_LAST"
        },
        "authoredExplanations": {
          "casual": {
            "sourceMode": "AUTHORED",
            "status": "COMPLETE",
            "interpretation": "NO_OFFSIDE_SUPPORTED",
            "headline": {
              "id": "C-HEAD",
              "text": "The supplied level position supports no offside in this synthetic example.",
              "evidenceIds": [
                "F-POSITION"
              ],
              "ruleIds": [
                "R-OFFSIDE"
              ]
            },
            "points": [
              {
                "id": "C-POINT",
                "text": "Only the receiver\u0027s relation to the second-last opponent changes from S1. The outcome is a supplied consequence, not a model decision.",
                "evidenceIds": [
                  "F-POSITION",
                  "DECISION-REVIEW"
                ],
                "ruleIds": [
                  "R-OFFSIDE"
                ]
              }
            ],
            "limitations": [
              "Synthetic authored T02 test stub, not referee evidence.",
              "Rule interpretation is draft; source and expert review have not been performed."
            ],
            "recap": {
              "id": "C-RECAP",
              "text": "The supplied review confirms the goal; the illustrative score becomes 1-0.",
              "evidenceIds": [
                "DECISION-REVIEW",
                "MATCH-SCORE-AFTER"
              ],
              "ruleIds": []
            }
          },
          "analyst": {
            "sourceMode": "AUTHORED",
            "status": "COMPLETE",
            "interpretation": "NO_OFFSIDE_SUPPORTED",
            "headline": {
              "id": "A-HEAD",
              "text": "A supplied level position changes the authored interpretation, not the involvement fact.",
              "evidenceIds": [
                "F-POSITION",
                "F-TOUCH"
              ],
              "ruleIds": [
                "R-OFFSIDE"
              ]
            },
            "points": [
              {
                "id": "A-POINT",
                "text": "The receiver still plays the pass. In this bounded fixture the receiver is level with the second-last opponent, rather than nearer the goal line. The demonstration does not measure either position from its illustrative diagram.",
                "evidenceIds": [
                  "F-POSITION",
                  "F-TOUCH"
                ],
                "ruleIds": [
                  "R-OFFSIDE"
                ]
              }
            ],
            "limitations": [
              "Synthetic authored T02 test stub, not referee evidence.",
              "Rule interpretation is draft; source and expert review have not been performed."
            ],
            "recap": {
              "id": "A-RECAP",
              "text": "The supplied confirmation leaves the originally awarded goal standing; the illustrative score changes from 0-0 to 1-0.",
              "evidenceIds": [
                "DECISION-ORIGINAL",
                "DECISION-REVIEW",
                "MATCH-SCORE-BEFORE",
                "MATCH-SCORE-AFTER"
              ],
              "ruleIds": []
            }
          }
        }
      }
    }
  },
  {
    "data": {
      "scenario": {
        "__typename": "Scenario",
        "schemaVersion": "0.2",
        "contentVersion": "stub-0.2.0",
        "id": "S3",
        "synthetic": true,
        "label": "S3 - missing snapshot (T02 test stub)",
        "match": {
          "homeTeam": "Cedar Test FC",
          "awayTeam": "Harbour Test FC",
          "incidentMinute": 67,
          "scoreBefore": {
            "home": 0,
            "away": 0
          }
        },
        "originalDecision": "GOAL_AWARDED",
        "suppliedReviewOutcome": null,
        "scoreAfterReview": null,
        "interpretation": "INSUFFICIENT_EVIDENCE",
        "facts": [
          {
            "id": "F-PASS",
            "key": "PASS_TIME_OBSERVED",
            "status": "SUPPLIED",
            "sourceLabel": "Synthetic T02 authoring; observation is explicitly absent",
            "value": {
              "__typename": "BooleanFactValue",
              "boolean": false
            }
          },
          {
            "id": "F-HALF",
            "key": "RECEIVER_IN_OPPONENTS_HALF",
            "status": "SUPPLIED",
            "sourceLabel": "Synthetic T02 authoring; not camera evidence",
            "value": {
              "__typename": "BooleanFactValue",
              "boolean": true
            }
          },
          {
            "id": "F-BALL",
            "key": "RECEIVER_AHEAD_OF_BALL",
            "status": "MISSING",
            "sourceLabel": "Synthetic T02 authoring; pass-time position is unavailable",
            "value": null
          },
          {
            "id": "F-POSITION",
            "key": "RECEIVER_VS_SECOND_LAST",
            "status": "MISSING",
            "sourceLabel": "Synthetic T02 authoring; pass-time position is unavailable",
            "value": null
          },
          {
            "id": "F-TOUCH",
            "key": "ACTIVE_INVOLVEMENT",
            "status": "SUPPLIED",
            "sourceLabel": "Synthetic T02 authoring; not camera evidence",
            "value": {
              "__typename": "InvolvementFactValue",
              "involvement": "TOUCH"
            }
          },
          {
            "id": "F-PLAY",
            "key": "PLAY_TYPE",
            "status": "SUPPLIED",
            "sourceLabel": "Synthetic T02 authoring; not camera evidence",
            "value": {
              "__typename": "PlayTypeFactValue",
              "playType": "OPEN_PLAY"
            }
          },
          {
            "id": "F-OPPONENT",
            "key": "INTERVENING_OPPONENT_TOUCH",
            "status": "SUPPLIED",
            "sourceLabel": "Synthetic T02 authoring; not camera evidence",
            "value": {
              "__typename": "BooleanFactValue",
              "boolean": false
            }
          }
        ],
        "rules": [
          {
            "id": "R-OFFSIDE",
            "title": "IFAB Law 11 - provisional fixture reference",
            "section": "11.1 and 11.2",
            "publisher": "IFAB",
            "url": "https://www.theifab.com/downloads/laws-of-the-game-202627-single-pages?l=en",
            "edition": "2026/27",
            "checkedOn": null,
            "reviewStatus": "DRAFT",
            "summary": "This draft fixture separates the supplied position at the pass from playing the pass. It is not a reviewed interpretation."
          }
        ],
        "events": [
          {
            "id": "E-PASS",
            "offsetMs": 0,
            "kind": "PASS",
            "label": "Synthetic pass event; pass-time observation unavailable",
            "revealFactIds": [
              "F-PASS",
              "F-HALF",
              "F-BALL",
              "F-POSITION",
              "F-PLAY",
              "F-OPPONENT"
            ]
          },
          {
            "id": "E-TOUCH",
            "offsetMs": 1000,
            "kind": "RECEIVER_TOUCH",
            "label": "Synthetic receiver touch",
            "revealFactIds": [
              "F-TOUCH"
            ]
          },
          {
            "id": "E-SHOT",
            "offsetMs": 2000,
            "kind": "SHOT",
            "label": "Synthetic shot",
            "revealFactIds": []
          },
          {
            "id": "E-GOAL",
            "offsetMs": 3000,
            "kind": "GOAL",
            "label": "Synthetic original goal award",
            "revealFactIds": []
          },
          {
            "id": "E-REVIEW",
            "offsetMs": 4000,
            "kind": "REVIEW_STARTED",
            "label": "Synthetic review begins",
            "revealFactIds": []
          },
          {
            "id": "E-READY",
            "offsetMs": 5000,
            "kind": "REVIEW_READY",
            "label": "Incomplete prototype evidence pack ready, not an official review",
            "revealFactIds": []
          }
        ],
        "diagram": {
          "status": "UNAVAILABLE",
          "direction": "LEFT_TO_RIGHT",
          "markers": [],
          "secondLastReferenceX": null,
          "textAlternative": "Pass-time snapshot unavailable. No player positions are inferred."
        },
        "comparison": null,
        "authoredExplanations": {
          "casual": {
            "sourceMode": "AUTHORED",
            "status": "LIMITED",
            "interpretation": "INSUFFICIENT_EVIDENCE",
            "headline": {
              "id": "C-HEAD",
              "text": "The supplied evidence is insufficient for an offside interpretation.",
              "evidenceIds": [
                "F-PASS",
                "F-BALL",
                "F-POSITION"
              ],
              "ruleIds": [
                "R-OFFSIDE"
              ]
            },
            "points": [
              {
                "id": "C-POINT",
                "text": "The original goal award is supplied, but the pass-time positions and review outcome are unavailable.",
                "evidenceIds": [
                  "DECISION-ORIGINAL",
                  "F-BALL",
                  "F-POSITION",
                  "DECISION-REVIEW"
                ],
                "ruleIds": []
              }
            ],
            "limitations": [
              "Synthetic authored T02 test stub, not referee evidence.",
              "Rule interpretation is draft; source and expert review have not been performed.",
              "Missing decisive position evidence cannot establish confirmation or disallowance."
            ],
            "recap": {
              "id": "C-RECAP",
              "text": "The original goal was awarded. The review outcome and after-review score are unknown.",
              "evidenceIds": [
                "DECISION-ORIGINAL",
                "DECISION-REVIEW",
                "MATCH-SCORE-AFTER"
              ],
              "ruleIds": []
            }
          },
          "analyst": {
            "sourceMode": "AUTHORED",
            "status": "LIMITED",
            "interpretation": "INSUFFICIENT_EVIDENCE",
            "headline": {
              "id": "A-HEAD",
              "text": "Missing pass-time positional relations prevent a supported offside interpretation.",
              "evidenceIds": [
                "F-PASS",
                "F-BALL",
                "F-POSITION"
              ],
              "ruleIds": [
                "R-OFFSIDE"
              ]
            },
            "points": [
              {
                "id": "A-POINT",
                "text": "The receiver\u0027s involvement is supplied separately. That fact cannot reconstruct the missing relation to the ball or second-last opponent. An absent observation is not an observed onside position.",
                "evidenceIds": [
                  "F-TOUCH",
                  "F-PASS",
                  "F-BALL",
                  "F-POSITION"
                ],
                "ruleIds": [
                  "R-OFFSIDE"
                ]
              }
            ],
            "limitations": [
              "Synthetic authored T02 test stub, not referee evidence.",
              "Rule interpretation is draft; source and expert review have not been performed.",
              "Missing decisive position evidence cannot establish confirmation or disallowance."
            ],
            "recap": {
              "id": "A-RECAP",
              "text": "The supplied original goal award is known; neither a review verdict nor an after-review score is supplied.",
              "evidenceIds": [
                "DECISION-ORIGINAL",
                "DECISION-REVIEW",
                "MATCH-SCORE-AFTER"
              ],
              "ruleIds": []
            }
          }
        }
      }
    }
  }
] satisfies ReadonlyArray<{ readonly data: ScenarioQuery }>

export const summaryResponse = {
  "data": {
    "scenarios": [
      {
        "id": "S1",
        "contentVersion": "stub-0.2.0",
        "synthetic": true,
        "label": "S1 - complete evidence (T02 test stub)"
      },
      {
        "id": "S2",
        "contentVersion": "stub-0.2.0",
        "synthetic": true,
        "label": "S2 - changed position (T02 test stub)"
      },
      {
        "id": "S3",
        "contentVersion": "stub-0.2.0",
        "synthetic": true,
        "label": "S3 - missing snapshot (T02 test stub)"
      }
    ]
  }
} satisfies { readonly data: ScenariosQuery }

export const explanationCases = [
  {
    "request": {
      "schemaVersion": "0.2",
      "requestId": "stub-S1-Casual-Authored",
      "scenarioId": "S1",
      "contentVersion": "stub-0.2.0",
      "audience": "CASUAL",
      "sourceMode": "AUTHORED"
    },
    "response": {
      "data": {
        "explain": {
          "__typename": "ExplanationSuccess",
          "schemaVersion": "0.2",
          "requestId": "stub-S1-Casual-Authored",
          "scenarioId": "S1",
          "contentVersion": "stub-0.2.0",
          "audience": "CASUAL",
          "sourceMode": "AUTHORED",
          "status": "COMPLETE",
          "interpretation": "OFFSIDE_SUPPORTED",
          "headline": {
            "id": "C-HEAD",
            "text": "The supplied facts support offside in this synthetic example.",
            "evidenceIds": [
              "F-POSITION",
              "F-BALL",
              "F-HALF",
              "F-TOUCH"
            ],
            "ruleIds": [
              "R-OFFSIDE"
            ]
          },
          "points": [
            {
              "id": "C-POINT",
              "text": "The receiver is supplied as nearer the goal line than the second-last opponent and then plays the pass.",
              "evidenceIds": [
                "F-POSITION",
                "F-TOUCH"
              ],
              "ruleIds": [
                "R-OFFSIDE"
              ]
            }
          ],
          "limitations": [
            "Synthetic authored T02 test stub, not referee evidence.",
            "Rule interpretation is draft; source and expert review have not been performed."
          ],
          "recap": {
            "id": "C-RECAP",
            "text": "The supplied review disallows the goal; the illustrative score stays 0-0.",
            "evidenceIds": [
              "DECISION-REVIEW",
              "MATCH-SCORE-AFTER"
            ],
            "ruleIds": []
          }
        }
      }
    }
  },
  {
    "request": {
      "schemaVersion": "0.2",
      "requestId": "stub-S1-Casual-LiveAi",
      "scenarioId": "S1",
      "contentVersion": "stub-0.2.0",
      "audience": "CASUAL",
      "sourceMode": "LIVE_AI"
    },
    "response": {
      "data": {
        "explain": {
          "__typename": "ExplanationSuccess",
          "schemaVersion": "0.2",
          "requestId": "stub-S1-Casual-LiveAi",
          "scenarioId": "S1",
          "contentVersion": "stub-0.2.0",
          "audience": "CASUAL",
          "sourceMode": "LIVE_AI",
          "status": "COMPLETE",
          "interpretation": "OFFSIDE_SUPPORTED",
          "headline": {
            "id": "C-HEAD",
            "text": "The supplied facts support offside in this synthetic example.",
            "evidenceIds": [
              "F-POSITION",
              "F-BALL",
              "F-HALF",
              "F-TOUCH"
            ],
            "ruleIds": [
              "R-OFFSIDE"
            ]
          },
          "points": [
            {
              "id": "C-POINT",
              "text": "The receiver is supplied as nearer the goal line than the second-last opponent and then plays the pass.",
              "evidenceIds": [
                "F-POSITION",
                "F-TOUCH"
              ],
              "ruleIds": [
                "R-OFFSIDE"
              ]
            }
          ],
          "limitations": [
            "Synthetic authored T02 test stub, not referee evidence.",
            "Rule interpretation is draft; source and expert review have not been performed.",
            "SIMULATED LIVE-AI TEST STUB: no model was called; this is authored fixture content."
          ],
          "recap": {
            "id": "C-RECAP",
            "text": "The supplied review disallows the goal; the illustrative score stays 0-0.",
            "evidenceIds": [
              "DECISION-REVIEW",
              "MATCH-SCORE-AFTER"
            ],
            "ruleIds": []
          }
        }
      }
    }
  },
  {
    "request": {
      "schemaVersion": "0.2",
      "requestId": "stub-S1-Analyst-Authored",
      "scenarioId": "S1",
      "contentVersion": "stub-0.2.0",
      "audience": "ANALYST",
      "sourceMode": "AUTHORED"
    },
    "response": {
      "data": {
        "explain": {
          "__typename": "ExplanationSuccess",
          "schemaVersion": "0.2",
          "requestId": "stub-S1-Analyst-Authored",
          "scenarioId": "S1",
          "contentVersion": "stub-0.2.0",
          "audience": "ANALYST",
          "sourceMode": "AUTHORED",
          "status": "COMPLETE",
          "interpretation": "OFFSIDE_SUPPORTED",
          "headline": {
            "id": "A-HEAD",
            "text": "The authored interpretation supports offside from the supplied position and involvement.",
            "evidenceIds": [
              "F-POSITION",
              "F-BALL",
              "F-HALF",
              "F-TOUCH"
            ],
            "ruleIds": [
              "R-OFFSIDE"
            ]
          },
          "points": [
            {
              "id": "A-POINT",
              "text": "The supplied pass-time observation places the receiver in the opponents\u0027 half, ahead of the ball and nearer the goal line than the second-last opponent. Playing the pass is a separate supplied involvement fact.",
              "evidenceIds": [
                "F-PASS",
                "F-HALF",
                "F-BALL",
                "F-POSITION",
                "F-TOUCH"
              ],
              "ruleIds": [
                "R-OFFSIDE"
              ]
            }
          ],
          "limitations": [
            "Synthetic authored T02 test stub, not referee evidence.",
            "Rule interpretation is draft; source and expert review have not been performed."
          ],
          "recap": {
            "id": "A-RECAP",
            "text": "The original goal award and supplied disallowance are distinct; the illustrative score remains 0-0.",
            "evidenceIds": [
              "DECISION-ORIGINAL",
              "DECISION-REVIEW",
              "MATCH-SCORE-AFTER"
            ],
            "ruleIds": []
          }
        }
      }
    }
  },
  {
    "request": {
      "schemaVersion": "0.2",
      "requestId": "stub-S1-Analyst-LiveAi",
      "scenarioId": "S1",
      "contentVersion": "stub-0.2.0",
      "audience": "ANALYST",
      "sourceMode": "LIVE_AI"
    },
    "response": {
      "data": {
        "explain": {
          "__typename": "ExplanationSuccess",
          "schemaVersion": "0.2",
          "requestId": "stub-S1-Analyst-LiveAi",
          "scenarioId": "S1",
          "contentVersion": "stub-0.2.0",
          "audience": "ANALYST",
          "sourceMode": "LIVE_AI",
          "status": "COMPLETE",
          "interpretation": "OFFSIDE_SUPPORTED",
          "headline": {
            "id": "A-HEAD",
            "text": "The authored interpretation supports offside from the supplied position and involvement.",
            "evidenceIds": [
              "F-POSITION",
              "F-BALL",
              "F-HALF",
              "F-TOUCH"
            ],
            "ruleIds": [
              "R-OFFSIDE"
            ]
          },
          "points": [
            {
              "id": "A-POINT",
              "text": "The supplied pass-time observation places the receiver in the opponents\u0027 half, ahead of the ball and nearer the goal line than the second-last opponent. Playing the pass is a separate supplied involvement fact.",
              "evidenceIds": [
                "F-PASS",
                "F-HALF",
                "F-BALL",
                "F-POSITION",
                "F-TOUCH"
              ],
              "ruleIds": [
                "R-OFFSIDE"
              ]
            }
          ],
          "limitations": [
            "Synthetic authored T02 test stub, not referee evidence.",
            "Rule interpretation is draft; source and expert review have not been performed.",
            "SIMULATED LIVE-AI TEST STUB: no model was called; this is authored fixture content."
          ],
          "recap": {
            "id": "A-RECAP",
            "text": "The original goal award and supplied disallowance are distinct; the illustrative score remains 0-0.",
            "evidenceIds": [
              "DECISION-ORIGINAL",
              "DECISION-REVIEW",
              "MATCH-SCORE-AFTER"
            ],
            "ruleIds": []
          }
        }
      }
    }
  },
  {
    "request": {
      "schemaVersion": "0.2",
      "requestId": "stub-S2-Casual-Authored",
      "scenarioId": "S2",
      "contentVersion": "stub-0.2.0",
      "audience": "CASUAL",
      "sourceMode": "AUTHORED"
    },
    "response": {
      "data": {
        "explain": {
          "__typename": "ExplanationSuccess",
          "schemaVersion": "0.2",
          "requestId": "stub-S2-Casual-Authored",
          "scenarioId": "S2",
          "contentVersion": "stub-0.2.0",
          "audience": "CASUAL",
          "sourceMode": "AUTHORED",
          "status": "COMPLETE",
          "interpretation": "NO_OFFSIDE_SUPPORTED",
          "headline": {
            "id": "C-HEAD",
            "text": "The supplied level position supports no offside in this synthetic example.",
            "evidenceIds": [
              "F-POSITION"
            ],
            "ruleIds": [
              "R-OFFSIDE"
            ]
          },
          "points": [
            {
              "id": "C-POINT",
              "text": "Only the receiver\u0027s relation to the second-last opponent changes from S1. The outcome is a supplied consequence, not a model decision.",
              "evidenceIds": [
                "F-POSITION",
                "DECISION-REVIEW"
              ],
              "ruleIds": [
                "R-OFFSIDE"
              ]
            }
          ],
          "limitations": [
            "Synthetic authored T02 test stub, not referee evidence.",
            "Rule interpretation is draft; source and expert review have not been performed."
          ],
          "recap": {
            "id": "C-RECAP",
            "text": "The supplied review confirms the goal; the illustrative score becomes 1-0.",
            "evidenceIds": [
              "DECISION-REVIEW",
              "MATCH-SCORE-AFTER"
            ],
            "ruleIds": []
          }
        }
      }
    }
  },
  {
    "request": {
      "schemaVersion": "0.2",
      "requestId": "stub-S2-Casual-LiveAi",
      "scenarioId": "S2",
      "contentVersion": "stub-0.2.0",
      "audience": "CASUAL",
      "sourceMode": "LIVE_AI"
    },
    "response": {
      "data": {
        "explain": {
          "__typename": "ExplanationSuccess",
          "schemaVersion": "0.2",
          "requestId": "stub-S2-Casual-LiveAi",
          "scenarioId": "S2",
          "contentVersion": "stub-0.2.0",
          "audience": "CASUAL",
          "sourceMode": "LIVE_AI",
          "status": "COMPLETE",
          "interpretation": "NO_OFFSIDE_SUPPORTED",
          "headline": {
            "id": "C-HEAD",
            "text": "The supplied level position supports no offside in this synthetic example.",
            "evidenceIds": [
              "F-POSITION"
            ],
            "ruleIds": [
              "R-OFFSIDE"
            ]
          },
          "points": [
            {
              "id": "C-POINT",
              "text": "Only the receiver\u0027s relation to the second-last opponent changes from S1. The outcome is a supplied consequence, not a model decision.",
              "evidenceIds": [
                "F-POSITION",
                "DECISION-REVIEW"
              ],
              "ruleIds": [
                "R-OFFSIDE"
              ]
            }
          ],
          "limitations": [
            "Synthetic authored T02 test stub, not referee evidence.",
            "Rule interpretation is draft; source and expert review have not been performed.",
            "SIMULATED LIVE-AI TEST STUB: no model was called; this is authored fixture content."
          ],
          "recap": {
            "id": "C-RECAP",
            "text": "The supplied review confirms the goal; the illustrative score becomes 1-0.",
            "evidenceIds": [
              "DECISION-REVIEW",
              "MATCH-SCORE-AFTER"
            ],
            "ruleIds": []
          }
        }
      }
    }
  },
  {
    "request": {
      "schemaVersion": "0.2",
      "requestId": "stub-S2-Analyst-Authored",
      "scenarioId": "S2",
      "contentVersion": "stub-0.2.0",
      "audience": "ANALYST",
      "sourceMode": "AUTHORED"
    },
    "response": {
      "data": {
        "explain": {
          "__typename": "ExplanationSuccess",
          "schemaVersion": "0.2",
          "requestId": "stub-S2-Analyst-Authored",
          "scenarioId": "S2",
          "contentVersion": "stub-0.2.0",
          "audience": "ANALYST",
          "sourceMode": "AUTHORED",
          "status": "COMPLETE",
          "interpretation": "NO_OFFSIDE_SUPPORTED",
          "headline": {
            "id": "A-HEAD",
            "text": "A supplied level position changes the authored interpretation, not the involvement fact.",
            "evidenceIds": [
              "F-POSITION",
              "F-TOUCH"
            ],
            "ruleIds": [
              "R-OFFSIDE"
            ]
          },
          "points": [
            {
              "id": "A-POINT",
              "text": "The receiver still plays the pass. In this bounded fixture the receiver is level with the second-last opponent, rather than nearer the goal line. The demonstration does not measure either position from its illustrative diagram.",
              "evidenceIds": [
                "F-POSITION",
                "F-TOUCH"
              ],
              "ruleIds": [
                "R-OFFSIDE"
              ]
            }
          ],
          "limitations": [
            "Synthetic authored T02 test stub, not referee evidence.",
            "Rule interpretation is draft; source and expert review have not been performed."
          ],
          "recap": {
            "id": "A-RECAP",
            "text": "The supplied confirmation leaves the originally awarded goal standing; the illustrative score changes from 0-0 to 1-0.",
            "evidenceIds": [
              "DECISION-ORIGINAL",
              "DECISION-REVIEW",
              "MATCH-SCORE-BEFORE",
              "MATCH-SCORE-AFTER"
            ],
            "ruleIds": []
          }
        }
      }
    }
  },
  {
    "request": {
      "schemaVersion": "0.2",
      "requestId": "stub-S2-Analyst-LiveAi",
      "scenarioId": "S2",
      "contentVersion": "stub-0.2.0",
      "audience": "ANALYST",
      "sourceMode": "LIVE_AI"
    },
    "response": {
      "data": {
        "explain": {
          "__typename": "ExplanationSuccess",
          "schemaVersion": "0.2",
          "requestId": "stub-S2-Analyst-LiveAi",
          "scenarioId": "S2",
          "contentVersion": "stub-0.2.0",
          "audience": "ANALYST",
          "sourceMode": "LIVE_AI",
          "status": "COMPLETE",
          "interpretation": "NO_OFFSIDE_SUPPORTED",
          "headline": {
            "id": "A-HEAD",
            "text": "A supplied level position changes the authored interpretation, not the involvement fact.",
            "evidenceIds": [
              "F-POSITION",
              "F-TOUCH"
            ],
            "ruleIds": [
              "R-OFFSIDE"
            ]
          },
          "points": [
            {
              "id": "A-POINT",
              "text": "The receiver still plays the pass. In this bounded fixture the receiver is level with the second-last opponent, rather than nearer the goal line. The demonstration does not measure either position from its illustrative diagram.",
              "evidenceIds": [
                "F-POSITION",
                "F-TOUCH"
              ],
              "ruleIds": [
                "R-OFFSIDE"
              ]
            }
          ],
          "limitations": [
            "Synthetic authored T02 test stub, not referee evidence.",
            "Rule interpretation is draft; source and expert review have not been performed.",
            "SIMULATED LIVE-AI TEST STUB: no model was called; this is authored fixture content."
          ],
          "recap": {
            "id": "A-RECAP",
            "text": "The supplied confirmation leaves the originally awarded goal standing; the illustrative score changes from 0-0 to 1-0.",
            "evidenceIds": [
              "DECISION-ORIGINAL",
              "DECISION-REVIEW",
              "MATCH-SCORE-BEFORE",
              "MATCH-SCORE-AFTER"
            ],
            "ruleIds": []
          }
        }
      }
    }
  },
  {
    "request": {
      "schemaVersion": "0.2",
      "requestId": "stub-S3-Casual-Authored",
      "scenarioId": "S3",
      "contentVersion": "stub-0.2.0",
      "audience": "CASUAL",
      "sourceMode": "AUTHORED"
    },
    "response": {
      "data": {
        "explain": {
          "__typename": "ExplanationSuccess",
          "schemaVersion": "0.2",
          "requestId": "stub-S3-Casual-Authored",
          "scenarioId": "S3",
          "contentVersion": "stub-0.2.0",
          "audience": "CASUAL",
          "sourceMode": "AUTHORED",
          "status": "LIMITED",
          "interpretation": "INSUFFICIENT_EVIDENCE",
          "headline": {
            "id": "C-HEAD",
            "text": "The supplied evidence is insufficient for an offside interpretation.",
            "evidenceIds": [
              "F-PASS",
              "F-BALL",
              "F-POSITION"
            ],
            "ruleIds": [
              "R-OFFSIDE"
            ]
          },
          "points": [
            {
              "id": "C-POINT",
              "text": "The original goal award is supplied, but the pass-time positions and review outcome are unavailable.",
              "evidenceIds": [
                "DECISION-ORIGINAL",
                "F-BALL",
                "F-POSITION",
                "DECISION-REVIEW"
              ],
              "ruleIds": []
            }
          ],
          "limitations": [
            "Synthetic authored T02 test stub, not referee evidence.",
            "Rule interpretation is draft; source and expert review have not been performed.",
            "Missing decisive position evidence cannot establish confirmation or disallowance."
          ],
          "recap": {
            "id": "C-RECAP",
            "text": "The original goal was awarded. The review outcome and after-review score are unknown.",
            "evidenceIds": [
              "DECISION-ORIGINAL",
              "DECISION-REVIEW",
              "MATCH-SCORE-AFTER"
            ],
            "ruleIds": []
          }
        }
      }
    }
  },
  {
    "request": {
      "schemaVersion": "0.2",
      "requestId": "stub-S3-Casual-LiveAi",
      "scenarioId": "S3",
      "contentVersion": "stub-0.2.0",
      "audience": "CASUAL",
      "sourceMode": "LIVE_AI"
    },
    "response": {
      "data": {
        "explain": {
          "__typename": "ExplanationSuccess",
          "schemaVersion": "0.2",
          "requestId": "stub-S3-Casual-LiveAi",
          "scenarioId": "S3",
          "contentVersion": "stub-0.2.0",
          "audience": "CASUAL",
          "sourceMode": "LIVE_AI",
          "status": "LIMITED",
          "interpretation": "INSUFFICIENT_EVIDENCE",
          "headline": {
            "id": "C-HEAD",
            "text": "The supplied evidence is insufficient for an offside interpretation.",
            "evidenceIds": [
              "F-PASS",
              "F-BALL",
              "F-POSITION"
            ],
            "ruleIds": [
              "R-OFFSIDE"
            ]
          },
          "points": [
            {
              "id": "C-POINT",
              "text": "The original goal award is supplied, but the pass-time positions and review outcome are unavailable.",
              "evidenceIds": [
                "DECISION-ORIGINAL",
                "F-BALL",
                "F-POSITION",
                "DECISION-REVIEW"
              ],
              "ruleIds": []
            }
          ],
          "limitations": [
            "Synthetic authored T02 test stub, not referee evidence.",
            "Rule interpretation is draft; source and expert review have not been performed.",
            "Missing decisive position evidence cannot establish confirmation or disallowance.",
            "SIMULATED LIVE-AI TEST STUB: no model was called; this is authored fixture content."
          ],
          "recap": {
            "id": "C-RECAP",
            "text": "The original goal was awarded. The review outcome and after-review score are unknown.",
            "evidenceIds": [
              "DECISION-ORIGINAL",
              "DECISION-REVIEW",
              "MATCH-SCORE-AFTER"
            ],
            "ruleIds": []
          }
        }
      }
    }
  },
  {
    "request": {
      "schemaVersion": "0.2",
      "requestId": "stub-S3-Analyst-Authored",
      "scenarioId": "S3",
      "contentVersion": "stub-0.2.0",
      "audience": "ANALYST",
      "sourceMode": "AUTHORED"
    },
    "response": {
      "data": {
        "explain": {
          "__typename": "ExplanationSuccess",
          "schemaVersion": "0.2",
          "requestId": "stub-S3-Analyst-Authored",
          "scenarioId": "S3",
          "contentVersion": "stub-0.2.0",
          "audience": "ANALYST",
          "sourceMode": "AUTHORED",
          "status": "LIMITED",
          "interpretation": "INSUFFICIENT_EVIDENCE",
          "headline": {
            "id": "A-HEAD",
            "text": "Missing pass-time positional relations prevent a supported offside interpretation.",
            "evidenceIds": [
              "F-PASS",
              "F-BALL",
              "F-POSITION"
            ],
            "ruleIds": [
              "R-OFFSIDE"
            ]
          },
          "points": [
            {
              "id": "A-POINT",
              "text": "The receiver\u0027s involvement is supplied separately. That fact cannot reconstruct the missing relation to the ball or second-last opponent. An absent observation is not an observed onside position.",
              "evidenceIds": [
                "F-TOUCH",
                "F-PASS",
                "F-BALL",
                "F-POSITION"
              ],
              "ruleIds": [
                "R-OFFSIDE"
              ]
            }
          ],
          "limitations": [
            "Synthetic authored T02 test stub, not referee evidence.",
            "Rule interpretation is draft; source and expert review have not been performed.",
            "Missing decisive position evidence cannot establish confirmation or disallowance."
          ],
          "recap": {
            "id": "A-RECAP",
            "text": "The supplied original goal award is known; neither a review verdict nor an after-review score is supplied.",
            "evidenceIds": [
              "DECISION-ORIGINAL",
              "DECISION-REVIEW",
              "MATCH-SCORE-AFTER"
            ],
            "ruleIds": []
          }
        }
      }
    }
  },
  {
    "request": {
      "schemaVersion": "0.2",
      "requestId": "stub-S3-Analyst-LiveAi",
      "scenarioId": "S3",
      "contentVersion": "stub-0.2.0",
      "audience": "ANALYST",
      "sourceMode": "LIVE_AI"
    },
    "response": {
      "data": {
        "explain": {
          "__typename": "ExplanationSuccess",
          "schemaVersion": "0.2",
          "requestId": "stub-S3-Analyst-LiveAi",
          "scenarioId": "S3",
          "contentVersion": "stub-0.2.0",
          "audience": "ANALYST",
          "sourceMode": "LIVE_AI",
          "status": "LIMITED",
          "interpretation": "INSUFFICIENT_EVIDENCE",
          "headline": {
            "id": "A-HEAD",
            "text": "Missing pass-time positional relations prevent a supported offside interpretation.",
            "evidenceIds": [
              "F-PASS",
              "F-BALL",
              "F-POSITION"
            ],
            "ruleIds": [
              "R-OFFSIDE"
            ]
          },
          "points": [
            {
              "id": "A-POINT",
              "text": "The receiver\u0027s involvement is supplied separately. That fact cannot reconstruct the missing relation to the ball or second-last opponent. An absent observation is not an observed onside position.",
              "evidenceIds": [
                "F-TOUCH",
                "F-PASS",
                "F-BALL",
                "F-POSITION"
              ],
              "ruleIds": [
                "R-OFFSIDE"
              ]
            }
          ],
          "limitations": [
            "Synthetic authored T02 test stub, not referee evidence.",
            "Rule interpretation is draft; source and expert review have not been performed.",
            "Missing decisive position evidence cannot establish confirmation or disallowance.",
            "SIMULATED LIVE-AI TEST STUB: no model was called; this is authored fixture content."
          ],
          "recap": {
            "id": "A-RECAP",
            "text": "The supplied original goal award is known; neither a review verdict nor an after-review score is supplied.",
            "evidenceIds": [
              "DECISION-ORIGINAL",
              "DECISION-REVIEW",
              "MATCH-SCORE-AFTER"
            ],
            "ruleIds": []
          }
        }
      }
    }
  }
] satisfies ReadonlyArray<{ readonly request: ExplainMutationVariables['input']; readonly response: { readonly data: ExplainMutation } }>

export const errorCases = [
  {
    "request": {
      "schemaVersion": "0.2",
      "requestId": "stub-error-request",
      "scenarioId": "S1",
      "contentVersion": "stub-0.2.0",
      "audience": "CASUAL",
      "sourceMode": "LIVE_AI"
    },
    "response": {
      "data": {
        "explain": {
          "__typename": "ContractError",
          "schemaVersion": "0.2",
          "requestId": "stub-error-request",
          "status": "ERROR",
          "code": "INVALID_REQUEST",
          "message": "The request is invalid.",
          "retryable": false
        }
      }
    }
  },
  {
    "request": {
      "schemaVersion": "0.2",
      "requestId": "stub-error-request",
      "scenarioId": "S1",
      "contentVersion": "stub-0.2.0",
      "audience": "CASUAL",
      "sourceMode": "LIVE_AI"
    },
    "response": {
      "data": {
        "explain": {
          "__typename": "ContractError",
          "schemaVersion": "0.2",
          "requestId": "stub-error-request",
          "status": "ERROR",
          "code": "SCENARIO_NOT_FOUND",
          "message": "The requested scenario is unavailable.",
          "retryable": false
        }
      }
    }
  },
  {
    "request": {
      "schemaVersion": "0.2",
      "requestId": "stub-error-request",
      "scenarioId": "S1",
      "contentVersion": "stub-0.2.0",
      "audience": "CASUAL",
      "sourceMode": "LIVE_AI"
    },
    "response": {
      "data": {
        "explain": {
          "__typename": "ContractError",
          "schemaVersion": "0.2",
          "requestId": "stub-error-request",
          "status": "ERROR",
          "code": "CONTENT_VERSION_MISMATCH",
          "message": "The scenario version has changed. Reload the scenario.",
          "retryable": false
        }
      }
    }
  },
  {
    "request": {
      "schemaVersion": "0.2",
      "requestId": "stub-error-request",
      "scenarioId": "S1",
      "contentVersion": "stub-0.2.0",
      "audience": "CASUAL",
      "sourceMode": "LIVE_AI"
    },
    "response": {
      "data": {
        "explain": {
          "__typename": "ContractError",
          "schemaVersion": "0.2",
          "requestId": "stub-error-request",
          "status": "ERROR",
          "code": "MODEL_NOT_CONFIGURED",
          "message": "Live explanations are not configured.",
          "retryable": false
        }
      }
    }
  },
  {
    "request": {
      "schemaVersion": "0.2",
      "requestId": "stub-error-request",
      "scenarioId": "S1",
      "contentVersion": "stub-0.2.0",
      "audience": "CASUAL",
      "sourceMode": "LIVE_AI"
    },
    "response": {
      "data": {
        "explain": {
          "__typename": "ContractError",
          "schemaVersion": "0.2",
          "requestId": "stub-error-request",
          "status": "ERROR",
          "code": "MODEL_UNAVAILABLE",
          "message": "The explanation provider is unavailable.",
          "retryable": true
        }
      }
    }
  },
  {
    "request": {
      "schemaVersion": "0.2",
      "requestId": "stub-error-request",
      "scenarioId": "S1",
      "contentVersion": "stub-0.2.0",
      "audience": "CASUAL",
      "sourceMode": "LIVE_AI"
    },
    "response": {
      "data": {
        "explain": {
          "__typename": "ContractError",
          "schemaVersion": "0.2",
          "requestId": "stub-error-request",
          "status": "ERROR",
          "code": "TIMEOUT",
          "message": "The explanation attempt timed out.",
          "retryable": true
        }
      }
    }
  },
  {
    "request": {
      "schemaVersion": "0.2",
      "requestId": "stub-error-request",
      "scenarioId": "S1",
      "contentVersion": "stub-0.2.0",
      "audience": "CASUAL",
      "sourceMode": "LIVE_AI"
    },
    "response": {
      "data": {
        "explain": {
          "__typename": "ContractError",
          "schemaVersion": "0.2",
          "requestId": "stub-error-request",
          "status": "ERROR",
          "code": "INVALID_OUTPUT",
          "message": "The explanation response could not be validated.",
          "retryable": true
        }
      }
    }
  }
] satisfies ReadonlyArray<{ readonly request: ExplainMutationVariables['input']; readonly response: { readonly data: ExplainMutation } }>
