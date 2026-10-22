// Generated from the selected GraphQL operation fields; do not edit.
import { matchesShape, type Shape } from './response-shape'
import type { ScenariosQuery } from './graphql.generated'
const ScenariosShape = {
  "kind": "object",
  "fields": {
    "scenarios": {
      "kind": "list",
      "item": {
        "kind": "object",
        "fields": {
          "id": {
            "kind": "enum",
            "values": [
              "S1",
              "S2",
              "S3"
            ]
          },
          "contentVersion": {
            "kind": "scalar",
            "name": "String"
          },
          "synthetic": {
            "kind": "scalar",
            "name": "Boolean"
          },
          "label": {
            "kind": "scalar",
            "name": "String"
          }
        }
      }
    }
  }
} as const satisfies Shape
export function isScenariosQuery(value: unknown): value is ScenariosQuery {
  return matchesShape(value, ScenariosShape)
}
import type { ScenarioQuery } from './graphql.generated'
const ScenarioShape = {
  "kind": "object",
  "fields": {
    "scenario": {
      "kind": "union",
      "members": {
        "Scenario": {
          "kind": "object",
          "fields": {
            "__typename": {
              "kind": "enum",
              "values": [
                "Scenario"
              ]
            },
            "schemaVersion": {
              "kind": "scalar",
              "name": "String"
            },
            "contentVersion": {
              "kind": "scalar",
              "name": "String"
            },
            "id": {
              "kind": "enum",
              "values": [
                "S1",
                "S2",
                "S3"
              ]
            },
            "synthetic": {
              "kind": "scalar",
              "name": "Boolean"
            },
            "label": {
              "kind": "scalar",
              "name": "String"
            },
            "match": {
              "kind": "object",
              "fields": {
                "homeTeam": {
                  "kind": "scalar",
                  "name": "String"
                },
                "awayTeam": {
                  "kind": "scalar",
                  "name": "String"
                },
                "incidentMinute": {
                  "kind": "scalar",
                  "name": "Int"
                },
                "scoreBefore": {
                  "kind": "object",
                  "fields": {
                    "home": {
                      "kind": "scalar",
                      "name": "Int"
                    },
                    "away": {
                      "kind": "scalar",
                      "name": "Int"
                    }
                  }
                }
              }
            },
            "originalDecision": {
              "kind": "enum",
              "values": [
                "GOAL_AWARDED"
              ]
            },
            "suppliedReviewOutcome": {
              "kind": "nullable",
              "value": {
                "kind": "enum",
                "values": [
                  "GOAL_DISALLOWED",
                  "GOAL_CONFIRMED"
                ]
              }
            },
            "scoreAfterReview": {
              "kind": "nullable",
              "value": {
                "kind": "object",
                "fields": {
                  "home": {
                    "kind": "scalar",
                    "name": "Int"
                  },
                  "away": {
                    "kind": "scalar",
                    "name": "Int"
                  }
                }
              }
            },
            "interpretation": {
              "kind": "enum",
              "values": [
                "OFFSIDE_SUPPORTED",
                "NO_OFFSIDE_SUPPORTED",
                "INSUFFICIENT_EVIDENCE"
              ]
            },
            "facts": {
              "kind": "list",
              "item": {
                "kind": "object",
                "fields": {
                  "id": {
                    "kind": "scalar",
                    "name": "String"
                  },
                  "key": {
                    "kind": "enum",
                    "values": [
                      "PASS_TIME_OBSERVED",
                      "RECEIVER_IN_OPPONENTS_HALF",
                      "RECEIVER_AHEAD_OF_BALL",
                      "RECEIVER_VS_SECOND_LAST",
                      "ACTIVE_INVOLVEMENT",
                      "PLAY_TYPE",
                      "INTERVENING_OPPONENT_TOUCH"
                    ]
                  },
                  "status": {
                    "kind": "enum",
                    "values": [
                      "SUPPLIED",
                      "MISSING"
                    ]
                  },
                  "sourceLabel": {
                    "kind": "scalar",
                    "name": "String"
                  },
                  "value": {
                    "kind": "nullable",
                    "value": {
                      "kind": "union",
                      "members": {
                        "BooleanFactValue": {
                          "kind": "object",
                          "fields": {
                            "__typename": {
                              "kind": "enum",
                              "values": [
                                "BooleanFactValue"
                              ]
                            },
                            "boolean": {
                              "kind": "scalar",
                              "name": "Boolean"
                            }
                          }
                        },
                        "PositionFactValue": {
                          "kind": "object",
                          "fields": {
                            "__typename": {
                              "kind": "enum",
                              "values": [
                                "PositionFactValue"
                              ]
                            },
                            "position": {
                              "kind": "enum",
                              "values": [
                                "NEARER",
                                "LEVEL"
                              ]
                            }
                          }
                        },
                        "InvolvementFactValue": {
                          "kind": "object",
                          "fields": {
                            "__typename": {
                              "kind": "enum",
                              "values": [
                                "InvolvementFactValue"
                              ]
                            },
                            "involvement": {
                              "kind": "enum",
                              "values": [
                                "TOUCH"
                              ]
                            }
                          }
                        },
                        "PlayTypeFactValue": {
                          "kind": "object",
                          "fields": {
                            "__typename": {
                              "kind": "enum",
                              "values": [
                                "PlayTypeFactValue"
                              ]
                            },
                            "playType": {
                              "kind": "enum",
                              "values": [
                                "OPEN_PLAY"
                              ]
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            "rules": {
              "kind": "list",
              "item": {
                "kind": "object",
                "fields": {
                  "id": {
                    "kind": "scalar",
                    "name": "String"
                  },
                  "title": {
                    "kind": "scalar",
                    "name": "String"
                  },
                  "section": {
                    "kind": "scalar",
                    "name": "String"
                  },
                  "publisher": {
                    "kind": "scalar",
                    "name": "String"
                  },
                  "url": {
                    "kind": "scalar",
                    "name": "String"
                  },
                  "edition": {
                    "kind": "nullable",
                    "value": {
                      "kind": "scalar",
                      "name": "String"
                    }
                  },
                  "checkedOn": {
                    "kind": "nullable",
                    "value": {
                      "kind": "scalar",
                      "name": "String"
                    }
                  },
                  "reviewStatus": {
                    "kind": "enum",
                    "values": [
                      "DRAFT",
                      "SOURCE_CHECKED",
                      "EXPERT_REVIEWED"
                    ]
                  },
                  "summary": {
                    "kind": "scalar",
                    "name": "String"
                  }
                }
              }
            },
            "events": {
              "kind": "list",
              "item": {
                "kind": "object",
                "fields": {
                  "id": {
                    "kind": "scalar",
                    "name": "String"
                  },
                  "offsetMs": {
                    "kind": "scalar",
                    "name": "Int"
                  },
                  "kind": {
                    "kind": "enum",
                    "values": [
                      "PASS",
                      "RECEIVER_TOUCH",
                      "SHOT",
                      "GOAL",
                      "REVIEW_STARTED",
                      "REVIEW_READY"
                    ]
                  },
                  "label": {
                    "kind": "scalar",
                    "name": "String"
                  },
                  "revealFactIds": {
                    "kind": "list",
                    "item": {
                      "kind": "scalar",
                      "name": "String"
                    }
                  }
                }
              }
            },
            "diagram": {
              "kind": "object",
              "fields": {
                "status": {
                  "kind": "enum",
                  "values": [
                    "ILLUSTRATIVE",
                    "UNAVAILABLE"
                  ]
                },
                "direction": {
                  "kind": "enum",
                  "values": [
                    "LEFT_TO_RIGHT"
                  ]
                },
                "markers": {
                  "kind": "list",
                  "item": {
                    "kind": "object",
                    "fields": {
                      "id": {
                        "kind": "scalar",
                        "name": "String"
                      },
                      "role": {
                        "kind": "enum",
                        "values": [
                          "PASSER",
                          "RECEIVER",
                          "OPPONENT",
                          "BALL"
                        ]
                      },
                      "label": {
                        "kind": "scalar",
                        "name": "String"
                      },
                      "x": {
                        "kind": "scalar",
                        "name": "Float"
                      },
                      "y": {
                        "kind": "scalar",
                        "name": "Float"
                      }
                    }
                  }
                },
                "secondLastReferenceX": {
                  "kind": "nullable",
                  "value": {
                    "kind": "scalar",
                    "name": "Float"
                  }
                },
                "textAlternative": {
                  "kind": "scalar",
                  "name": "String"
                }
              }
            },
            "comparison": {
              "kind": "nullable",
              "value": {
                "kind": "object",
                "fields": {
                  "pairId": {
                    "kind": "scalar",
                    "name": "String"
                  },
                  "otherScenarioId": {
                    "kind": "enum",
                    "values": [
                      "S1",
                      "S2",
                      "S3"
                    ]
                  },
                  "changedFactKey": {
                    "kind": "enum",
                    "values": [
                      "PASS_TIME_OBSERVED",
                      "RECEIVER_IN_OPPONENTS_HALF",
                      "RECEIVER_AHEAD_OF_BALL",
                      "RECEIVER_VS_SECOND_LAST",
                      "ACTIVE_INVOLVEMENT",
                      "PLAY_TYPE",
                      "INTERVENING_OPPONENT_TOUCH"
                    ]
                  }
                }
              }
            },
            "authoredExplanations": {
              "kind": "object",
              "fields": {
                "casual": {
                  "kind": "object",
                  "fields": {
                    "sourceMode": {
                      "kind": "enum",
                      "values": [
                        "AUTHORED",
                        "LIVE_AI"
                      ]
                    },
                    "status": {
                      "kind": "enum",
                      "values": [
                        "COMPLETE",
                        "LIMITED",
                        "ERROR"
                      ]
                    },
                    "interpretation": {
                      "kind": "enum",
                      "values": [
                        "OFFSIDE_SUPPORTED",
                        "NO_OFFSIDE_SUPPORTED",
                        "INSUFFICIENT_EVIDENCE"
                      ]
                    },
                    "headline": {
                      "kind": "object",
                      "fields": {
                        "id": {
                          "kind": "scalar",
                          "name": "String"
                        },
                        "text": {
                          "kind": "scalar",
                          "name": "String"
                        },
                        "evidenceIds": {
                          "kind": "list",
                          "item": {
                            "kind": "scalar",
                            "name": "String"
                          }
                        },
                        "ruleIds": {
                          "kind": "list",
                          "item": {
                            "kind": "scalar",
                            "name": "String"
                          }
                        }
                      }
                    },
                    "points": {
                      "kind": "list",
                      "item": {
                        "kind": "object",
                        "fields": {
                          "id": {
                            "kind": "scalar",
                            "name": "String"
                          },
                          "text": {
                            "kind": "scalar",
                            "name": "String"
                          },
                          "evidenceIds": {
                            "kind": "list",
                            "item": {
                              "kind": "scalar",
                              "name": "String"
                            }
                          },
                          "ruleIds": {
                            "kind": "list",
                            "item": {
                              "kind": "scalar",
                              "name": "String"
                            }
                          }
                        }
                      }
                    },
                    "limitations": {
                      "kind": "list",
                      "item": {
                        "kind": "scalar",
                        "name": "String"
                      }
                    },
                    "recap": {
                      "kind": "object",
                      "fields": {
                        "id": {
                          "kind": "scalar",
                          "name": "String"
                        },
                        "text": {
                          "kind": "scalar",
                          "name": "String"
                        },
                        "evidenceIds": {
                          "kind": "list",
                          "item": {
                            "kind": "scalar",
                            "name": "String"
                          }
                        },
                        "ruleIds": {
                          "kind": "list",
                          "item": {
                            "kind": "scalar",
                            "name": "String"
                          }
                        }
                      }
                    }
                  }
                },
                "analyst": {
                  "kind": "object",
                  "fields": {
                    "sourceMode": {
                      "kind": "enum",
                      "values": [
                        "AUTHORED",
                        "LIVE_AI"
                      ]
                    },
                    "status": {
                      "kind": "enum",
                      "values": [
                        "COMPLETE",
                        "LIMITED",
                        "ERROR"
                      ]
                    },
                    "interpretation": {
                      "kind": "enum",
                      "values": [
                        "OFFSIDE_SUPPORTED",
                        "NO_OFFSIDE_SUPPORTED",
                        "INSUFFICIENT_EVIDENCE"
                      ]
                    },
                    "headline": {
                      "kind": "object",
                      "fields": {
                        "id": {
                          "kind": "scalar",
                          "name": "String"
                        },
                        "text": {
                          "kind": "scalar",
                          "name": "String"
                        },
                        "evidenceIds": {
                          "kind": "list",
                          "item": {
                            "kind": "scalar",
                            "name": "String"
                          }
                        },
                        "ruleIds": {
                          "kind": "list",
                          "item": {
                            "kind": "scalar",
                            "name": "String"
                          }
                        }
                      }
                    },
                    "points": {
                      "kind": "list",
                      "item": {
                        "kind": "object",
                        "fields": {
                          "id": {
                            "kind": "scalar",
                            "name": "String"
                          },
                          "text": {
                            "kind": "scalar",
                            "name": "String"
                          },
                          "evidenceIds": {
                            "kind": "list",
                            "item": {
                              "kind": "scalar",
                              "name": "String"
                            }
                          },
                          "ruleIds": {
                            "kind": "list",
                            "item": {
                              "kind": "scalar",
                              "name": "String"
                            }
                          }
                        }
                      }
                    },
                    "limitations": {
                      "kind": "list",
                      "item": {
                        "kind": "scalar",
                        "name": "String"
                      }
                    },
                    "recap": {
                      "kind": "object",
                      "fields": {
                        "id": {
                          "kind": "scalar",
                          "name": "String"
                        },
                        "text": {
                          "kind": "scalar",
                          "name": "String"
                        },
                        "evidenceIds": {
                          "kind": "list",
                          "item": {
                            "kind": "scalar",
                            "name": "String"
                          }
                        },
                        "ruleIds": {
                          "kind": "list",
                          "item": {
                            "kind": "scalar",
                            "name": "String"
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "ContractError": {
          "kind": "object",
          "fields": {
            "__typename": {
              "kind": "enum",
              "values": [
                "ContractError"
              ]
            },
            "schemaVersion": {
              "kind": "scalar",
              "name": "String"
            },
            "requestId": {
              "kind": "scalar",
              "name": "String"
            },
            "status": {
              "kind": "enum",
              "values": [
                "COMPLETE",
                "LIMITED",
                "ERROR"
              ]
            },
            "code": {
              "kind": "enum",
              "values": [
                "INVALID_REQUEST",
                "SCENARIO_NOT_FOUND",
                "CONTENT_VERSION_MISMATCH",
                "MODEL_NOT_CONFIGURED",
                "MODEL_UNAVAILABLE",
                "TIMEOUT",
                "INVALID_OUTPUT"
              ]
            },
            "message": {
              "kind": "scalar",
              "name": "String"
            },
            "retryable": {
              "kind": "scalar",
              "name": "Boolean"
            }
          }
        }
      }
    }
  }
} as const satisfies Shape
export function isScenarioQuery(value: unknown): value is ScenarioQuery {
  return matchesShape(value, ScenarioShape)
}
import type { ExplainMutation } from './graphql.generated'
const ExplainShape = {
  "kind": "object",
  "fields": {
    "explain": {
      "kind": "union",
      "members": {
        "ExplanationSuccess": {
          "kind": "object",
          "fields": {
            "__typename": {
              "kind": "enum",
              "values": [
                "ExplanationSuccess"
              ]
            },
            "schemaVersion": {
              "kind": "scalar",
              "name": "String"
            },
            "requestId": {
              "kind": "scalar",
              "name": "String"
            },
            "scenarioId": {
              "kind": "enum",
              "values": [
                "S1",
                "S2",
                "S3"
              ]
            },
            "contentVersion": {
              "kind": "scalar",
              "name": "String"
            },
            "audience": {
              "kind": "enum",
              "values": [
                "CASUAL",
                "ANALYST"
              ]
            },
            "sourceMode": {
              "kind": "enum",
              "values": [
                "AUTHORED",
                "LIVE_AI"
              ]
            },
            "status": {
              "kind": "enum",
              "values": [
                "COMPLETE",
                "LIMITED",
                "ERROR"
              ]
            },
            "interpretation": {
              "kind": "enum",
              "values": [
                "OFFSIDE_SUPPORTED",
                "NO_OFFSIDE_SUPPORTED",
                "INSUFFICIENT_EVIDENCE"
              ]
            },
            "headline": {
              "kind": "object",
              "fields": {
                "id": {
                  "kind": "scalar",
                  "name": "String"
                },
                "text": {
                  "kind": "scalar",
                  "name": "String"
                },
                "evidenceIds": {
                  "kind": "list",
                  "item": {
                    "kind": "scalar",
                    "name": "String"
                  }
                },
                "ruleIds": {
                  "kind": "list",
                  "item": {
                    "kind": "scalar",
                    "name": "String"
                  }
                }
              }
            },
            "points": {
              "kind": "list",
              "item": {
                "kind": "object",
                "fields": {
                  "id": {
                    "kind": "scalar",
                    "name": "String"
                  },
                  "text": {
                    "kind": "scalar",
                    "name": "String"
                  },
                  "evidenceIds": {
                    "kind": "list",
                    "item": {
                      "kind": "scalar",
                      "name": "String"
                    }
                  },
                  "ruleIds": {
                    "kind": "list",
                    "item": {
                      "kind": "scalar",
                      "name": "String"
                    }
                  }
                }
              }
            },
            "limitations": {
              "kind": "list",
              "item": {
                "kind": "scalar",
                "name": "String"
              }
            },
            "recap": {
              "kind": "object",
              "fields": {
                "id": {
                  "kind": "scalar",
                  "name": "String"
                },
                "text": {
                  "kind": "scalar",
                  "name": "String"
                },
                "evidenceIds": {
                  "kind": "list",
                  "item": {
                    "kind": "scalar",
                    "name": "String"
                  }
                },
                "ruleIds": {
                  "kind": "list",
                  "item": {
                    "kind": "scalar",
                    "name": "String"
                  }
                }
              }
            }
          }
        },
        "ContractError": {
          "kind": "object",
          "fields": {
            "__typename": {
              "kind": "enum",
              "values": [
                "ContractError"
              ]
            },
            "schemaVersion": {
              "kind": "scalar",
              "name": "String"
            },
            "requestId": {
              "kind": "scalar",
              "name": "String"
            },
            "status": {
              "kind": "enum",
              "values": [
                "COMPLETE",
                "LIMITED",
                "ERROR"
              ]
            },
            "code": {
              "kind": "enum",
              "values": [
                "INVALID_REQUEST",
                "SCENARIO_NOT_FOUND",
                "CONTENT_VERSION_MISMATCH",
                "MODEL_NOT_CONFIGURED",
                "MODEL_UNAVAILABLE",
                "TIMEOUT",
                "INVALID_OUTPUT"
              ]
            },
            "message": {
              "kind": "scalar",
              "name": "String"
            },
            "retryable": {
              "kind": "scalar",
              "name": "Boolean"
            }
          }
        }
      }
    }
  }
} as const satisfies Shape
export function isExplainMutation(value: unknown): value is ExplainMutation {
  return matchesShape(value, ExplainShape)
}
