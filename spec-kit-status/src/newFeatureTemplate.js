"use strict";

function buildNewFeaturePromptTemplate() {
  return [
    "# New Feature Prompt",
    "",
    "Use this prompt with `/speckit.specify` to create a new feature.",
    "",
    "## Goal",
    "- What problem should this feature solve?",
    "",
    "## Users",
    "- Who is the primary user?",
    "- What are they trying to achieve?",
    "",
    "## Requirements",
    "- Functional requirement 1",
    "- Functional requirement 2",
    "- Functional requirement 3",
    "",
    "## User Stories",
    "- As a ..., I want ..., so that ...",
    "- As a ..., I want ..., so that ...",
    "",
    "## Constraints",
    "- Technical constraints, dependencies, or non-goals",
    "",
    "## Acceptance Criteria",
    "- Criterion 1",
    "- Criterion 2",
    "- Criterion 3"
  ].join("\n");
}

module.exports = {
  buildNewFeaturePromptTemplate
};
