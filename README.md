# Asahi Kensetsu Interior Proposal POC

A standalone bilingual proof of concept for an interior sales meeting. A salesperson uploads a photograph of an existing room, selects new finishes and furniture, generates an AI-edited preview, and exports a live 仕上げ表 (finish schedule) for estimating and client handoff.

The structured selections—not the AI image—are the source of truth. The same records are sent to the preview prompt and displayed in the finish schedule. Public Asahi Kensetsu documents inform the categories; coherent, clearly marked POC SKUs and prices make the demo usable without introducing unrelated supplier branding.

## Prerequisites

- Node.js 20 or later is recommended.
- npm.
- A Google Gemini API key with access to the configured image-generation and vision models.

## Run locally

From this project directory:

```bash
npm install
cp .env.example .env
```

Open `.env` and replace the placeholder key:

```dotenv
GOOGLE_API_KEY="your-google-gemini-api-key"
GEMINI_IMAGE_MODEL="gemini-3.1-flash-image"
GEMINI_VISION_MODEL="gemini-3.6-flash"
```

Start the development server:

```bash
npm run dev
```

Open the local URL printed by Astro, normally:

```text
http://localhost:4321
```

If that port is occupied, Astro automatically chooses another port and prints it in the terminal. Stop the server with `Ctrl+C`.

The interface and finish-schedule features work without an API request. A valid Gemini key is required only when generating the AI room preview. There is no separate consent checkbox: pressing the render button starts generation directly after a photo has been uploaded.

## Verify a production build

```bash
npm run build
```

This creates an Astro server build using the Vercel adapter. The Gemini API key is read only by the server-side API route and is not included in the browser bundle.

## How the app works

The interface has three primary areas:

1. A large **Original / Preview** image window.
2. A right-side checklist of changes to apply.
3. A live 仕上げ表 directly below the workspace.

Project information is kept in one compact row above the image so it does not compete with the visual workflow.

### 1. Upload the existing room

Upload or drag in a PNG or JPEG photograph up to 12 MB. A bright, wide photograph showing the floor and major walls gives the model the best spatial reference.

The image remains in the browser until the user presses **Estimate areas** or **Render new view**.

### 2. Describe the project

Enter the project and customer names, then choose:

- Room type.
- Design direction.
- A short instruction describing what should remain and what should be added or removed.

The selected room type controls which finish fields are relevant. Living rooms and bedrooms show core surfaces and lighting; kitchens and washrooms also expose applicable counters, cabinets, panels, sinks, faucets, and hardware.

### 3. Check the changes to apply

The panel on the right is an explicit checklist. Floor, walls, and ceiling are checked initially; every other finish, fixture, reference-furniture item, and accessory is optional.

- Check an item to include it in the AI edit and the 仕上げ表.
- Uncheck it to remove it from both.
- Use the dropdown under a checked finish to choose its material or product variant.
- The selected-item count and total update immediately.

The checklist is backed by the bilingual catalog in `src/components/proposal/catalog.ts`. Each catalog record contains:

- Japanese and English names.
- Specification and color.
- Fictional POC product code and demo maker label.
- Size and unit.
- Fictional, editable POC unit price and display swatch.
- Specification status (`Standard`, `Standard+`, `Option`, or `Reference furniture`).
- Public source label and URL.
- Exact-product confirmation state for later replacement with production data.

The included finish and equipment categories are based on Asahi Kensetsu's public [specifications and equipment page](https://www.asahi21.co.jp/ac-mansion/shiyo.html), [2LDK specification](https://www.asahi21.co.jp/ac-mansion/pdf2/2ldk.pdf), and [parts gallery](https://www.asahi22.jp/parts_gallery/). The displayed `AK-POC-*` codes, prices, and `Asahi Kensetsu Selection (POC)` maker label are intentionally fictional demo data. No unrelated third-party branding is presented as an Asahi product.

Furniture and accessories start unselected and use neutral, unbranded POC records. An unchecked item is not sent to Gemini and does not appear in the schedule.

### 4. Estimate floor and wall areas

After uploading a photo, set the assumed ceiling height and press **Estimate areas**. The local endpoint sends the image to the configured Gemini vision model and requests a structured estimate of:

- Full floor area.
- Net wall finish area after approximate door/window deductions.
- Ceiling area.
- Approximate room width, depth, and confidence.

The returned floor, wall, and ceiling areas immediately replace the corresponding quantities in the live finish schedule. They remain editable. Changing to another floor, wall, or ceiling selection carries the latest estimated area into the new row.

This is an AI-assisted POC estimate from a single perspective image—not photogrammetry or a construction takeoff. A ceiling-height assumption gives the model a scale anchor, but formal estimates still require a dimensioned drawing, LiDAR/depth capture, or site measurement.

### 5. Generate the room preview

Press **Render new view**. The browser immediately sends the room photograph and only the checked selections to the local endpoint—there is no additional confirmation step:

```text
POST /api/generate-interior-preview
```

The server adds the API key and calls Gemini. Its editing prompt asks the model to preserve the source camera position, crop, room geometry, doors, windows, openings, and built-ins while applying only the selected finishes, fixtures, furniture, and accessories.

Generation normally takes approximately 30–90 seconds and times out after 120 seconds.

Use the **Original** and **Preview** buttons above the large image to compare the source photograph with the generated result. The preview is not regenerated on every selection because that would add latency and API cost. Instead:

1. The finish schedule updates immediately.
2. The previous preview remains visible.
3. The preview is marked **Update needed**.
4. The user regenerates when the current selection is ready for review.

### 6. Review the live 仕上げ表

The schedule sits directly below the image/checklist workspace and displays the exact checked catalog records with:

- Image/swatch.
- Section.
- Description and specification.
- Size.
- Color and fictional `AK-POC-*` product code.
- Manufacturer and public source.
- Specification status.
- Quantity and unit.
- Editable unit price.
- Line amount, subtotal, tax, and total.

Quantity and price edits update all totals immediately. AI-estimated surface quantities are labelled `AI estimate`. The POC begins with fictional sample prices, and they can be replaced inline. It is an estimate basis rather than a final invoice; real manufacturer/SKU confirmation, measured quantities, labor, installation, freight, overhead, discounts, stock, and commercial approval belong in the downstream estimating system.

### 7. Export the result

The available exports are:

- **CSV** — UTF-8 selection and pricing data for Excel, Sheets, or an estimating system.
- **Print / PDF** — opens a print-ready proposal that can be saved as PDF using the browser print dialog.
- **Export proposal** — downloads a self-contained HTML document containing the generated preview, finish schedule, totals, and project information.

Exports follow the currently selected Japanese or English interface language.

## Visual design

The interface follows the ArchiX design system: white and ink surfaces on a `#F7F8FA` field, `#1F4CDA` as the single accent, hairline `#E5E7EB` rules instead of shadows, square corners (8px only on panels, 4px on inputs), uppercase 10px micro-labels with a 48×2px blue rule under section eyebrows, framed square checkmarks as the list marker, and Chivo Mono for quantities, prices, and totals. Hover states swap background or border colour only — no transforms, lifts, or glows.

Every typeface is free and open-licensed, loaded from Google Fonts: **Archivo** for display (headlines and the wordmark), **Inter** for interface and body text, **Noto Sans JP** for Japanese, **Chivo Mono** for figures. Archivo stands in for the brand's Acumin Pro, which is a paid Adobe licence — it is the same neo-grotesque genre, drawn for display sizes, and comes from the same foundry as Chivo Mono, so the two harmonise.

Tokens live in `src/styles/archix.css`; `src/components/proposal/InteriorProposalApp.css` references them and hard-codes no colours. The exported and printed proposal document carries the same palette inline so the handoff artifact matches the screen.

## Application data flow

```text
room photo ───────────────────────────────┐
      ├──> Gemini surface estimate ──> floor / wall / ceiling quantities
      │                                  │
      └──────────────────────────────────┤
                                         │
room details + selected catalog items ───┼──> Gemini room edit ──> preview
                  │                      │
                  └──> live 仕上げ表 ────┴──> CSV / PDF / HTML
```

The finish schedule is generated directly from application state. It is never extracted from the AI preview.

## Privacy behavior

- The API key stays on the server.
- Uploading a photograph alone does not send it to Google.
- The photograph and current selections are sent to Google Gemini when the user presses the render button; there is no separate confirmation checkbox.
- The photograph is also sent to Gemini when the user explicitly presses **Estimate areas**.
- The app does not currently save projects, source photographs, or generated previews to a database.

Confirm organizational data-retention, data-residency, and customer-consent requirements before using real customer photographs outside a controlled POC.

## Troubleshooting

### The Generate button is disabled

Upload a room photograph and select at least one finish, fixture, or reference-furniture item.

### `GOOGLE_API_KEY is not configured on the server`

Confirm that `.env` exists in the project root, contains `GOOGLE_API_KEY`, and that the development server was restarted after editing the file.

### Image or request validation error

Use a PNG or JPEG no larger than 12 MB. Other formats, including HEIC, are not accepted in this POC.

### Gemini permission, quota, or model error

Confirm that the key can access the configured `GEMINI_IMAGE_MODEL`, that billing/quota is available, and that the model name in `.env` is valid.

### Generation takes too long

The server aborts the request after 120 seconds. Retry with a smaller source photograph or try again when API capacity is available.

### Surface estimation fails

Confirm that `GEMINI_VISION_MODEL` names a vision-capable Gemini model available to the API key. The estimator times out after 60 seconds. A photograph that shows both floor/wall boundaries and several familiar architectural elements generally gives a more plausible result.

### The generated room changes too much

Use a clear source photograph and state exactly what must remain in the customer brief. The current model output is still conceptual. Production fidelity will require approved manufacturer reference images and, for exact surface targeting, editable masks.

## Important limitations

- The AI preview is a visual concept, not a construction drawing or product-appearance guarantee.
- Public Asahi documents inform the categories, but `AK-POC-*` SKUs, prices, maker labels, proposed colours, and generic furniture are fictional demo inputs rather than approved products.
- Single-photo area estimation is approximate and cannot replace measured drawings or a site survey.
- This version has no authentication, persistence, revision history, approval workflow, ERP integration, or archival server-generated PDF.
- Text descriptions and color swatches are weaker references than real manufacturer product photography.

## Key files

- `src/components/proposal/InteriorProposalApp.tsx` — complete bilingual workflow, state, schedule, and exports.
- `src/components/proposal/catalog.ts` — material, fixture, furniture, pricing, and translation data.
- `src/components/proposal/InteriorProposalApp.css` — responsive application styling, built on the ArchiX tokens.
- `src/styles/archix.css` — ArchiX design-system tokens and shared button utilities.
- `src/pages/api/generate-interior-preview.ts` — server-side Gemini request, prompt, validation, and error handling.
- `src/pages/api/estimate-room-surfaces.ts` — server-side Gemini vision request and structured surface-area validation.
- `src/pages/index.astro` — application entry point.
- `POC_RESEARCH.md` — current scope, architectural reasoning, limitations, and recommended production path.
