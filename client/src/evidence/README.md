# VAR-104 evidence explorer

`EvidenceExplorer` consumes the unchanged `EvidenceExplorerInput`. Only supplied
visible facts/context are rendered; missing values and rule-review metadata
retain their status. Summaries are plain text. Only absolute HTTPS links without
embedded credentials are actionable.

The host sends `SourceSelection`. All matching visible entries are highlighted;
the first is focused. Unknown/hidden IDs produce an explicit unavailable alert,
not a substitute. Fact and rule namespaces remain separate. Clearing selection
removes emphasis. Native reference links support keyboard navigation, including
all four fixed context IDs when released.

Runtime scenario validation belongs to the transport/host; this renderer does
not authenticate expert-review records. Current application rules are SourceChecked,
not expert-reviewed.

Run `npm run test:package:104`. The isolated and real-app browser checks cover
focus and layout at both target widths. See the [local guide](../../../docs/local-delivery.md).
