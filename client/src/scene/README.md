# VAR-103 supplied scene

`Scene` consumes the unchanged `SceneInput` contract. The broadcast refresh
adds a lazy-loaded Three.js 0.186.1 pitch, alongside the explicit SVG
**2D diagram** view. Both use only the supplied markers/reference, labelled
attacking direction, non-colour-only shapes/legend and equivalent accessible
text. Coordinate scaling is display-only; there is no distance, confidence,
tracking or ruling calculation.

The 3D view has a bounded 900 ms camera reveal, not simulated player movement.
It renders on demand after that reveal, caps device pixel ratio at 1.75 and
skips camera animation under `prefers-reduced-motion: reduce`. Geometry,
materials, renderer, animation frames, context and observers are released when
the view is replaced or unmounted. There are no downloaded models, textures,
fonts, controls packages or external requests.

Unsupported WebGL, renderer initialisation, lazy-bundle failures and context
loss produce a visible explanation and retain the accessible 2D view.
The canvas is decorative to assistive technology; its containing image exposes
the same supplied description as the SVG. View selection never changes evidence
or triggers an explanation request.

All four position keys must be visible before any diagram detail is exposed.
The unavailable S3 snapshot has no markers or positional reference. Before
release, the neutral view says “Not yet revealed”, not “missing”.

Run `npm run test:package:103`. Real isolated browser states at 375px/1280px
are in `client/tests/integration/components.spec.ts`; normal-app composition
and actual WebGL/reduced-motion/fallback checks are in
`client/tests/integration/visual-review.spec.ts`. Pure Three.js scene tests verify
supplied coordinates, missing/reset states and resource disposal without a GPU.
See [local verification and run instructions](../../../docs/local-delivery.md).
