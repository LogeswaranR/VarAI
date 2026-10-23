# VAR-103 supplied scene

`Scene` consumes the unchanged `SceneInput` contract. It renders a lightweight
SVG pitch, supplied markers/reference, labelled attacking direction, a numbered
non-colour-only legend and equivalent supplied text. Coordinate scaling is
display-only; there is no distance, confidence or ruling calculation.

All four position keys must be visible before any diagram detail is exposed.
The unavailable S3 snapshot has no markers or positional reference. Before
release, the neutral view says “Not yet revealed”, not “missing”.

Run `npm run test:package:103`. Real isolated browser states at 375px/1280px
are in `client/tests/integration/components.spec.ts`; normal-app composition
is separate from those explicitly staged fixtures.
See [local verification and run instructions](../../../docs/local-delivery.md).
