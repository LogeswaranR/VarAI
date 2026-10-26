#!/bin/sh
# azd down deletes only its own resource group. The role assignments this template added to the EXISTING Foundry account
# live outside that group, so remove them here before the identity they point at disappears.
set -u

if [ -z "${AZURE_FOUNDRY_ACCOUNT_ID:-}" ]; then
  echo "No Foundry account recorded for this environment; nothing to clean up."
  exit 0
fi

for principal in "${AZURE_MANAGED_IDENTITY_PRINCIPAL_ID:-}" "${AZURE_OPERATOR_PRINCIPAL_ID:-}"; do
  if [ -z "$principal" ]; then
    continue
  fi
  echo "Removing the model access role assignment of $principal from the Foundry account..."
  az role assignment delete --assignee "$principal" --scope "$AZURE_FOUNDRY_ACCOUNT_ID" --role "Cognitive Services OpenAI User" \
    || echo "Warning: could not remove the role assignment for $principal; remove it manually if it still exists." >&2
done
