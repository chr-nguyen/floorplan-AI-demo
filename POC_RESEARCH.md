# Existing room photo → additions preview → 仕上げ表

Scope note — 2026-08-10

## Corrected POC definition

```text
existing-room photograph
           +
selected finishes / fixtures / furniture
           │
           ├── AI-edited preview of the same room
           └── live structured 仕上げ表 / estimate handoff
```

The structured selections are the proposal source of truth. Changing an item updates the schedule immediately. The AI preview is a slower visual interpretation of those selections and is marked as needing regeneration after a change. The demo uses coherent `POC-*` codes, unbranded POC labels, and fictional prices rather than third-party branding. These records are for demonstration only and must be replaced before commercial use.

## Implemented interaction

1. Upload a clear photograph of the existing room.
2. Identify the room type and design direction.
3. Select applicable surface finishes and lighting. Kitchen and washroom fields appear only for those room types.
4. Estimate floor, net wall, and ceiling areas from the photo using an editable assumed ceiling height; apply them to schedule quantities.
5. Add unbranded POC furniture and accessories intentionally; none are selected by default.
6. The bilingual 仕上げ表 updates immediately with specification status, public source, proposed color, POC SKU, quantity, editable price, and amount.
7. Generate or regenerate the room edit. The prompt preserves the original camera, crop, architecture, openings, and existing-room context while applying the approved additions.
8. Export UTF-8 CSV, print/PDF, or a standalone HTML proposal.

## Why this architecture fits

| Concern | Design decision |
|---|---|
| Live customer conversation | Schedule and totals are ordinary application state and update instantly without an AI request. |
| Preview latency | The last preview remains visible and is labeled “update needed” until regenerated. |
| Demo coherence | Common residential specification tiers substantiate the categories; fictional POC codes and prices avoid commercial branding. AI never creates additional billable records. |
| Quantity assistance | Gemini estimates floor, net wall, and ceiling area from the photo using an assumed ceiling-height anchor; the schedule remains editable. |
| Existing-room fidelity | This is an image-editing prompt, not text-to-image generation. It explicitly freezes the camera and architecture. |
| Privacy | The photo stays local until the user presses Render. A persistent notice explains that rendering sends the photo and selections to Gemini; there is no separate confirmation checkbox. |
| Bilingual handoff | Japanese and English UI, table labels, product names, units, and exports share the same data model. |

The POC uses [Gemini 3.1 Flash Image](https://ai.google.dev/gemini-api/docs/image-generation) because it accepts an input image plus detailed editing instructions. The raw REST request uses the API's enum values for output size and leaves aspect ratio unspecified so the result can follow the source photograph.

## Important limitation

Text and color swatches alone cannot guarantee that a generated finish matches a manufacturer's real product. The image is suitable for conversation and direction-setting, not final approval. Exact product appearance, dimensions, installation, and availability must be confirmed against physical samples and supplier data.

## Recommended production path

1. Replace fictional POC records with the customer's internal product master, approved supplier list, option rules, and prices.
2. Attach one or more approved reference photographs to each finish and furniture record.
3. Let the rep mark “keep,” “remove,” and “replace” objects in the source room; add optional masks for exact wall/floor regions.
4. Store proposal revisions, source images, generated previews, catalog snapshots, and approvals.
5. Generate an archival PDF server-side with embedded Japanese fonts and revision metadata.
6. Map the CSV/API payload to the actual estimating system, including labor, freight, discounts, and tax classes.
7. Validate with representative room photographs covering difficult lighting, clutter, partial occlusion, and wide/vertical framing.

## POC acceptance criteria

- A salesperson can upload a room photo and add finishes or furniture without developer assistance.
- Every selection appears in the 仕上げ表 immediately.
- A user can request a photo-based surface estimate and see floor, wall, and ceiling quantities update immediately.
- A changed selection leaves the prior preview visible but clearly marks it as stale.
- Regeneration receives exactly the products currently present in the schedule.
- The edit broadly preserves the source camera and room architecture.
- Japanese text exports correctly and the CSV imports into the chosen estimating workflow.
- Users are informed before a room photo is sent to a third-party AI service.
