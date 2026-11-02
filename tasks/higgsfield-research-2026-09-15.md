# Higgsfield.ai — Sourced Product & API Map (for HÜE Prisma)

Research date: 2026-09-15. All facts below carry a source URL. "Not verified" = could not confirm from any primary or credible secondary source. Third-party sources are explicitly labeled **[3P]**; everything else is a Higgsfield-owned property (higgsfield.ai, docs.higgsfield.ai, github.com/higgsfield-ai, pypi.org package they publish).

> **Important caveat on methodology:** higgsfield.ai is a heavily JS-rendered marketing site. `WebFetch` renders it through a small summarizer model that sometimes could only see page `<meta>` tags (title/description) instead of full body content — this happened on `/pricing`, `/team-plan`, `/character`, `/kling-3.0` (partially), and a few others. Where that happened it's noted inline as "page did not render body content." I cross-checked those specific gaps against Higgsfield's own first-party blog posts and, only as a last resort, third-party roundup articles — never as the sole source for a hard number, per the task rules. Numbers that only appear in [3P] sources (and disagree slightly between sources) are flagged as ranges, not facts.

---

## 1. PRODUCT MAP

### 1.1 Structure of the app

Higgsfield's site sitemap (`https://higgsfield.ai/sitemap-marketing.xml`, `https://higgsfield.ai/apps/sitemap.xml`, fetched 2026-09-15) shows the product is organized as:

- **Core generators**: Image (Soul, Nano Banana, GPT Image, Seedream, FLUX, Recraft, Grok Imagine…), Video (Kling, Veo, Seedance, Wan, MiniMax/Hailuo H3, Sora 2, Gemini Omni Flash…)
- **Studios** (multi-step orchestrators built on top of the base models): Cinema Studio 4.0, Marketing Studio, Supercomputer (agentic), App Builder
- **~100 single-purpose "Apps"** at `higgsfield.ai/apps/*` (angles, zooms, shots, transitions, face-swap, outfit-swap, packshot/product-ad templates, ASMR templates, meme/sticker templates, etc.) — these are pre-built prompt+workflow combos ("templates/effects") layered on the base models, not separate models themselves.
- **Camera Controls**: a named library of 50+ camera-motion presets usable across supported video models.
- **Character / Soul ID**: persistent identity system.
- Voice/audio: TTS, voice cloning, lipsync (via Cinema Studio, Wan 2.7 auto‑lipsync, Kling 3.0 voice binding).
- Upscale/restore tools for image and video.
- MCP + CLI + Blender/Adobe/Figma plugins for pro workflows.

Source: [Higgsfield homepage](https://higgsfield.ai/) (fetched 2026-09-15, JS-rendered — only partial body returned, cross-checked against sitemap and sub-pages below); [apps sitemap](https://higgsfield.ai/apps/sitemap.xml).

### 1.2 Image models on Higgsfield

| Model (exact name on site) | Source page | Inputs | Outputs | Notes / prompt guidance |
|---|---|---|---|---|
| **Higgsfield Soul 2.0** (+ Soul ID) | [higgsfield.ai/soul-intro](https://higgsfield.ai/soul-intro) | Text-to-image; image reference (style/composition guide); Soul ID needs **~20 photos**, ~3 min training | Photorealistic images; 20+ curated aesthetic presets at launch; "Soul HEX" lets you extract a palette from a reference image | Marketed as "commercial use" allowed for outputs. Soul ID becomes a reusable "Reference Element" usable in Cinema Studio, Marketing Studio, Supercomputer, and in video models (Seedance 2.0, Kling 3.0) — per [SOUL ID blog post](https://higgsfield.ai/blog/SOUL-ID-Superior-Level-of-AI-Character-Consistency). |
| **Nano Banana Pro** / **Nano Banana 2 (Lite)** | [higgsfield.ai/nano-banana-pro-prompt-guide](https://higgsfield.ai/nano-banana-pro-prompt-guide); also engine behind [image-editing](https://higgsfield.ai/image-editing) | Text; reference image(s) (exact max count not stated on pages fetched — not verified) | 2K/4K examples shown on prompt-guide page (not stated as hard limits) | Higgsfield-published prompt-structure guidance: **Subject → Composition → Action → Location → Style**, command-line-style phrasing (drop "please"), explicit negative constraints, seed-locking for series consistency, naming camera gear (e.g. "full-frame cinema camera") for photorealism, quoting on-image text strings + naming the font. Nano Banana 2 is described as running on a "Gemini 3.0 reasoning engine" per the image-editing page fetch — **this specific claim (Gemini 3.0) could not be independently confirmed on a second page and should be treated as low-confidence**. |
| **GPT Image 2.5 / "GPT-2"** | [higgsfield.ai/gpt-2](https://higgsfield.ai/gpt-2) | Text; optional reference image(s); natural-language edit instructions (swap colors, move objects, extend background) | Native 4K (site claims this is an upgrade from a prior "GPT 1.5" 1536×1024 ceiling — GPT model version-naming here is Higgsfield's own labeling, not OpenAI's; treat "GPT 1.5/2.5" as Higgsfield product names, not official OpenAI names — **not verified against OpenAI's own naming**) | Claims >95% text-rendering accuracy incl. CJK; roughly 2x generation speed vs their prior "GPT 1.5" tier. |
| **Seedream 5.0** (ByteDance) / **Seedream 5.0 Pro** | [higgsfield.ai/seedream-5.0](https://higgsfield.ai/seedream-5.0) | Text; optional reference image(s); before/after image pairs for example-based edit transfer | Native 2K, up to 4K via AI upscaling | Site claims "real-time web search" grounding and multi-step physical/spatial reasoning. Commercial use explicitly allowed per this page. |
| **FLUX.2** (Black Forest Labs) / Flux Kontext | [higgsfield.ai/flux-2-intro](https://higgsfield.ai/flux-2-intro) | Text; structured JSON control (camera angle/lens/shot type/style/mood); HEX color input for exact palette control; multilingual prompts (Korean/Thai/French confirmed as examples) | High-resolution; exact pixel/aspect-ratio limits not stated on the page fetched — **not verified** | |
| **Grok Imagine / Grok Imagine 1.5** | pages exist at [higgsfield.ai/grok-imagine](https://higgsfield.ai/grok-imagine), [higgsfield.ai/grok-imagine-1.5](https://higgsfield.ai/grok-imagine-1.5) — **not fetched in depth this pass**, listed here for completeness from sitemap | — | — | Content not pulled — gap, see §5. |
| **Recraft V4.1 / "recraft-v4-styles"** | [higgsfield.ai/recraft-v4-styles](https://higgsfield.ai/recraft-v4-styles) — **not fetched in depth**, listed for completeness | — | — | Gap, see §5. |
| **Kling O1 Image**, **Cinematic Studio 2.5** (image mode), **OpenAI "Hazel"** | Named only in the Higgsfield CLI README's image-model list (see §3) | — | — | Names come from the CLI's model catalog, not cross-verified on a marketing page — treat as CLI-only confirmation. |

### 1.3 Video models on Higgsfield

| Model | Source page | Inputs | Outputs | Camera/motion controls | Prompt guidance / notes |
|---|---|---|---|---|---|
| **Kling 3.0** | [higgsfield.ai/kling-3.0](https://higgsfield.ai/kling-3.0) | Reference images for character/element consistency; text prompt including desired sound | Up to **15 seconds**, up to **4K**; **native audio** (dialogue, SFX, ambience generated with the video, not layered after) | **Up to 6 camera cuts in one generation** (shot size/perspective/movement definable per segment, auto-handled transitions/shot-reverse-shot); physics sim (cloth, hair, fluids, collisions, vehicle lean) | Voice binding locks a voice to a character across **5 languages** (English, Chinese, Japanese, Korean, Spanish) + regional accents. Exact credit cost and aspect-ratio list **not stated on the page fetched** — cross-referenced third-party estimate below. |
| **Google Veo 3.1** | [higgsfield.ai/veo3.1](https://higgsfield.ai/veo3.1) | Text-to-video; **1–3 reference images** for subject consistency (Standard model only); **start & end frame mode** (2 frames) | **1080p or 720p**; **4, 6, or 8 seconds**; **16:9 or 9:16**; **24 fps**; supports lip-synced speaking characters | 3 modes: Text-to-Video, Start&End-Frame, Multi-Image-Reference (up to 3 images) | |
| **Seedance 2.5** (ByteDance) | [higgsfield.ai/seedance/2.5](https://higgsfield.ai/seedance/2.5) | Text (subject/camera/lighting/mood/sound); **up to 50 multimodal reference inputs** (images + video clips) for characters/products/locations/style | Up to **30 seconds** in one continuous pass; native **1080p**, "native 4K capability" also claimed; any aspect ratio **9:16 to 21:9** | Region-level (masked) re-edit without full regeneration | Claims "~20% better prompt adherence" vs. prior Seedance version; synchronized ambience/foley/score "generated with the pixels, not glued on after." |
| **Seedance 2.0** | [higgsfield.ai/seedance/2.0](https://higgsfield.ai/seedance/2.0) — page exists, not deep-fetched this pass | — | — | — | Referenced elsewhere (credits blog, Cinema Studio) as a 5–15s native-audio model; treat version-specific specs here as gap, see §5. |
| **Wan 2.6 / Wan 2.7** | [higgsfield.ai/wan-2.6](https://higgsfield.ai/wan-2.6) | Reference image(s); text; **audio input or TTS script** for lip-sync | Up to **15 seconds** single pass; native audio; "phoneme-level" lip sync + facial micro-expression matching | — | Image-to-video avatar mode with auto lip-sync (Wan 2.7, per [ai-talking-avatar](https://higgsfield.ai/ai-talking-avatar) page). Resolution/aspect-ratio options **not stated on page fetched** — gap. |
| **MiniMax / Hailuo H3** | [higgsfield.ai/minimax/h3](https://higgsfield.ai/minimax/h3) | Up to **9 images + 3 video clips + 3 audio tracks per generation** (combined cap **12 files**); prompt up to **7,000 characters**; audio input must be paired with ≥1 image/video | **2K (1440px short edge)**, **24 fps**, duration **5–15s selectable per second**, aspect ratios **21:9, 16:9, 4:3, 1:1, 3:4, 9:16 + adaptive**; native stereo audio (score/dialogue/foley/ambience) | Instruction-based re-edit (character swap, background change, relight, object removal, dialogue rewrite) while keeping unedited regions stable | Supports voice transfer/cloning from a reference recording. |
| **Sora 2** | Pages exist: [higgsfield.ai/sora-2](https://higgsfield.ai/sora-2), [/sora-2-prompt-guide](https://higgsfield.ai/sora-2-prompt-guide), [/sora-video](https://higgsfield.ai/sora-video) — **not deep-fetched this pass** | — | — | — | Confirmed present as a model name via Enterprise page ("Sora 2, Veo 3.1" listed) and CLI catalog; prompt guide content not pulled — gap, see §5. |
| **Gemini Omni Flash** | [higgsfield.ai/gemini-omni-flash](https://higgsfield.ai/gemini-omni-flash) — page exists, not deep-fetched | — | — | — | Named in CLI catalog and homepage fetch; gap, see §5. |
| **Higgsfield Genjutsu** | [higgsfield.ai/genjutsu](https://higgsfield.ai/genjutsu) | — | — | — | Homepage describes it as "One upload in. Endless new visions out" — appears to be a Higgsfield-native transform/remix model. Not deep-fetched — gap. |
| **Cinema Studio 4.0** (orchestrator, not a single model) | [higgsfield.ai/cinematic-video-generator](https://higgsfield.ai/cinematic-video-generator) | Genre selector (General/Action/Epic/Drama/Comedy/Horror); camera-control hashtags (static/handheld/zoom/pan); **up to 50 references** (uploads, saved Elements, past takes); era/decade selector (stock+color grading); "AI Cast" (archetype/physique/outfit/emotion); location/prop placement; project brief | Up to **1 minute** per generation, finished/edited multi-shot scene, **native 4K** (no upscaling step) | "Pick the engine per shot" — runs Seedance and "other leading video models" underneath; Montage Pacing (Chaotic/Dynamic/Calm/Single Shot); "anti-slop" pipeline targeting plastic-skin/face-drift; color grading (temperature/contrast/presets) | Real-time co-directing/live collaboration; shared Elements library; "Mr. Higgs" AI assistant for shot planning/script breakdown. Priced "in credits by length, resolution and model" — no table on this page. |
| **Marketing Studio** (orchestrator) | [higgsfield.ai/marketing-studio-intro](https://higgsfield.ai/marketing-studio-intro) | Product via URL paste (auto-extract) or up to **5 photo uploads**; avatar: 40+ library options or Soul-2.0-generated custom avatar (site also says "100+ ready-to-use AI avatars" elsewhere on the page — both figures appeared in the fetch, likely different counts for different avatar categories, **not fully reconciled**); template or freeform scene description | 6 formats: product shots, UGC videos, ads, marketplace images, posters, motion graphics | 9 ad "modes": TV Spot, UGC, Tutorial, Product Review, Unboxing, UGC Virtual Try-On, Hyper Motion, Pro Virtual Try-On, Wild Card | Credit cost shown live on the generate button per the page's own text. |
| **Supercomputer** | [higgsfield.ai/supercomputer-intro](https://higgsfield.ai/supercomputer-intro) — page exists, not deep-fetched | — | — | — | Homepage describes it as "Agent powered by GPT-6 Astra" — **this "GPT-6 Astra" name is suspicious and could not be corroborated on any second page; flag as likely a WebFetch summarization artifact or an unusual internal codename. Do not treat as a real OpenAI model name.** See §5 gaps. |

### 1.4 Camera-motion / style presets

[higgsfield.ai/camera-controls](https://higgsfield.ai/camera-controls) (fetched 2026-09-15) lists **50+ named camera-motion presets**, grouped roughly as:
- Basic: Pan L/R, Tilt Up/Down, Zoom In/Out, Static
- Dolly family: Dolly In/Out/Left/Right, Super Dolly In/Out, Double Dolly, Dolly Zoom In/Out
- Elevated/rotational: Crane Up/Down/Over-the-Head, Arc Left/Right, 360 Orbit, Aerial Pullback, Flying Cam Transition
- Aggressive: Crash Zoom In/Out, Rapid Zoom In/Out, Whip Pan, Handheld, Head Tracking
- Time-based: Bullet Time, Hyperlapse/Timelapse (+ Glam/Human/Landscape variants), Low Shutter
- Perspective: Fisheye, Dutch Angle, 3D Rotation, Overhead, Object POV
- Cinematic/novelty: Hero Cam, Snorricam, Lazy Susan, YoYo Zoom, Robo Arm, Focus Change, Glam, Incline, Mouth In/Eyes In, Eating Zoom, Jib Up/Down, Road Rush, Car Chasing/Car Grip, Buckle Up, BTS, Through Object In/Out, FPV Drone, General

Per the same page, these presets are usable across **Kling, MiniMax/Hailuo, and Wan 2.5** — "though specific model compatibility details aren't exhaustively listed for each individual preset" (i.e., Higgsfield does not publish a full preset×model support matrix on this page).

### 1.5 Identity / character system

- **Soul ID**: personalization/identity model. Needs **~20 well-lit photos** from different angles; trains in ~3 minutes (per [Soul-intro](https://higgsfield.ai/soul-intro) and [SOUL ID blog](https://higgsfield.ai/blog/SOUL-ID-Superior-Level-of-AI-Character-Consistency)). Once trained it becomes a reusable "Reference Element" pluggable into Cinema Studio, Marketing Studio, Supercomputer, and video models (Seedance 2.0, Kling 3.0).
- A dedicated `/character` marketing page exists but returned only meta tags on fetch (JS-rendered, no body content retrieved) — **gap**.
- "Soul Cast" is referenced as an "AI Character Builder for Film" per search result title ([higgsfield.ai/soul-cast-intro](https://higgsfield.ai/soul-cast-intro)) — page not deep-fetched, **gap**.

### 1.6 Editing / restoration tools

- **Image editing / inpaint**: [higgsfield.ai/image-editing](https://higgsfield.ai/image-editing) — powered by **Nano Banana Pro** ("state-of-the-art inpainting… photorealistic textures") and **Nano Banana 2** (claimed "Gemini 3.0 reasoning engine" — low confidence, see 1.2). Inputs: JPG/PNG/WebP up to 4K, smart-brush mask tool, optional reference image, text prompt. No specific credit numbers published on this page.
- **Image upscaler**: [higgsfield.ai/ai-image-upscaler](https://higgsfield.ai/ai-image-upscaler) — 2x/4x/8x/16x scale factors; 8 enhancement modes (denoise, restore, sharpen, unblur, face-enhance, colorize, color-restore, compression-artifact removal); batch processing. Underlying model **not named** on the page.
- **Video upscaler**: [higgsfield.ai/ai-video-upscaler](https://higgsfield.ai/ai-video-upscaler) — up to **4K/8K**; denoise, stabilization, frame interpolation to **60/120 fps**, restoration, colorization, batch. Underlying model **not named**.
- **~100 "Apps"** (see sitemap list already fetched, `higgsfield.ai/apps/*`) cover face-swap, video-face-swap, outfit-swap, character-swap, background removal (image + video), object/text removal from video/image, expand-image (outpaint), relight, skin-enhancer, packshot/product-ad templates, ASMR templates (classic/host/promo/add-on), transitions, angles, zooms, shots, "what's-next" (8 narrative branches from one image), color grading, virality predictor, and many meme/effect templates (mascot, comic-book, renaissance, 3D-figure, pixel-game, etc.). These are pre-built prompt/workflow wrappers, not new base models.

### 1.7 Ads / lipsync / voice tools

- **Talking-avatar / lipsync**: [higgsfield.ai/ai-talking-avatar](https://higgsfield.ai/ai-talking-avatar). Powered by Cinema Studio 3.0 (per this page — note this conflicts in version number with the 4.0 named on the dedicated Cinema Studio page; Higgsfield may be mid-rollout of 4.0 while some pages still reference 3.0 — **flagged discrepancy**), Seedance 2.0, Veo 3.1 (up to 4K, "strongest character consistency across episodes"), Kling 3.0 (per-shot camera control for multi-character dialogue), Wan 2.7 (auto lip-sync). TTS default voice: **ElevenLabs**; voice cloning via **MiniMax** and **VibeVoice**. Claims **74+ languages** with frame-accurate per-language lip sync. Outputs: MP4, 9:16 / 1:1 / 16:9, up to 4K.
- **Marketing Studio** ad tools — see §1.3 table.

---

## 2. PRICING

**Primary source note:** `higgsfield.ai/pricing` is fully client-side rendered — `WebFetch` only returned the page's `<meta>` title/description ("Explore pricing and choose a plan that fits your creative goals…"), no plan table. I could not get the JS-rendered plan grid through WebFetch, and per task rules I did not use a browser/login to bypass this. The `geo.higgsfield.ai` pricing subdomain link found in search results returned **HTTP 404** on fetch, so it is not usable either.

### 2.1 What IS confirmed from a first-party page

Higgsfield's own blog post **["AI Video Credits Explained"](https://higgsfield.ai/blog/ai-video-credits-explained)** (fetched 2026-09-15, no publish date visible in the fetch) states, verbatim/paraphrased:

- "Credit cost isn't one number — it's a multiplication of three variables that each move the price independently": **duration × resolution × model**.
- "Resolution tends to be the single biggest multiplier… moving from 720p to 1080p, or 1080p to 4K, adds real computational cost."
- Worked examples given on that page (their numbers, credits and USD as shown):

| Spec | Kling 3.0 | Wan 2.7 | Seedance 2.0 | Cinema Studio |
|---|---|---|---|---|
| 5s @ 720p | 10 credits ($0.50) | 8 credits ($0.40) | 23 credits ($1.15) | 25 credits ($1.25) |
| 10s @ 1080p | 25 credits ($1.25) | 25 credits ($1.25) | 90 credits ($4.50) | 100 credits ($5.00) |

- Plan credit allocations named on that page: **Basic 120 / Plus 1,000 / Ultra 3,000** credits.
- Implied credit value from this table: **$0.05/credit** (used consistently across all cells above).

**Note the discrepancy:** this $0.05/credit and these plan sizes (Basic 120, Plus 1,000, Ultra 3,000) do not exactly match the numbers reported by third-party roundups (below), which describe Starter 270 / Plus 1,200 / Ultra 3,000 credits and ~$0.047–$0.0625/credit. This could reflect a pricing change between when the blog post and the third-party articles were written, region/currency differences, or first-purchase vs. renewal pricing. **Treat plan sizes and $/credit as moving targets that must be re-verified at integration time directly on `higgsfield.ai/pricing` in a real browser.**

Also from Higgsfield's own `/enterprise` page (fetched 2026-09-15, rendered fully):
- Enterprise = **credit-based pricing on annual contracts with monthly payment**, scaled to team size/volume.
- "Credits pool across teams, roll over, and don't expire" (enterprise tier only — this explicitly contradicts the individual-plan behavior below, where credits do NOT roll over).
- Sales-consultation-only pricing (no published number).
- "50+ AI models," "250+ VFX presets and camera controls."
- Native plugins: Adobe Premiere Pro, After Effects, Photoshop; DaVinci Resolve; Figma.
- Dedicated GPU capacity ("10x concurrent generations"), dedicated account manager, private Slack channel, "AI Educator" onboarding.
- No model training on customer data (contractual guarantee); full IP ownership + indemnification of outputs.

`/team-plan` page (fetched 2026-09-15) rendered only feature bullets, no numbers: shared workspaces, role-based permissions, real-time collaboration, "50+ state-of-the-art models," SOC 2-aligned, GDPR-compliant. **No price shown.**

### 2.2 What is secondary-only [3P] — cross-checked across multiple independent articles, still not primary-confirmed

Multiple independent third-party pricing round-ups (Creatify, Blotato, imagine.art, layer3labs, aiforesight360, techsifted — all dated "2026," fetched via search 2026-09-15) converge on:

- **Starter**: $19/mo, 270 credits
- **Plus**: $59/mo (or $47/mo first-year annual), 1,200 credits
- **Ultra**: $129/mo (or $99/mo annual), 3,000 credits
- Credit packs: 80 credits/$5 up to 1,700 credits/$80 (≈$0.047–$0.0625/credit), valid 90 days
- Monthly subscription credits do **not** roll over (lost at renewal) — this matches the FAQ tone but is stated most explicitly in [3P] sources.
- Video generation concurrency: Free=1 concurrent, Starter=2, up to Ultra=8 [3P — single source, not cross-confirmed].
- Rough per-generation credit costs reported across [3P] sources (numbers vary between articles, given as ranges): Nano Banana Pro ≈2 credits base / 4 credits at 4K; Seedream 5.0 Lite 2K ≈6 credits (~$0.06); Kling 3.0 ≈6–10 credits per video (this range spans both the official blog's 10-credit/5s-720p figure and third-party "6 credits" estimates — likely different duration/resolution combos being compared); Seedance 2.0 5s clip ≈22–25 credits at 720p, ≈45–90 credits at 1080p; Veo 3.1 and Sora 2 ≈40–70 credits per generation [3P, unverified against a primary table].

**Bottom line for Prisma's cost-modeling purposes:** the *shape* of the pricing (credits = duration × resolution × model-tier, no rollover on subscription plans, enterprise pools/rolls over) is confirmed first-party. The *exact current numbers* are not reliably fetchable via automated tools right now because the pricing page is JS-only — this needs a live human check on `higgsfield.ai/pricing` before any budget commitment.

### 2.3 Commercial-use terms

- Soul 2.0 outputs: "available for commercial use" — [soul-intro](https://higgsfield.ai/soul-intro).
- Seedream 5.0 outputs: usable for "marketing, advertising, and product photography" — [seedream-5.0](https://higgsfield.ai/seedream-5.0).
- General account terms ([higgsfield.ai/trust](https://higgsfield.ai/trust)): "You hold all necessary rights for your uploaded content and likenesses, as confirmed by our media upload agreement"; each creator is solely responsible for use/distribution/rights of generated output; generated work "may include Higgsfield watermarks"; platform-commissioned material carries "#HiggsfieldPartner" labeling.
- Enterprise: full IP ownership of outputs plus indemnification (per `/enterprise`).

---

## 3. API

### 3.1 Status, docs, base URL, auth

- **Docs**: [docs.higgsfield.ai/docs](https://docs.higgsfield.ai/docs) (fetched 2026-09-15). Structure confirmed via the page's own nav plus its `llms.txt`: Quickstart, How-to (Introduction, SDK), Concepts (Requests, File uploads), Organizations (Managing members), Help (Support, FAQ). An OpenAPI spec is referenced at `/docs/openapi.json` but was **not fetched/verified this pass** (gap).
- **Status**: The docs present the API as live/generally usable (no "beta"/"waitlist" banner text captured in any fetch) — but I could not find an explicit "GA" statement either. **Not verified either way; treat as live-but-unlabeled.**
- **Base URL**: `https://api.higgsfield.ai` (confirmed directly in the Quickstart page fetch).
- **Auth**: API key pair, header format `Authorization: Key ${HF_API_KEY_ID}:${HF_API_KEY_SECRET}`. Keys are created/managed in **Higgsfield Cloud** at `cloud.higgsfield.ai` (per FAQ: "create a cloud.higgsfield.ai account → generate API credentials → follow Quickstart"). No OAuth flow mentioned anywhere.
- **Organizations**: API key/credential management is scoped to an "Organization" with member management (`/docs/organizations.md`, `/docs/organizations/managing-members.md`) — content of those specific pages not deep-fetched (gap).

Source: [docs.higgsfield.ai/docs](https://docs.higgsfield.ai/docs), [docs.higgsfield.ai/docs/quickstart](https://docs.higgsfield.ai/docs/quickstart), [docs.higgsfield.ai/docs/help/faq](https://docs.higgsfield.ai/docs/help/faq).

### 3.2 Request pattern (confirmed via Quickstart page, verbatim structure)

Submit:
```
POST https://api.higgsfield.ai/higgsfield-ai/soul/v2/standard
Authorization: Key ${HF_API_KEY_ID}:${HF_API_KEY_SECRET}
Content-Type: application/json

{ "prompt": "A quiet alpine lake at sunrise, editorial photography" }
```
Immediate response (queued):
```json
{
  "status": "queued",
  "request_id": "d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff",
  "status_url": "https://api.higgsfield.ai/requests/d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff/status",
  "cancel_url": "https://api.higgsfield.ai/requests/d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff/cancel"
}
```
Completed response includes an `images` (or presumably `videos`) array of `{url: ...}` objects. (Example shown used `images`; a video-model equivalent field was not directly captured — likely `videos`, **not verified**.)

The docs explicitly instruct: **"Use the URLs from the response instead of constructing them manually"** for status/cancel calls — i.e., don't hardcode `/requests/{id}/status` yourself even though the pattern is guessable.

Source: [docs.higgsfield.ai/docs/quickstart](https://docs.higgsfield.ai/docs/quickstart).

### 3.3 Async lifecycle / job states

Per [docs.higgsfield.ai/docs/concepts/requests](https://docs.higgsfield.ai/docs/concepts/requests):

- **`queued`** — non-terminal, "waiting to start and may still be canceled."
- **`in_progress`** — non-terminal, "can no longer be canceled."
- **`completed`** — terminal, output URLs available.
- **`failed`** — terminal, error occurred.
- **`nsfw`** — terminal, "input or output was rejected by content moderation."
- **`canceled`** — terminal, canceled before processing started.
- Cancellation only works during `queued`; once `in_progress`, cancel calls return **`400 Bad Request`**.
- **Output URL retention: "at least seven days"** — download to your own storage for anything you need longer-term. This is repeated identically on the FAQ page.
- The doc supports both **polling** (via `status_url`) and **webhooks** ("receive terminal generation results without continuous polling") — exact webhook payload shape and the webhook-registration parameter name were **not captured in the fetch** (the SDK README calls it `webhook_url` as an optional argument to `subscribe()` — see §3.5 — but the raw HTTP webhook contract itself is a gap, see §5).
- Polling guidance exists ("avoid unnecessary load or duplicate generations") but a specific recommended interval/backoff number was **not captured** — gap.

### 3.4 File / reference-image uploads

Per [docs.higgsfield.ai/docs/concepts/file-uploads](https://docs.higgsfield.ai/docs/concepts/file-uploads):

- Two supported input paths for reference images/audio/video: **(a)** a public HTTPS URL you already host, passed as `public_url` in the model's parameters, or **(b)** Higgsfield's own upload flow: `POST https://api.higgsfield.ai/files/generate-upload-url` → returns a **presigned `upload_url`** → you `PUT` the file bytes directly to that presigned URL.
- Explicit security note: **"Do not send Higgsfield API credentials to the presigned storage URL"** — the presigned PUT is unauthenticated by design (it's a short-lived signed S3-style URL).
- Accepted formats confirmed in the fetch: **image/jpeg, image/jpg, image/png, image/webp, image/gif**; **audio/wav, audio/x-wav**; **video/mp4**.
- Size limits and max reference-image count per model were **not stated on this page** — gap (models pages give some hints, e.g. Veo 3.1 = 1–3 images, MiniMax H3 = up to 9 images/3 video/3 audio/12 files combined, Seedance 2.5 = up to 50 multimodal references, Cinema Studio = up to 50 references — these are the closest confirmed per-model caps, sourced from each model's own page in §1).

### 3.5 SDKs

- **Python**: `pip install higgsfield-client` — PyPI page confirms **version 0.1.0**, released **2025-11-17**, requires Python ≥3.8. ([pypi.org/project/higgsfield-client](https://pypi.org/project/higgsfield-client/), fetched 2026-09-15). GitHub source: [github.com/higgsfield-ai/higgsfield-client](https://github.com/higgsfield-ai/higgsfield-client) ("Python SDK for Higgsfield API").
  - Auth via env vars: `HF_KEY="key:secret"` or separate `HF_API_KEY`/`HF_API_SECRET`.
  - Core call: `higgsfield_client.subscribe('bytedance/seedream/v4/text-to-image', arguments={...})` (sync) and `subscribe_async(...)` (async, via `asyncio`).
  - `poll_request_status()` for manual polling; states named: Queued, InProgress, Completed, Failed, NSFW, Cancelled.
  - Optional `webhook_url` argument on `subscribe()` triggers a callback on completion instead of polling.
  - Upload helpers: `upload()`, `upload_file()`, `upload_image()` (accepts PIL Images), with async variants.
  - **Confirmed model-endpoint string**: `bytedance/seedream/v4/text-to-image` — note this uses a different naming scheme (`vendor/model/version/task`) than the Quickstart's example endpoint (`/higgsfield-ai/soul/v2/standard`), implying endpoint paths vary per model/vendor rather than following one universal template. **Important for Prisma:** you cannot assume one URL pattern for all models — each model's exact path must be looked up individually (presumably documented per-model in pages under `/docs/models/...`, which I did not enumerate — gap, see §5).
- **Node/TypeScript**: `@higgsfield/cli` (official CLI) confirmed to exist on npm; a search result also surfaced `@higgsfield/client` but flagged it as "last published 14 years ago" which is almost certainly a search-snippet date-parsing artifact (Higgsfield the company didn't exist 14 years ago — founded 2023) — **do not trust that specific age claim; the package's real state is unverified** (npm fetch for `@higgsfield/cli` itself returned HTTP 403 and could not be read directly).
- **CLI** (`@higgsfield/cli`, source at [github.com/higgsfield-ai/cli](https://github.com/higgsfield-ai/cli)): generates images/video/3D/audio using, per its own README, **40+ Higgsfield AI models**. Auth: `higgsfield auth login` / `logout`, described as short-lived tokens needing periodic re-auth. Commands: `higgsfield generate create <model> [params] --wait`, `generate get <job_id>`, `generate list`, `generate cost <model> [params]` (cost estimation before running!), plus `workflow` subcommands for saved multi-step flows. Common flags: `--prompt`, `--aspect_ratio`, `--resolution` (2k/1080p/720p), `--duration`, `--voice_type`/`--voice_id`, `--wait`, `--json`.
  - CLI's own model catalog (README, fetched 2026-09-15) names, verbatim as listed:
    - Image (23 models): Nano Banana Pro, Nano Banana 2 Lite, FLUX.2, Flux Kontext, GPT Image 2.5, Higgsfield Soul V2, Seedream 4.5, Grok Image, OpenAI Hazel, Recraft V4.1, Kling O1 Image, Cinematic Studio 2.5, "and others" (full list of 23 not enumerated in the fetch — gap).
    - Video (22 models): Gemini Omni Flash, Google Veo 3.1, Kling v3.0, Seedance 2.5, Wan 2.7, Grok Video, Cinematic Studio 3.0, Marketing Studio Video, "and others" (full list of 22 not enumerated — gap).
    - 3D (5 models): Multi-Image-to-3D, Image-to-3D, Text-to-3D, 3D Objects, 3D Rigging.
    - Audio (5 models): Seed Audio, Sonilo Music, Text-to-Audio, Text-to-Speech, Inworld Text-to-Speech.
  - **Note the version drift inside Higgsfield's own materials**: the CLI README says "Seedream 4.5," the marketing pages say "Seedream 5.0/5.0 Pro"; the CLI says "Cinematic Studio 2.5/3.0," the marketing page says "Cinema Studio 4.0." This strongly suggests the CLI README is not kept in lockstep with the current marketing-site model roster — **when integrating, always confirm the exact current model-endpoint string via `higgsfield generate cost <model>` or the docs, not from any single page.**
- **GitHub org** [github.com/higgsfield-ai](https://github.com/higgsfield-ai) — 9 repos, notably `higgsfield` (unrelated GPU-orchestration/ML-training framework — pre-dates or is separate from the consumer product, do not confuse with the API), `cli`, `higgsfield-client`, `skills` ("train a Soul Character — a reusable, face-faithful identity model" — not deep-fetched, gap).

### 3.6 Rate limits, pricing per call, moderation, failures

- **Rate limits**: FAQ states limits "depend on subscription tier and model usage," checkable via the Higgsfield Cloud dashboard — **no concrete numbers published anywhere I could find**. Gap.
- **Price per call**: not exposed as a flat API price list; it's the same credit system as the app (see §2), and the CLI explicitly supports `generate cost <model> [params]` to quote a job's credit cost before running it — confirming the same "priced in credits, shown before you commit" pattern the web app uses.
- **Failed/NSFW jobs are not charged**: FAQ, verbatim: *"Failed generation requests are not charged to your account"* and *"Requests flagged as NSFW are not charged to your account... Flagged requests receive automatic credit refunds."*
- **Content moderation**: "Content moderation is applied at the model level – each model scans prompts, reference images, and outputs through its own filtering logic" ([higgsfield.ai/trust](https://higgsfield.ai/trust)). Standards vary per model (FAQ). No published list of prohibited categories/keywords was found — gap.
- **Enterprise billing**: invoice-based option available, contact support@higgsfield.ai (FAQ).
- **Support channels**: support@higgsfield.ai; dashboard at cloud.higgsfield.ai; docs at docs.higgsfield.ai.

---

## 4. WHAT PRISMA COULD DO WITH THE API — ANALYSIS (not sourced; my own assessment)

This section is my analysis, not a factual claim about Higgsfield.

1. **Direct generation from a compiled prompt.** Once Prisma compiles a final prompt object (brief → model-specific prompt), it could POST straight to the relevant `api.higgsfield.ai` model endpoint instead of asking a designer to paste it into the Higgsfield UI. Because the endpoint path/parameter shape differs per model (confirmed in §3.5 — Quickstart's `soul/v2/standard` vs. the SDK's `bytedance/seedream/v4/text-to-image`), Prisma would need a small per-model adapter/config table rather than one generic call — this maps naturally onto the "model registry" HÜE Prisma likely already needs to track per-model prompt syntax and limits (aspect ratio, duration, reference-image counts, etc. from §1's tables).
2. **Sending brand reference images automatically.** Prisma already manages brand/tool reference assets (per the project's F6a Prisma work in memory). It could either host those images at a stable public URL and pass `public_url`, or push them through Higgsfield's presigned-upload flow (`/files/generate-upload-url` → `PUT`) at generation time — avoiding a UI copy-paste step for designers. The presigned-URL path is preferable for private/unpublished brand assets since it doesn't require making them publicly reachable.
3. **Pulling results back for automatic comparison.** Since output URLs are guaranteed live for "at least 7 days" (§3.3), Prisma could poll `status_url` (or register a `webhook_url` if going through the Python SDK's pattern) and, on `completed`, fetch and store the output in Prisma's own storage (Supabase) before the 7-day window closes — turning "designer manually downloads and uploads to Prisma" into an automatic loop, and enabling side-by-side comparisons across models for the same brief.
4. **Batch variants/formats.** Because job submission is async and stateless per request, Prisma could fan out one compiled prompt into N parallel jobs (e.g., same prompt across Kling 3.0 / Veo 3.1 / Seedance 2.5, or across multiple aspect ratios for the same model) and reconcile them by `request_id` — a natural fit for a "generate all size variants for this campaign" feature. The CLI's `generate cost` pattern suggests Higgsfield expects users to price-check before batch-firing many jobs; Prisma should replicate that cost-preview step to avoid runaway credit spend from a batch action.
5. **Cost controls.** Given credits are priced by `duration × resolution × model` (confirmed, §2.1) and NSFW/failed jobs are auto-refunded (confirmed, §3.6), Prisma's API integration should: (a) surface an estimated credit cost to the designer before submission (mirroring the CLI's `generate cost` and the web app's "cost shown on the Generate button" pattern), (b) cap default resolution/duration in auto-generated requests unless a human explicitly asks for the expensive tier, and (c) treat `nsfw`/`failed` terminal states as "no charge, but still notify the designer their brief was rejected" rather than silent retries, since repeated resubmission of the same flagged prompt will keep failing for the same content-policy reason.
6. **Prompt-writing implications for Prisma today (before any API work).** Because Higgsfield publishes real prompt-structure guidance only for a subset of models (confirmed so far: Nano Banana Pro's Subject/Composition/Action/Location/Style structure, FLUX.2's structured-JSON + HEX-color control, Seedream 5.0's "handles complex detailed prompts, spatial layout and technical photography terms well"), Prisma's per-model prompt templates should explicitly branch on these documented conventions rather than using one generic prompt style for every model — e.g. FLUX.2 prompts should be able to emit a structured JSON block, Nano Banana prompts should follow the five-part structure and encourage negative constraints, and video models with named camera-motion presets (Kling, MiniMax/Hailuo, Wan 2.5 per §1.4) should let Prisma insert an exact preset name (e.g. "Dolly Zoom In") rather than describing camera movement in prose, since Higgsfield's own UI treats these as discrete selectable presets, not free text.

---

## 5. GAPS — could not verify

- **Exact current pricing-page numbers** (`higgsfield.ai/pricing`): page is fully client-rendered; only meta tags were retrievable. Plan prices/credit counts here rely on third-party sources that disagree with Higgsfield's own blog example numbers (§2.1 vs §2.2) — needs a live human check.
- **`geo.higgsfield.ai` pricing subdomain**: returned HTTP 404 on fetch — dead or gated link, not a usable source.
- **Full model-by-model credit-cost table** beyond the four models shown in the "AI Video Credits Explained" blog post (Kling 3.0, Wan 2.7, Seedance 2.0, Cinema Studio) — no equivalent table found for Veo 3.1, Sora 2, MiniMax H3, Nano Banana, GPT Image, Seedream, FLUX.2, etc.
- **OpenAPI spec** at `docs.higgsfield.ai/docs/openapi.json` — referenced by the docs but not fetched; would likely resolve most of the remaining API gaps below in one shot.
- **Per-model API endpoint paths beyond the two examples captured** (`higgsfield-ai/soul/v2/standard`, `bytedance/seedream/v4/text-to-image`). No enumerated list of all model endpoint slugs was found.
- **Webhook payload schema** (headers, body shape, retry behavior, signature/verification) — only the existence of a `webhook_url` parameter is confirmed, not its contract.
- **Rate limit numbers** (requests/minute, concurrent-job caps per plan) — FAQ says they exist and vary by tier but publishes no numbers.
- **Reference-image/video count and file-size limits at the platform level** (the file-uploads doc page didn't state them; only individual model pages gave per-model hints, which vary widely — 1–3 for Veo, up to 9 images/3 video for MiniMax H3, up to 50 for Seedance 2.5 and Cinema Studio).
- **Whether the API is officially "GA," "beta," or invite/waitlist-gated** — no explicit status label found on any fetched page.
- **Grok Imagine / Grok Imagine 1.5, Recraft V4.1, Sora 2, Gemini Omni Flash, Genjutsu, Soul Cast, Seedance 2.0, App Builder, "Supercomputer" pages** — these pages exist (confirmed via sitemap/search) but were not deep-fetched for full specs in this pass; treated as named-only in §1.
- **"GPT-6 Astra"** (claimed to power Supercomputer) and **"Gemini 3.0 reasoning engine"** (claimed to power Nano Banana 2) — both single-source claims from partially-rendered page fetches that could not be corroborated elsewhere. Flag both as **low-confidence and possibly fetch/summarization artifacts** rather than confirmed model names — do not repeat these as fact without re-verifying directly on the live rendered page.
- **Full 23-item image-model list and 22-item video-model list** referenced by the CLI README — the README fetch only surfaced partial lists ("...and others").
- **`@higgsfield/client` npm package** — could not confirm its actual publish recency; a search snippet's "14 years ago" claim is almost certainly wrong/an artifact and was not independently checked against npm directly (that npm fetch returned HTTP 403).
- **Concurrency limits by plan tier** (e.g. "1 concurrent on Free up to 8 on Ultra") — single third-party source only, not cross-confirmed or found on a Higgsfield page.
- **Marketing Studio avatar counts**: page text gave both "40+ library options" and "100+ ready-to-use AI avatars" in the same fetch without reconciling whether these refer to the same or different avatar sets.
- **Cinema Studio version number conflict**: dedicated page says 4.0; the talking-avatar page says Cinema Studio 3.0 powers lipsync. Not reconciled — possibly a rollout-in-progress or an unupdated secondary page.

---

## SOURCES

**Higgsfield first-party (primary):**
- https://higgsfield.ai/
- https://higgsfield.ai/sitemap.xml, /sitemap-marketing.xml, /sitemap-projects.xml, /apps/sitemap.xml
- https://higgsfield.ai/pricing (meta-only, JS-rendered)
- https://higgsfield.ai/team-plan (meta/feature bullets only)
- https://higgsfield.ai/enterprise
- https://higgsfield.ai/trust
- https://higgsfield.ai/soul-intro
- https://higgsfield.ai/blog/SOUL-ID-Superior-Level-of-AI-Character-Consistency
- https://higgsfield.ai/nano-banana-pro-prompt-guide
- https://higgsfield.ai/image-editing
- https://higgsfield.ai/gpt-2
- https://higgsfield.ai/seedream-5.0
- https://higgsfield.ai/flux-2-intro
- https://higgsfield.ai/kling-3.0
- https://higgsfield.ai/veo3.1
- https://higgsfield.ai/seedance/2.5
- https://higgsfield.ai/wan-2.6
- https://higgsfield.ai/minimax/h3
- https://higgsfield.ai/camera-controls
- https://higgsfield.ai/apps/camera-motion
- https://higgsfield.ai/ai-talking-avatar
- https://higgsfield.ai/ai-image-upscaler
- https://higgsfield.ai/ai-video-upscaler
- https://higgsfield.ai/cinematic-video-generator
- https://higgsfield.ai/marketing-studio-intro
- https://higgsfield.ai/blog/ai-video-credits-explained
- https://higgsfield.ai/character (meta-only, JS-rendered, no body content retrieved)
- https://higgsfield.ai/creator-hub/help-center
- https://docs.higgsfield.ai/docs
- https://docs.higgsfield.ai/docs/quickstart
- https://docs.higgsfield.ai/docs/concepts/requests
- https://docs.higgsfield.ai/docs/concepts/file-uploads
- https://docs.higgsfield.ai/docs/help/faq
- https://docs.higgsfield.ai/docs/llms.txt (returned table-of-contents only, not full body)
- https://github.com/higgsfield-ai (org page)
- https://github.com/higgsfield-ai/higgsfield-client (Python SDK README)
- https://github.com/higgsfield-ai/cli (CLI README)
- https://pypi.org/project/higgsfield-client/

**Attempted but failed/unusable:**
- https://geo.higgsfield.ai/higgsfield-ai-pricing-and-plans-2026 — HTTP 404
- https://higgsfield.ai/pricing?type=private — meta-only, no body
- https://www.npmjs.com/package/@higgsfield/cli — HTTP 403 on fetch

**Third-party [3P] — secondary, used only for cross-reference on pricing/credit figures, never as sole source for a hard number:**
- https://creatify.ai/blog/higgsfield-pricing-(2026)-plans-and-what-you-ll-actually-pay
- https://www.blotato.com/blog/higgsfield-pricing
- https://www.imagine.art/blogs/higgsfield-ai-pricing
- https://flowith.io/blog/higgsfield-pricing-2026-free-vs-creator-vs-studio/
- https://www.layer3labs.io/guides/higgsfield-ai-pricing
- https://aifunnelinsider.com/higgsfield-ai-review-2026/
- https://aiforesight360.com/higgsfield-ai-pricing/
- https://techsifted.com/roundups/higgsfield-ai-pricing-2026/
- https://www.yangsweb.com/blog/higgsfield-ai-review-alternatives-pricing
- https://en.wikipedia.org/wiki/Higgsfield_AI (company background only: founded 2023, founders Alex Mashrabov and Erzat Dulat — not used for any product/API/pricing fact)
