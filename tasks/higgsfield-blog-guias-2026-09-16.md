# Higgsfield Blog — Guides Research for HÜE Prisma

Read-only research notes. All facts sourced with URLs. "Not verified" used where uncertain.

---

## 1. PER-MODEL NOTES

### Seedance 2.5 (video)
Source: https://higgsfield.ai/blog/seedance-2-5-prompting-guide

**Spec**: ByteDance model. Clips up to 30 seconds. Native audio generated in same pass. Up to 50 multimodal reference images per generation (lock face/outfit/location/palette). Region editing (fix one spot without full re-render). Native resolution up to 1080p. Aspect ratio any ratio 9:16 to 21:9. Holds identity/wardrobe/lighting across shots from a single reference.

**Prompt structure (the core template — this is the single most reusable finding)**: one continuous block of text, broken into labeled sections, in this order:
1. **GLOBAL STYLE** — genre, color grade, film stock/digital look, aspect ratio, shutter behavior, and what should NOT appear. Everything after must match it.
2. **SCENE** — one-line logline: what's happening, where, mood. Save detail for later.
3. **CHARACTERS** — every person: face, hair, build, wardrobe. If a reference image covers it, just say which reference = which character.
4. **LOCATION** — the space and props, separate from people. A vague location is the #1 cause of drift across cuts in multi-shot sequences.
5. **FIRST FRAME AND BLOCKING** — exact starting positions (who's where, facing which direction) right as the clip begins. Gives the model a fixed anchor before motion starts.
6. **Shot-by-shot breakdown** — label "Shot 1", "Shot 2"... each with shot type + action in 1-2 sentences, ending "Hard cut" where a cut belongs. Pacing is built here, not in a separate field.
7. **OPTICS and CAMERA** — lens/camera movement per shot: focal length, camera height, handheld/dolly/crane.
8. **PHYSICS** — how fabric, smoke, hair, liquid should move (things that look wrong moving like solids).
9. **LIGHTING** — goes further than GLOBAL STYLE: source, direction, how it falls on faces/surfaces.
10. **AUDIO** — comes last: ambient noise, specific SFX, and what should NOT be there (usually "No music, no discernible dialogue" unless scene needs it).

Rule of thumb quoted: "one visual rule at the top, one sound rule at the bottom, everything in between broken into shots."

**Vocabulary/techniques observed working across the 10 tested prompt categories** (drama, action, commercial, epic landscape, noir, multi-character/K-pop, fantasy action, UGC-style ad, horror, documentary):
- Precise **timecodes** for events ("1.2s, WAVE 1 strikes...") — an "event track" for anything repetitive (waves, gusts) so it's not static texture.
- **Lens lock per segment** stated in diagonal field-of-view degrees (e.g., "LENS LOCK SEGMENT 2: 29° diagonal FOV, short telephoto, camera 4-6m") plus a "no lens drift mid-segment" instruction.
- **Screen direction / continuity locks**: explicit left-right blocking with % coordinates (x 42%, head at y 44%), and a rule like "they never swap sides."
- **STILLNESS LOCK / POSITIVE LOCKS** sections at the end restating hard constraints (who never moves, what never happens) — used repeatedly as a final guardrail block.
- **"No blood anywhere" / stylized-death rules** for fantasy: describe exactly what happens instead (glow, sparks, ash) so the model has one consistent mechanic.
- **Combat grammar constraint**: "she only cuts, never stabs" — giving the model one repeatable action grammar instead of varied ones.
- **Member-count lock** for group/crowd scenes: "exactly four members, never five... no duplicated member" — prevents AI from spawning extra people.
- **Dual-quality system** for mixed footage looks: tag each beat [FILM] vs [REPORTER CAM] (degraded phone/helicopter look) and state they never blend within one shot.
- **UGC formula**: vertical 9:16, 24fps, "shot on iPhone 14 Pro," fixed handheld selfie framing for the whole video, described phone wobble/refocus, "understated... no performing," background extras each independently animated ("nobody looks at her or the camera, nobody reacts in sync"), fixed seating/product geometry, dialogue broken into segment-labeled beats with exact lines.
- Camera language used a lot: "hard cut," "match cut on round shapes/through eyes," "orbit," "push-in," "dolly," "whip-pan," "ramps to slow motion... snaps back."
- Texture/anti-plastic language repeatedly used to defeat "AI sheen": "photoreal documentary-plate realism," "light authentic 35mm film grain," "gentle gate weave," "halation bloom," "chromatic aberration at edges," "NOT 3D-render, NOT plastic CGI sheen, NOT glossy synthetic, NOT video-game look."
- Skin: "pore-level realism... no over-retouching, the non-glamour of photoreal action."

Short Higgsfield example prompts (verbatim, <40 words, marked as HF examples):
- "Shot on IMAX 15-perf 65mm color negative with Panavision System 65 anamorphic optics, 2x horizontal squeeze, unsqueezed in post." (optics lock line)
- "No music, no narration, no subtitles. The two scripted lines are the only words." (audio lock line)

### Seedance 2.0 (video)
Source: https://higgsfield.ai/blog/seedance-prompting-guide

Different approach from 2.5: organized by **viral format templates** rather than one master structure. Core rule: **always state shot structure upfront** — number of shots, total duration, aspect ratio, at the top of the prompt.

Formats and their recipes:
- **Transformations**: number each shot; give an explicit escalation arc **calm → threat → transformation → aftermath**. Pro tip: for realism on monsters/skin, add "no 3D, no cartoon, no VFX" to force ultra-realism if output looks plasticky. Pro tip: "add a visual gag in the background" lets the model invent comedy beats without describing them.
- **Orbs** (single continuous first-person POV shot): formula = one shot, first-person POV, hyper-chaotic handheld motion, 15s. Only the power/environment/enemy changes. Pro tip: put inline VFX cues in brackets, e.g. `[VFX: branching electric circuits pulsing with white-blue current]`, embedded directly in the action line rather than a separate field.
- **POVs**: lock the perspective and never break it. Pro tip: explicitly state what the camera is **not** doing — "no cuts, no zoom, natural head movement" — otherwise Seedance defaults to cutting between angles and the POV illusion breaks.
- **Fights**: need a clear location, a clear power mismatch, and a defined escalation arc; describe choreography beat-by-beat, Seedance executes what's written literally.
- **Animation**: break the 15s into explicit timed segments (0-3s, 3-6s...); use a keyframe image as style + reference via `@image is the first keyframe and style reference`; state the animation aesthetic in the opening line; describe physics (particle sim, dust, energy VFX) as precisely as character actions.

Example short prompt (HF example, verbatim, under 40 words): "A single-frame POV video of a medieval knight riding a horse with a sledgehammer in his hands, riding and fighting epically, smashing his opponents with a sledgehammer while riding a horse, to make it look realistic with blood." — shown as proof that minimal prompts can also work well; "sometimes the shortest prompt hits hardest."

### Nano Banana Pro / Nano Banana 2 (image — Google Gemini 3 Pro Image / Gemini 3.1 Flash Image)
Sources: https://higgsfield.ai/blog/Nano-Banana-Pro-is-Here-Full-Review-and-Guide , https://higgsfield.ai/blog/How-Nano-Banana-Pro-Changing-The-Game , https://higgsfield.ai/blog/Nano-Banana-2-Gemini-3.1-Flash-AI-Image-Generation , https://higgsfield.ai/blog/Nano-Banana-Pro-Expert-Use-Cases

**Architecture framing** (from the "Changing the Game" review): described as a "brain + hand" system — a Gemini-3-scale reasoning model (the "brain") interprets instructions/context/intent and plans a structured response BEFORE a high-fidelity diffusion engine (the "hand") renders it. This is why long, highly-structured prompts work unusually well on this model — treat prompt sections as a blueprint the reasoning layer parses, not just keywords the diffusion model pattern-matches.

**5 core strengths (Full Review)**:
1. Typography — clearer, more stable text/logos/labels/UI across regenerations. Good for ad mockups, packaging, UI/dashboard mockups.
2. Identity control — stable portrait angles (front/¾/profile) of the same person, natural expressions, consistent identity across generations.
3. Visual reasoning — respects math/diagrams/counts embedded in the image ("three cups on the table, two books on the shelf" rendered with correct counts); keeps diagram/arrow layouts sensible.
4. Prompt adherence — "best-in-class" on Higgsfield; respects every clause of multi-detail prompts (e.g., "blue jacket, red shoes, black cap... left hand holding a cup, right hand pointing at the screen") rather than approximating.
5. Pipeline role — used as the "layout and logic" stage: draft scene/text/identity in Nano Banana Pro → expand into storyboards in Higgsfield Popcorn → push into video models (Sora 2, Minimax, Kling, Veo) for motion → combine with Face Swap/Instadump/Soul ID for consistent characters.

**Expert prompt techniques (Nano Banana Pro Expert Use Cases, by Higgsfield's Head of Prompt Engineering)** — categories confirmed in the article: Long Structured Prompts ("Logical Layout Anchors"), JSON-structured multi-image prompts, Scene Composition & Atmosphere, Symbolic Reasoning, Technical/Extreme Infographics, Character Pipeline, Spatial Logic, Material Gradients & Enumeration.
- **Long structured prompts**: treat the canvas as real semantic regions (header/footer/margins), not vague suggestions — use for posters, covers, dashboards, infographics, presentations, social ad layouts. A full brand-system prompt example in the article spells out LOGO SYSTEM / COLOR PALETTE / TYPOGRAPHY / GRAPHIC LANGUAGE / BRAND PERSONALITY / MOTION DESIGN / APPLICATIONS / MATERIALS & LIGHTING / BRAND MYTHOLOGY as labeled sections — same "labeled block" philosophy as Seedance prompts.
- **JSON-structured prompts**: used for scenes needing simultaneous control over many independent elements (e.g., a 10-character game-select screen) — character identity/transformation, UI/layout overlay, unified lighting/palette, and hierarchical rules (e.g. "don't describe the name, transform the character") are assigned as structured parameters rather than prose.

**Nano Banana 2 (Flash tier) specifics**: built on Gemini 3.1 Flash. Positioned as the fast/scalable tier vs Nano Banana Pro's max-fidelity tier. Adds: real-time web grounding (more accurate infographics/subjects tied to current info), precision text rendering + localization/translation, subject consistency for **up to 5 characters** in one workflow, stronger multi-step instruction compliance, native resolution **up to 4K**, multiple aspect ratios. Use Nano Banana 2 for bulk/iterative ad creative and social pipelines where speed matters; use Nano Banana Pro when maximum factual/structural accuracy is required (single high-stakes hero asset).

### Seedream 5.0 Lite (image, ByteDance)
Source: https://higgsfield.ai/blog/Seedream-5.0-Lite-Review-How-to-Comparison
Note: team uses Seedream 4.5/5.0 Lite; this is the 5.0 Lite launch article, framed as a comparison vs 4.5.
- Key differentiator: **intention understanding beyond keyword matching** — reads mood/atmosphere/spatial relationships/creative objective from natural-language prompts, so short/ambiguous prompts still work (fewer failed generations, less prompt-engineering needed to get a usable result).
- **Real-time web search** built into generation — pulls in current events/trending topics/public figures for time-sensitive marketing/editorial content.
- Unified generation + editing model: language-based local edits (lighting, background swap, focal shifts, element-level changes), brush/mask selection, and edits preserve everything outside the masked/named region.
- Improved **character/subject consistency** (face, expression, clothing, props, styling) across poses/angles/lighting/styles — relevant for brand campaigns, serial storytelling, product catalogs.
- Better **bilingual typography** (English + Chinese), cleaner poster-style hierarchy/negative space.
- vs Seedream 4.5: 4.5 is "instruction-based with improved keyword adherence" and lacks the dedicated reasoning layer; 5.0 Lite adds multi-step reasoning (biology/architecture/geography/data-viz) — useful for infographic/technical-illustration work.
- Practical takeaway for Prisma: Seedream prompts can be shorter/more natural-language than Nano Banana Pro's highly-structured style and still land well, because the model infers intent — but for e-commerce/product work, still specify background/lighting/placement explicitly since editing is language-driven.

### GPT Image 2.5 (image, OpenAI) — "Flare" and "Sunburst" variants
Source: https://higgsfield.ai/blog/gpt-image-2-5-higgsfield
- Two variants on Higgsfield, same settings/pricing, different underlying tradeoff:
  - **Flare** = default/fast — ~50% less latency than GPT Image 2, for social content, quick concept posts, fast prototyping, high-volume variation generation.
  - **Sunburst** = precision/slow — for production-ready ad campaigns, polished final product photography, multi-step edits where every detail must hold.
- Settings (both variants): reference images up to **16**; aspect ratio Auto + supported ratios; Quality tiers Low/Medium/High/Extra High/Max; Resolution 1K/2K/4K.
- What improved from GPT Image 2: sharper detail/more natural light-texture; reference subjects hold up better when moved into new scene/style; **edits land precisely** — only the requested change moves, everything else in frame stays untouched; multi-step editing doesn't degrade (an edit from 3 rounds ago doesn't drift as new edits stack); more reliable on complex/layered instructions; style choices (lighting, camera settings) persist across generations.
- **Pricing table** (same for both variants): 1K/Low = 1.5 credits (~$0.075); 2K/High = 5.5 credits (~$0.275); 4K/Max = 26.5 credits (~$1.325).
- Workflow: pick variant → attach up to 16 references if needed → write prompt (subject/setting/lighting/composition) → set resolution+quality → generate/review.
- Older sibling GPT Image 1.5 ("Hazelnut", https://higgsfield.ai/blog/GPT-Image-1.5-by-OpenAI-is-on-Higgsfield-A-Complete-Guide) is positioned as a reasoning/diagram/infographic/structure tool (up to 1.5K res, 5-6 references, aspect ratios 1:1/2:3/3:2) rather than a high-fidelity stylized-art tool — mostly superseded by 2.5 for our use case but still useful for quick diagram/infographic drafts.

### Kling 3.0 (+ Motion Control) (video, Kuaishou)
Source: https://higgsfield.ai/blog/Kling-3.0-is-on-Higgsfield-User-Guide-AI-Video-Generation , https://higgsfield.ai/blog/Kling-2.6-Motion-Control-Full-Guide , https://higgsfield.ai/blog/kling-motion-control-3

**Kling 3.0 spec**: unifies video + native audio + multi-shot in one architecture. Duration 3-15s. Resolution 720p/1080p/4K. Aspect ratio 16:9/9:16/1:1. Audio on/off per generation. Up to **5 shots** per video (multi-shot), each with own prompt+duration, total capped at 15s. Optional start frame / end frame / both. 8 built-in presets for common shot styles.

**Multi-shot modes**: Auto (model splits your prompt into shots itself — good for fast drafts) vs Custom (you build the shot list and set each shot's duration yourself — direct control over pacing/order).

**Element tagging for consistency**: in multi-shot mode, tag a character/product/object with `@elements` in every shot it appears in; describe only the *action* in the shot prompt since the look is already defined by the tagged element. Two stated habits: (1) tag the same element in every shot it's in, (2) don't re-describe appearance, only describe what it does.

**Start/end frame control**: attach a start frame, end frame, or both to set the video's trajectory; an end frame alone also works (model chooses how to arrive). Workflow: prepare frames (can differ in tone/style, model bridges them) → upload as start/end/both → describe the transition + camera behavior in the prompt → generate → if result drifts, simplify the prompt and let the frames carry more of the direction.

**Pricing** (~20 credits/$1, 15-second clip): 720p = 30 credits (~$1.50); 1080p = 37.5 credits (~$1.88); 4K = 90 credits (~$4.50). Tip: draft at 720p, lock the prompt/structure, then re-run final pass at target resolution — 4K costs 3x 720p.

**Common mistakes (named explicitly — very actionable for Prisma's guardrails)**:
1. Overloading a single shot — one shot = one action + one camera move; split 3 events across 3 shots instead of cramming into one 4s shot.
2. Fighting your own end frame — if the prompt describes motion that can't plausibly reach the attached end frame, the result drifts; keep prompt and end-frame state aligned.
3. Too many shots for the duration — 5 shots in a short clip leaves ~2s/shot, too little for a readable action; match shot count to total duration.
4. Expecting motion transfer from the base model — Kling 3.0 follows prompts+frames only; copying movement from a reference video requires Kling Motion Control (separate tool).
5. Iterating in 4K — draft cheap at 720p first, only render final at 4K.

**Kling Motion Control (2.6 → 3.0)**: separate tool from base Kling 3.0. Fuses a static Reference Image (character) + a Motion Reference Video (the action) — "digital puppeteer," applies movement/expression/pacing from the video onto the still character while preserving identity. 3.0 improves facial consistency, motion-capture tightness, reference alignment vs 2.6.
- Source-image prep tips: keep limbs/hands visible in the reference (hidden hands force the model to "hallucinate" them → 6-finger glitches); leave negative space/breathing room around the subject for the motion to play out without clipping.
- Motion-reference video tips: pick clear-subject, clean-background, high-contrast footage; match framing type to framing type (a full-body walking reference mapped onto a close portrait image causes warped/shaking results).
- Settings: output 720p or 1080p; "Scene source" toggle chooses whether the background comes from the motion video or from the character image; Advanced Settings lets you add a text prompt to reskin background/lighting/atmosphere while motion stays locked; orientation can match either the reference video or the character image.
- Use cases named: virtual-influencer/brand mascots (use team members as motion refs), product demos (hand interacting with an interface/product), and **localizing a single "hero video"** across different character images/ethnicities/age groups while keeping identical motion — reused verbatim for global campaign variants at no extra shoot cost. Also: reuse one motion clip (e.g. one dance) across many characters/art-styles for scalable content series.

### Google Veo 3.1 (video)
Source: https://higgsfield.ai/blog/How-to-Use-Google-Veo-3.1-Complete-Guide-for-the-New-Model
- 1080p native (no upscale). Duration selectable 4/6/8 seconds, 24fps, 16:9 or 9:16.
- Two engines: **Standard** (Reference-to-Video for subject consistency, supports dialogue/lip-sync, best for complex/consistent scenes) vs **Fast** (Start & End Frame control, faster, for controlled motion).
- Features: First-Frame & Last-Frame control; Reference-to-Video (upload ref image/video to lock style/character/aesthetic); Draw-to-Video (sketch → 1080p footage); **Multi Reference Mode** — one prompt auto-generates up to 4 interconnected scenes with seamless transitions.
- Subject Consistency (Standard only): upload 1-3 reference images of a character/object, identity holds across all frames.
- Supports spoken dialogue with lip-sync (Standard model).
- Workflow: select Veo 3.1 → choose Standard vs Fast → provide text/image(s)/start+end frames → generate.
- Positioning vs other HF video models (from Gemini Omni Flash comparison table below): Veo 3.1 is the **highest-fidelity, final-delivery** model — 4K native in Higgsfield's broader lineup (Cinema Studio version), native audio generated alongside video, but most expensive per second and shortest max length (8s) — not the drafting/iteration model.

### Gemini Omni Flash (video, Google) — the VFX/editing & multimodal model
Sources: https://higgsfield.ai/blog/gemini-omni-flash-vfx-video-editing , https://higgsfield.ai/blog/how-to-use-gemini-omni-flash-multi-shot-video

**What makes it different**: reasons across text + image(s) + video **simultaneously in one pass** rather than processing each input separately and picking/averaging — feed a character photo + a location reference + a text instruction and it produces one coherent clip. Accepts **up to 7 reference images** per prompt plus text and video inputs together. Output: video with synchronized audio in a single pass, up to **10 seconds**, 720p only, landscape or portrait.

**Its defining VFX capability — conversational/targeted editing**: after a generation, describe the change in plain language and the model applies ONLY that change while holding everything else intact (character consistency, physics, composition) — not a full re-render. Documented edit types: background replacement (no rotoscoping/masking needed), relighting (time of day / key-light direction / color temp via plain language), style transfer (apply a look without regenerating performance/motion), object replacement (swap one prop/product/wardrobe item only), physics/environment changes (surface material, weather — model recalculates physical response), motion control (via Cinema Studio's 7 genres/9 palettes/7 lighting presets/10 camera movesets/5 lens options layered on top).
- Named limitation: "complex motion edits where multiple elements need to interact differently after the edit are harder" — editing is strongest on **single-element** changes; test multi-element interaction edits before relying on the model for that.
- Real example prompt used a "V2V" (video-to-video) framing with an explicit **SOURCE LOCK** block (freeze camera path/timing/existing elements, add ONLY the new element), a beat-by-beat **MECHANIC** timeline, a **LIGHT-MATCH/INTEGRATION** priority block (match the added element's lighting/grain to the plate, not to its own reference image), an **ANTI-SLOP** block (explicit realism asks: real texture, lively eyes/catchlight, correct physics), and a **FORBIDDEN** block listing what must not change (camera pan, hand position, background, timing) — this V2V template (SOURCE LOCK / MECHANIC / LIGHT-MATCH / ANTI-SLOP / FORBIDDEN) is a strong reusable structure for any "edit this existing clip" request to Prisma.

**Prompting for multi-shot/reference assembly (from the multi-shot guide)**: structure prompts as (1) subject and action first, (2) setting and constraints second, (3) camera behavior third. Label reference inputs explicitly inline, e.g. `@character_photo standing at a rain-slicked market stall at dusk...`. When iterating, change **one variable per edit pass** ("move the subject slightly left" / "darken the background") so you can isolate what worked.

**Four named best-fit use cases**: multi-reference scene assembly (character photo + location photo → generated keyframe without manually compositing); iterative dialogue/layout editing (many small-variant versions of one line/layout via language edits instead of full regenerations); brand-constrained ad production (state hard constraints explicitly, e.g. "the label color stays consistent across all cuts. The product shape does not distort" — the model treats explicit constraints as locks); presenter/talking video from a photo + voice sample (lip-sync driven by the actual audio, not approximated from text — swap the audio track for multilingual versions while keeping the same photo).

**Model-comparison table (from the VFX guide) — this is the single clearest "which model when" resource found**:
| Model | Best use | Max res | Max clip | Cost/sec (720p) |
|---|---|---|---|---|
| Gemini Omni Flash | Multimodal input, iterative VFX editing | 720p | 10s | ~$0.15 |
| Veo 3.1 | Highest fidelity, native audio, final delivery | 4K | 8s | ~$0.35 |
| Seedance 2.0 | Commercial work, multiple references, 4K | 4K | 15s | ~$0.25 |
| Kling 3.0 | Human subjects, realistic motion, multi-shot sequences | 1080p | 15s | ~$0.10 |
Recommended sequencing: use **Gemini Omni Flash to develop/iterate** the shot direction cheaply (its edit loop can replace multiple full regenerations — "a shot that previously required five full regenerations to dial in might need one generation and two conversational edits"), then **re-render the locked shot in Veo 3.1 or Seedance 2.0** at full quality/resolution for final delivery. Kling 3.0 is called out as most cost-efficient and best for natural human motion/micro-expressions specifically. All four models draw from the same Higgsfield credit balance.

All four models tie into **Soul ID** for persistent identity: train an identity once from photos, it carries the same face across every model on the platform (Gemini Flash, Kling, Veo, Seedance) without re-uploading — this is the mechanism for switching models mid-production without rebuilding a character reference.

---

## 2. WORKFLOWS

### "Make Viral AI Short Films" — the Seedance 4K / Claude-Skill pipeline (case4k)
Source: https://higgsfield.ai/blog/case4k ("Make Viral AI Short Films With This Exact Workflow — Full Tutorial")

This is the step-by-step asset → prompt → generation pipeline referenced by the task as "case4k":

**Stage 1 — Build assets first, before generating any scene.** Character sheets, locations, and props are generated once and reused across every scene so the hero's face/props/locations stay identical shot to shot. The routine: **Soul Cinema for the raw pass** (simple prompt, high variety) → **GPT Image 2 for edits and the final clean reference sheet**.
- Character-sheet technique: generate a **3-view sheet** in one image — full-body FRONT, full-body BACK, and a frontal CLOSE-UP — on a neutral mid-grey seamless backdrop (never white), soft/low diffused even lighting with no hotspots, identical lighting across all 3 panels. The close-up view is what locks the exact face the model should reuse. Prompt explicitly states which small identifying details (e.g. a specific scar, asymmetry) must stay identical across all three panels.

**Stage 2 — The Prompting Framework: a Claude Skill writes the Seedance prompts, not a human.** Setup: upload the `higgsfield-seedance-prompt.skill` file into Claude via Customize → Skills → "+". In a chat, attach the script/outline plus every asset sheet, and give Claude a tagged element list mapping short handles to assets, e.g. `@eduardo — main pirate character`, `@loc_cabin — captain's cabin`, `@main_ship_sheet — hero's ship`. **The same tag names must be entered in Higgsfield under "Elements"** — during generation Seedance auto-matches prompt tags to your uploaded reference inputs by these exact names, so nothing gets mixed up.
- Per-scene loop: describe what happens in plain language to Claude → attach the asset tags the shot needs → Claude (via the skill) returns the full structured Seedance prompt (same GLOBAL STYLE/CHARACTERS/LOCATION/shots/PHYSICS/LIGHTING/AUDIO framework documented above, plus a closing **POSITIVE LOCKS** paragraph restating hard continuity constraints) → run it in Seedance 2.0 → take notes on what's wrong back to Claude for exact, targeted fixes (iterative, not from-scratch re-prompting).

**Stage 3 — Scenes**: generated shot-by-shot/scene-by-scene using the framework above, each scene a fresh Claude conversation turn referencing the tagged assets it needs.

Practical implication for HÜE Prisma: this confirms Higgsfield's own recommended pattern is (1) build a reusable, named asset library (character/location/prop reference sheets) once, (2) drive prompt generation through a structured skill/tool rather than freehand prompting, (3) use consistent short @tag handles that map 1:1 to uploaded "Elements," and (4) treat continuity rules (POSITIVE LOCKS / FORBIDDEN blocks) as a mandatory closing section of every generated prompt.

### "How To Make a Full Ad Campaign Inside Claude" — the Higgsfield MCP campaign workflow
Source: https://higgsfield.ai/blog/full-ad-campaign-inside-claude

**Premise**: one product turned into four ad formats, generated inside a single Claude conversation via Higgsfield MCP.

**The 4 ad formats and what each needs**:
| Format | Best for | Typical length | Needs from you |
|---|---|---|---|
| UGC video | Feed ads, Meta/TikTok, trust-first placements | 15-30s | Product reference, benefit angle, tone |
| Product video | PDP hero, TV-style spot opens | 8-15s | Product reference, camera/mood direction |
| Social media ad | Carousels, Stories, quick-cut feed | 8-15s | Product reference, hook copy, platform size |
| Explainer video | Landing pages, feature walkthroughs, onboarding | 15-30s | Script, URL, or feature list |

**MCP setup (3 steps, one-time)**: 1) copy the Higgsfield connector URL `https://mcp.higgsfield.ai/mcp` ; 2) in Claude, go to Customize → Connectors, name it "Higgsfield", paste the URL; 3) Connect, sign in. Once connected, Claude reaches **Marketing Studio**, **Higgsfield Explainer**, and 30+ other models directly from chat — no separate app/login.
- Marketing Studio (the core tool for this workflow) accepts **up to 9 reference inputs in one call** — product images, a spokesperson's face, a voiceover clip, and a camera-style reference can all feed in simultaneously.

**Step-by-step pattern (same across all 4 formats)**:
1. Attach the product reference (photo or a live product URL) + a one-sentence campaign goal (benefit to lead with, platform, deadline) directly in the Claude chat — Marketing Studio carries this one reference forward for every subsequent format, no re-uploading.
2. Write a short description OR a fully detailed shot-by-shot brief (camera moves, cast, location, material realism, audio, consistency rules) — Claude fills gaps if you go short.
3. **Approve the still frame before the motion generates** — Claude picks a creator/writes a short script, sends back a first frame; confirm face/setting/framing here, since catching a wrong direction on a still is far cheaper than catching it on a finished video.
4. Full clip generates with **dialogue and lip-sync already in place** — no separate voiceover pass or manual sync step.

**Scaling ("Turning One Ad Into Ten")**: once a version works, **Supercomputer** scales it — describe the batch in plain language, the agent plans it, picks the right models, and runs it across parallel conversations (up to **10 on Ultra plan, 3 on Plus plan**). Memory persists across the batch so brief/brand references don't need re-specifying per item. **Scheduled Tasks** run the same pipeline on a recurring basis; 30+ connectors push finished outputs straight to Slack, Google Drive, or Notion.

**Pricing (credit cost is identical whether run through Claude/MCP or directly on the Higgsfield site — no MCP markup)**:
| Format | Covers | Approx. cost |
|---|---|---|
| UGC video | per 15s variant, avatar + synced dialogue | ~85 credits (~$4.25) |
| Product video | per 15s variant, incl. ambient audio pass + image | ~85 credits (~$4.25) |
| Social media ad | per 15s variant + image | ~85 credits (~$4.25) |
| Explainer video | per 20s variant + image | ~72 credits (~$3.60) |
The article stresses: the cost-that-matters is per variant, not campaign total, since that's what scales when testing one hook vs. five.

**Best-practice checklist from the article (directly reusable as Prisma guardrails)**:
- Lock the product reference **once**, at the start of the conversation — re-describing the product per format is "where inconsistency between formats usually creeps in."
- Write the hook first for the UGC video — the angle (problem/benefit/tone) is the part that should differ between variants; keep everything else constant.
- **Generate one version of each format before batching variants** — a batch job multiplies whatever direction you gave it, mistakes included, so confirm the take is right before fanning it out 5x.
- Autoposting/scheduling should run off the finished, human-picked shortlist batch, not raw generations — pick shipping variants inside the conversation first, then hand off only that shortlist.

### Marketing Studio — the template engine behind UGC / product / ecommerce ads
Sources: https://higgsfield.ai/blog/how-to-make-ai-ugc-videos , https://higgsfield.ai/blog/ai-product-photos-no-studio , https://higgsfield.ai/blog/ai-ecommerce-ads-2026

Marketing Studio is Higgsfield's dedicated ad-production workspace, template-first rather than prompt-first, and it's the tool underlying most of the "how to make X ad" guides.

**Structure**: 5 style categories / 32 named styles total, plus a library of **1,500+ presets** across 6 categories (Product shot, Motion, UGC, Ads, Posters, Marketplace):
- **Product shot** (image, 9 styles): Closeup, Faceless, Full body, Editorial, UGC, Studio white, Color pop, Natural, Usage.
- **Ads** (image, 3 styles): Social proof, Comparison, Problem → Solution.
- **Marketplace** (image, 5 styles): Dark, 3D surreal, Color pop, Pastel, Clean.
- **Motion** (video, 7 styles): 2D product motion, Hypermotion, Typography, Dark Minimalism, Color pop, Mixed media, SaaS.
- **UGC** (video, 8 styles): Shopping, At home, Delivery, Review, Try-on, Unboxing, Tutorial, Before/after.

**UGC genre → platform → hook mapping (from the UGC guide)**:
| Genre | Best platform | Needs | Hook example |
|---|---|---|---|
| GRWM (get ready with me) | TikTok, Reels | Creator + product in a routine | "I replaced my entire morning routine with one product" |
| Tutorial | TikTok, YouTube Shorts | Product + 3-4 usage steps | "You always used it wrong" |
| Before/after | Reels, TikTok | Two states of same subject | "Day 1 vs day 30" |
| Testimonial | Meta feed, Reels | Creator + a specific claim | "I was skeptical until week two" |
| Unboxing | TikTok, YouTube Shorts | Product packaging | "The packaging alone sold me" |
| POV demo | TikTok | First-person product use | "POV: your desk setup finally makes sense" |

**UGC production mechanics**: a "brand face" (avatar) is set up once — from the avatar library, generated from a text prompt, or from an uploaded photo (person you have rights to) — and reused across every product/preset/placement so one identity carries a whole campaign. **Soul ID** keeps that creator consistent; **Virality Predictor** scores/ranks a batch before spend. The two-part decision is always: preset = the visual setup, script = what's said (kept as two separate decisions). Best practice: **run up to 4 generations at once and change exactly one variable** (e.g. only the hook line) so any performance difference is attributable to that one change; test different presets/formats as a *separate* batch, not mixed into the hook test.

**Product photo set workflow (ai-product-photos-no-studio)**: 
1. Start from one clean base photo (uncluttered background, even light, product filling most of frame, readable packaging text) — clean up backgrounds first with Layers' Remove Background if needed.
2. Save the product once via the Product slot (more angles + a name/short description improves consistency); every later generation reuses this saved product.
3. Optional avatar (library pick / your own uploaded photo / a Soul 2.0-generated non-real person) if a human is needed in frame; Soul ID maintains that identity elsewhere.
4. Generate a **core set** from Product Shot styles — recommended minimal combo: Studio white (hero), Closeup w/ avatar (detail), Usage + Faceless (context, no face), Full body (one wider brand-mood shot).
5. Move to Marketplace category for listing covers; standard order = white-bg hero first, lifestyle/detail shots as secondary images.
6. Same saved product can move straight into Motion (animated banners, up to 15s) without leaving the tool.
- Always visually check generated output against the real product (shape/color/packaging text/proportions) before publishing — the model can drift on exact match.

**Ecommerce ad workflow — two paths**: 
- **Path A, Marketing Studio templates** (low control, fast, no prompt needed): pick category → pick template → start from product URL (auto-pulls imagery/logo/colors/copy) or image → generate → review (product accuracy, on-screen text, hook clarity) → export/regenerate.
- **Path B, Seedance 2.5 direct control** (high control, prompt-first): add up to **50 product references** to lock shape/color/packaging → write a full detailed prompt (references the same GLOBAL STYLE / hard-rule-block pattern seen elsewhere) → generate up to 30s.
- Seedance 2.5's **era selector**: a single prompt line like "change the decade to any year in that range" reshoots the same scene in any decade look from the 1960s–2020s — a fast way to produce nostalgia/retro creative variants without rewriting the whole prompt.
- The example ecommerce UGC prompt in this article demonstrates several more named "hard rule" block conventions worth reusing in Prisma's templates: **NATURAL MOTION**, **LIVING REALISM** (mandatory blink cadence "every 2-4 seconds," micro-expressions, no frozen stare), a product-specific physics block (e.g. **GUM REALISM** ruling out "slime-like" behavior), **NO GLOW**, an explicit **RELIGHT THE SUBJECT TO MATCH THE LOCATION** instruction (discard the reference photo's studio lighting, re-derive lighting natively from the destination scene), and a closing **AVOID** list enumerating specific failure modes (stringy gum, mannequin stiffness, teleporting limbs, visible phone/camera in a UGC selfie shot, deformed fingers, misspelled logo, watermarks).
- Cost benchmarks: Marketing Studio product hero/marketplace banner (2K image) = 8 credits (~$0.40); Motion 15s/720p = 89 credits (~$4.45); Seedance 2.5 direct 15s/720p = 98 credits (~$4.90), 30s/720p = 195 credits (~$9.75).
- Weekly-planning tip: use **Canvas** (Higgsfield's node-based board) to lay out a week of ad variants (theme/format/hook per day) as a reusable template; credits are only charged when a node actually generates, so planning the structure is free.
- 5 example hooks given for a fruit-tea product (all curiosity/urgency framed, e.g. "This fruit tea ruined every other tea for me," "Stop scrolling if you've been struggling to find a tea that actually tastes good").

**Click to Ad** (https://higgsfield.ai/blog/how-to-make-100-creative-ads) — a Marketing Studio feature: paste one product URL, it scans the page and pulls product name, description, up to 8 photos, brand colors, and logo, then assembles a video from 10 preset templates. Every extracted element is editable before render. Best on physical goods with clear product-only photos (people/models in the source images can cause the system to weight the person over the product). Not for bespoke/narrative concepts — those still need direct Marketing Studio/Cinema Studio prompting. Pricing context: Starter plan $15/mo (200 credits), Plus $49/mo ($39/mo annual, 1,000 credits, full model lineup).

### 10 short-form (TikTok/Reels) product-video formats + presets
Source: https://higgsfield.ai/blog/Product-Videos-TikTok-Reels-Without-Filming

Formula: match product → proven format → vertical (9:16) preset (presets now run on **Seedance 2.0** after Sora's April 2026 shutdown). The 10 formats, each with its Higgsfield preset name and a one-line tip:
1. **Unboxing Surprise** — preset "Unpacking." Tip: add ambient audio (tearing paper, soft gasp), export 9:16.
2. **Before & After Transformation** — preset "Luxury Ad" or "Minimalist Corporate." Tip: keep the transition 2-3 seconds.
3. **Day in the Life (Hyperlite)** — preset "Dynamic Sport Ad." Tip: name the light source in the prompt ("morning glow through window") for an organic feel.
4. **POV Walkthrough** — preset "First-Person POV with Product." Tip: write directional flow explicitly (where the subject walks, what they approach, how the frame ends).
5. **Reaction Cut** — preset "Reaction." Tip: end on a secondary angle/zoom-out to lift re-watches.
6. **Trend Remix with Product** — preset "Gen-Z TikTok Edit." Tip: match tone/rhythm of a trend but rewrite the visual story, don't clone it.
7. **ASMR Product Focus** — preset "ASMR." Tip: keep audio minimal — near-silence raises perceived quality.
8. **Streamer/Vlog Highlight** — preset "Streamer Highlight." Tip: add captions since most feed viewing is on mute.
9. **Epic Fail to Hero Product** — preset "Epic Fail." Tip: keep the "fail" beat short, cut fast to the payoff.
10. **Minimal Product Loop** — preset "Minimalist Corporate." Tip: keep loops under 7 seconds, add gentle rotation for depth.

Limits: clips cap at ~15s per generation on presets (stitch longer sequences in Cinema Studio); output quality is capped by input quality (vague prompt / low-res product photo → generic result); presets can look templated if overused — vary format, don't lean on one preset for everything.

Scalable daily workflow suggested: pick 1 format → match to a Marketing Studio template for brand voice → prep assets (product image/prompt; Soul ID if a recurring face is used) → render 3-4 short draft variants rather than 1 long video (on Higgsfield's Supercomputer infra a 1080p clip renders in ~40s) → clean up + run weak-resolution output through Higgsfield Upscale toward crisp 1080p/4K → export natively 9:16 (also supports 1:1, 16:9 from the same project).

### Script → Storyboard → Video pipeline (Higgsfield Popcorn → Cinema Studio 4.0)
Source: https://higgsfield.ai/blog/script-to-ai-storyboard-shot-list

**Why storyboard first**: skipping the storyboard is called out as the single most common AI-video mistake — it's what causes "a folder of clips that don't cut together." A storyboard (1) locks scene intent before any frame generates, (2) keeps character/location consistent across cuts, (3) sets pacing (beat length, cut timing) before it's baked into finished footage — and it's the cheapest stage to fix mistakes at (revising a storyboard frame costs far less time/credits than regenerating a finished video clip).

**Higgsfield Popcorn** (the storyboard tool): up to **4 image references per generation** (character portrait + location shot + prop, combined into one coherent scene) and up to **8 frames per generation**. Two modes: **Auto** (one prompt + frame count, model distributes the story arc across panels) and **Manual** (direct each frame individually). Access: Create → Image → Popcorn. Supports aspect ratios 3:4, 4:3, 2:3, 3:2, 1:1, 16:9, 9:16.

**Step-by-step**:
1. Break the script into boardable sequences (a 2-person dialogue scene might need only a few panels; an action sequence needs one per major beat; split into multiple 8-frame generations if a sequence needs more).
2. Build a **shot list** first — for every beat define: shot size, camera angle, camera movement, purpose/reference notes. (Article gives a worked shot-list table: e.g. Shot 1A = Wide shot / Slow push-in / location+character refs / purpose note.)
3. Gather reference images (clean well-lit character portrait, location/prop refs as needed) — up to 4 combine per generation.
4. Write the prompt around **five elements, always in this order**: Shot size + Camera movement + Subject + Action + Setting + Lighting/style + Reference. (The worked fantasy example in the article again uses the same closing-block pattern: PHYSICS / LIGHTING / AUDIO / STYLE / QUALITY / POSITIVE CONSTRAINTS.)
5. Choose Auto or Manual + frame count.
6. Set aspect ratio, generate.
7. Carry the sequence forward: for the next scene with the same character, reuse the **strongest frame from the previous generation** as the new reference (not the original character sheet) to prevent drift accumulating. Once locked, the frames feed directly into **Cinema Studio 4.0** for actual video generation (camera/lens/lighting/motion set per shot from the same panels — no re-describing).

Distinction drawn: "a storyboard shows what each shot looks like; a shot list is the written breakdown behind it (size/move/lens/reference)." Typical frame count: 4-8 (4 for simple dialogue, up to 8 for action coverage). A full/formatted script is not required to start — a rough scene description is enough.

### Camera control — Cinema Studio (the deepest camera/lighting/lens vocabulary source found)
Source: https://higgsfield.ai/blog/ai-video-camera-control

**Core principle**: a camera move is a physical event (start position, end position, speed curve/easing, changing lens-subject relationship). A phrase like "slow dolly in" leaves all of that unspecified, so the model re-invents it every run — that's why identical prompts give different results each generation. Fix: **use a setting/parameter wherever the tool provides one** (Cinema Studio), and reserve prose only for what settings don't cover; state speed, path and end-framing explicitly in the text portion.

**Cinema Studio 3.5 full settings reference (verbatim options list — high-value vocabulary bank for Prisma)**:
| Setting | Options |
|---|---|
| Genre | General, Action, Epic, Drama, Comedy, Horror, Noir |
| Color Palette | Auto, Naturalistic Clean, Bleached Warm, Hyper Neon, Teal & Orange Epic, Sodium Decay, Cold Steel, Bleach Bypass, Classic B&W |
| Camera MoveSet Style | Auto, Classic Static, Silent Machine, One Take, Epic Scale, Intimate Observer, Impossible Camera, Documentary Snap, Raw Chaos, Dreamy Flow |
| Lighting | Auto, Soft Cross, Overhead Fall, Contre-jour, Window, Practicals, Silhouette |
| Camera (stock) | Auto, Raw 16mm, Fine Film, Clean Digital |
| Lens | Auto, Clinical Sharp, Extreme Macro, Anamorphic, Warm Halation, Vintage Haze |
| Focal Length | Auto, 8mm, 14mm, 35mm, 50mm, 75mm |
| Aperture | Auto, f/1.4 Wide Open, f/4 Moderate, f/11 Deep Focus |
| Aspect Ratio | Auto, 1:1, 3:4, 4:3, 9:16, 16:9, 21:9 |
| Resolution | 480p, 720p, 1080p, 4K |
| Duration | 4-15 seconds |
| Native Audio | On/Off (toggling audio does not change generation cost) |

What each locked parameter actually does (paraphrased): Genre sets the shot's whole physical logic first (e.g. Noir = shadow logic + restrained posture; Epic = environment scaled up to protagonist status). Lighting presets fix light-source *position* as physics, not a re-interpreted text guess each run — e.g. **Contre-jour** = light source locked behind the subject → rim-lit silhouette, face carried by bounce/edge light; **Practicals** = only sources actually visible in frame illuminate (streetlights/candles/screens), darkness fills between; **Soft Cross** = dramatic asymmetry, half the face lit/half shadow. Camera MoveSet Style sets the *register* a move executes in (the specific move like pan/dolly still comes from the prompt) — e.g. **Epic Scale** = IMAX-level movement; **Silent Machine** = slow invisible precision; **Raw Chaos** = ground-zero aggressive shake; **Classic Static** = frame completely stationary while the scene moves. Lens character changes the image as much as movement does — **Clinical Sharp** (max precision, zero optical personality, clean commercial register), **Anamorphic** (oval bokeh + horizontal flare, reads theatrical), **Warm Halation** (highlight bloom, warm skin tones), **Vintage Haze** (edge softness/flare of older uncorrected glass), **Extreme Macro** (shallow DOF, magnified close detail).

**The Movement Dictionary — 5 core camera moves with a "universal" short prompt + a fuller technical prompt pattern each** (all HF-tested; short ones under 40 words, quoted verbatim as HF examples):
- **Pan** (camera fixed, rotates horizontally — reveals space without changing location): "Slow camera pan left across a coastal town at dusk, tripod fixed, horizon level." Technical pattern adds: exact degrees of rotation, "no travel, no dolly, no truck, no arc, no zoom, no tilt," constant speed with a "gentle settle in the final half second" timed to land on the key beat.
- **Dolly** (camera physically travels toward/away — real distance change, builds intimacy a zoom can't): "Slow dolly in toward a woman reading by a window, constant speed, settling into a static hold." Technical pattern: "field of view never changes, no zoom... near objects sweeping past frame edges with strong parallax... no pan, no tilt, no crane, no handheld drift."
- **Zoom** (lens focal length itself changes; camera stays still — "space collapsing inward"): "Slow optical zoom out from a lighthouse at dawn, camera locked on a tripod, no travel." Technical pattern explicitly negates the confusable alternative: "NOT a dolly out, NOT a pull-back... ZERO parallax: the far background keeps the exact same apparent size... from first frame to last."
- **Orbit** (circular path around a centered subject — go-to for product reveals/hero shots): "Slow 360 orbit around a perfume bottle on a marble table, subject centered, constant radius." Technical pattern: locked constant radius+height, "no radius drift, no height drift, no speed changes, no reversal, no turntable effect where the subject spins in place" (i.e. clarify it's the camera circling, not the product spinning).
- **Tracking** (camera moves alongside a moving subject, holding relative position — use when the subject's motion is the point): "Lateral tracking shot following a cyclist along a canal, strict side view, constant distance." Technical pattern: names three parallax layers explicitly (nearest/middle/farthest elements) at different apparent speeds for a convincing side-tracking read.
- **Reusable naming trick across all 5**: explicitly rule out the confusable competing move in the prompt (e.g. for zoom, rule out dolly/pull-back/crane/jib/pedestal/drone-pull-away) — this is called out as what actually disambiguates dolly-vs-zoom and pan-vs-orbit for the model.

**Pricing (fully dialed-in Cinema Studio shot)**: 4s = ~$1 (720p) / ~$2 (1080p); 8s = ~$2 / ~$4; 15s = ~$3.75 / ~$7.50. Habit recommended: test the camera move at 720p first (movement/focus/pacing all render correctly there), only spend the extra credits on a 1080p pass once the shot is confirmed.

Cross-tool note: the same generation panel/workspace also runs Seedance 2.0, Kling 3.0, Veo 3.1, WAN 2.7 — switching models doesn't mean re-uploading assets; Soul ID characters attach via "Elements" the same way across all of them.

### Character AND location consistency (the two-anchor method)
Source: https://higgsfield.ai/blog/consistent-characters-locations

**Core insight**: most consistency advice only covers faces; locations are structurally harder because a face has one variable to hold (identity) while a location has dozens simultaneously (furniture position, light direction, wall color, what's visible through the window, time of day, objects on a shelf) — a vague text description ("a cozy kitchen with morning light") gives the model nothing concrete, so it reinvents the room slightly every generation; not wrong enough to notice in one shot, but breaks the sequence the moment you cut between two angles of the "same" room.

**Three tools, one job each**:
- **Soul ID** = the face. Trains a persistent identity from **20+ reference photos** (clear, well-lit, different angles/lighting — not group shots, not partially obscured faces). Applies as a **hard constraint** (not a re-interpreted description) across Kling 3.0, Veo 3.1, Seedance 2.0, WAN 2.6, without re-uploading per shot or per model. One-time training persists across sessions/weeks.
- **Seedance 2.0** = character + location fused in a single shot. Accepts **up to 9 reference inputs** at once (character photo + location image + prop reference + style reference simultaneously) and reasons across all of them together rather than approximating from a paragraph.
- **Popcorn** = the sequence. Generates up to **8 frames as one coherent set** (not independent rolls) from up to **4 references**, holding the same face/lighting/clothing/spatial logic across every frame because it reasons about the whole sequence at once. Auto mode distributes beats from one prompt; Manual mode lets you pin a specific beat to a specific frame.

**4-step workflow**: (1) train Soul ID once from 20+ photos before generating anything: (2) gather one clean establishing location image (or a single strong concept image if the location doesn't exist yet) and feed character + location + prop/style refs into Seedance 2.0 together (up to 9 refs) for individual maximum-density shots; (3) for a connected multi-shot scene, run Popcorn instead — feed character+location refs together, generate the full beat sequence as one pass; (4) **carry the anchor forward**: consistency inside one Popcorn generation does NOT automatically carry to the next one — take the single strongest frame from the completed sequence (clearly showing character+location together) and feed it back in as an added reference for the next generation, alongside the original refs. This is explicitly compared to "returning to a real set with the same props" for continuity across separate sessions/days.

**Consistency pre-flight checklist (directly reusable in Prisma)**: character reference ready (trained Soul ID or a clean single-sequence reference) → location reference ready (establishing shot showing geography/light direction/key landmarks) → reference count fits the model (≤9 for Seedance 2.0, ≤4 for Popcorn) → frame count matches the beats needed (4 = simple sequence, 6 = scene with a clear arc, 8 = complex multi-beat) → mode matches control needs (Auto vs Manual) → strongest output frame saved to carry forward.

**Cost**: Soul ID training = 25 credits (~$1.25) one-time, reused forever after. Seedance 2.0 Standard 720p/8s = 36 credits (~$1.55) per generation; Seedance 2.0 Fast 720p/8s = 28 credits (~$1.20). Popcorn = 5 credits (~$0.25) per sequence (up to 8 frames).

### The universal "strong prompt = shot list" method + 7 named mistakes
Source: https://higgsfield.ai/blog/ai-video-prompt-mistakes

**Root-cause framing**: a prompt only carries what's written into it — anything left out (exact age, a light source, a camera move's end point) still gets decided, just by the model instead of you; that's why identical prompts drift between runs. Three structural causes group ALL prompt mistakes: (1) an underdescribed subject → identity/wardrobe drift, (2) an undefined camera/light/movement → wrong atmosphere and motion, (3) a scene that was never blocked (multi-character/multi-beat) → characters drift out of position.

**The 7 named mistakes, cause, and fix (table, directly reusable as a Prisma lint checklist)**:
| Mistake | Why it happens | The fix |
|---|---|---|
| Characters look plastic or fake | Described only in general terms, no reference or distinguishing detail | Exact age, build, clothing + a reference or trained Soul ID |
| Extra fingers, fused hands, AI slop | Points of contact never specified, model fills them in itself | Name where every object sits and exactly how hands make contact |
| Wrong emotion / unclear what's happening | Only the general idea of the scene was written, not a visible expression | Tie emotion to a specific action: a gaze, a held breath, a sigh |
| Atmosphere/lighting misses the mood | Light source, angle, time of day never named | State them directly, or set genre+lighting as Cinema Studio parameters |
| Unnatural movement | Motion described as one adjective instead of an actual path | Spell out the turn/tilt/angle, or lock it as a Cinema Studio setting |
| Camera clutter, lost focal point | Shot list names angles but not what each shot is *for* | Give every shot one job; cut what doesn't serve it |
| Characters lose position in complex scenes | Only the overall idea is written, not who stands where | Storyboard the scene in Popcorn before generating the full sequence |

**The 6-step method to write a strong AI video prompt (in order — prevents most of the 7 mistakes above from happening at all)**:
1. **Set the scene and lock the cast** — name the setting, duration, real-time-vs-stylized; give each person an exact age/build/outfit + one distinguishing detail, state explicitly they stay identical across every cut; for a recurring face, train Soul ID instead of re-describing.
2. **Block the scene before writing any action** — state where each person/object sits relative to others and the camera, and which direction they move; keep that direction and the camera's side consistent through the whole scene so nothing flips mid-sequence.
3. **Define the camera as a physical setup, not a mood** — field of view, distance from subject, static/handheld/moving with the movement type named directly (not "dynamic"); use Cinema Studio settings directly where available instead of writing it out.
4. **Write the action as a shot list, one beat at a time** — each beat gets one clear action, described as a start position AND an end position rather than a mood word; in the same pass, name every point of contact (a hand on a shoulder, fingers around an object) — this is explicitly named as *the* fix for extra-finger/fused-hand errors.
5. **Set physics and lighting as real events** — how things behave under weight/gravity/fabric/fire/water; one named light source, one direction, one color, explicitly ruling out anything that shouldn't double up (a second sun, a stray flare).
6. **Decide audio and the finish** — state what's actually heard and whose line belongs to whom, whether music plays at all; close with the visual reference (film stock, grain level, color grade) and rule out what shouldn't appear (no text, no logos, no watermarks).
For anything with more than one character/beat: plan it as a storyboard (Popcorn) before writing one long paragraph — same information, just staged first.

### Hands and faces specifically — why they break, and the fix
Source: https://higgsfield.ai/blog/ai-video-hands-faces

Root cause framing: the model has **no memory between frames** and must resolve dense structural detail (joints/fingers/facial geometry) fresh, in a small part of the frame, every single generation. Hands additionally suffer from a **training-data gap**: hands appear gripping/pointing/resting/gesturing, often partially occluded or motion-blurred, so the model has seen fewer clean examples of a given hand position than of a forward-facing face.

**5 tips (table)**: (1) replace face description with a trained Soul ID identity (removes the need to reinterpret "a woman with dark hair" fresh each time); (2) use Cinema Studio to set lens/focal length/aperture based on how much of the frame the hand/face occupies (removes ambiguity about how much structural detail must be resolved at that scale); (3) describe **start and end states, not the motion itself** for the hand's exact position (removes the open-ended path the model would otherwise invent); (4) choose a multi-reference model (upload a reference image of the exact hand position alongside the character reference on Seedance 2.0) instead of approximating a gesture from text; (5) **describe the hand or face first**, with the most specific language, ahead of secondary details (background/lighting/wardrobe) — competing detail is what hands/faces lose out to first when a prompt is overloaded.

Step order: train Soul ID (20+ photos, varied angle/lighting) → set Cinema Studio framing params based on hand/face frame-share → attach a reference image of the exact gesture/position alongside the identity → write start/end states first in the prompt → **generate and review the hardest detail (hand/face) first** — if it holds, the rest of the shot is very likely fine.

Multi-character note: two people's hands/faces sharing a small frame area measurably increases error rate (more anatomical detail to resolve at once in the same space).

### 10 tips to avoid distortion generally (companion piece)
Source: https://higgsfield.ai/blog/how-to-avoid-distortions-ai-videos

Three distortion types, three distinct causes: **face drift** (ambiguous text description → new interpretation each generation), **background warping** (backgrounds are low-priority/underspecified in most prompts, so context shifts unasked), **motion morphing** (physical movement is hard to describe in text — "running" maps to dozens of valid body-position sequences).

The 10 tips (condensed, several not covered elsewhere above): (1) write a strong specific prompt — subject/scene/action/camera position, all explicit; (2) use high-quality multi-angle reference images (a front-facing + a three-quarter shot together beats one image); (3) replace text descriptions with identity anchors (Soul ID / a locked reference) — the model should *apply* an identity, not *interpret* one; (4) **avoid extreme camera moves** — fast spins/sudden direction changes are hard to keep physically coherent frame-to-frame; build energy through edit rhythm instead of camera chaos; (5) set lens/lighting/camera parameters explicitly (Cinema Studio) rather than describing them in prose that gets reinterpreted; (6) **anchor the background with a location reference image**, reused across every shot in a sequence; (7) describe physical actions via start+end body positions, not a motion adjective; (8) **change only one variable at a time between shots** (new setting + same angle, OR new angle + same setting — never several at once) — called out as reducing identity drift "more than almost any other adjustment"; (9) **keep clips short and chain them with frame locks** — drift accumulates past ~30s even on strong models; use the last frame of one clip as the first-frame reference of the next (Seedance 2.0 accepts first-and-last-frame inputs specifically for this); (10) **test the hardest shot first** — multi-character interaction / dynamic action accumulates the most distortion; front-load it so you catch problems before the rest of the sequence is built on a flawed assumption.

### Realistic AI talking/lip-sync video — 6 elements + fixes for the 5 "fake" tells
Source: https://higgsfield.ai/blog/make-ai-lipsync-videos

A believable talking clip needs **6 elements coordinated simultaneously**, not just accurate mouth sync: (1) lip movement aligned to speech phonemes, (2) facial expressions shifting with emotional content, (3) eye movement (gaze shifts, natural blink interval, focus changes), (4) subtle head motion following speech rhythm, (5) gestures matching meaning (not filler), (6) voice delivery with pacing/pauses/tonal variation. Fixing only #1 while ignoring the other 5 barely moves perceived realism.

**5 named failure modes and root causes**:
| Problem | Root cause | Fix |
|---|---|---|
| Frozen facial expressions | Source image has a neutral/flat "passport photo" expression, nothing to animate from | Use a source image with a light natural expression; add emotion cues in brackets in the script, e.g. `[excited]`, `[thoughtful]`, `[warm]` |
| Emotional mismatch (excited voice, neutral face) | Voice and face generated in separate passes with no shared emotional reference | Prefer performance-based workflows that generate audio+face together; if two-step, match the audio's emotional register before generating the face |
| Unnatural eye behavior (fixed stare, mechanical blink) | Limited eye-motion training data / no gaze variation control | Depends on tool; on tools without native control, shorter clips (<20s) hide it better |
| Repetitive gestures (same head nod every 8-10s) | Small motion library recycled across longer clips | Keep individual generations under 30s and cut between them — gesture repetition resets each new clip |
| Character drift (different face across clips in a series) | No persistent identity anchor between generations | Soul ID trained once, applied automatically every generation |

**6-step improvement process**: (1) **write for spoken delivery, not for reading** — conversational language gives the model more expressive cues than formal writing (example given: weak = "We are pleased to announce our latest product update"; stronger = "Today I want to show you something we've been working on for a while"); add bracketed emotion cues. (2) **generate expressive audio first** — voice drives facial animation; a flat/monotone track produces a flat face regardless of model. (3) use clean, sharp, front-facing, evenly-lit source material (side angles / obscured faces / heavy makeup or glasses all degrade results). (4) pick the right workflow type for the goal — **talking avatar from a photo** (single presenter clip), **persistent avatar platform** (high-volume scripted content, many scripts/same identity), or **real-footage dubbing** (localization/multilingual of existing recorded video) — using the wrong one is called "the most common source of poor results." (5) review the *full performance* (eyes/expression/head rhythm/emotional match), not just mouth sync. (6) **iterate one variable at a time** — script, then source image, then model, then workflow — changing several at once makes it impossible to identify what helped.

Named limits (2026, across tools tested, not just Higgsfield): multi-speaker scenes with overlapping dialogue produce visible errors on every tool — process each speaker separately and composite in post; subtle emotions (skepticism, distraction, irony) don't transfer reliably from voice to face on any current tool; gesture repetition/expression cycling appears past ~30s on most models; non-frontal source material is a hard floor requirement across all tools.

Higgsfield's LipSync Studio = 10 lip-sync models in one workspace with Soul ID integration (persistent face carries in without re-uploading per clip); cost example: Veo 3 tier runs 58 credits per 1080p clip.

### Consistent AI voice across videos
Source: https://higgsfield.ai/blog/consistent-ai-voice-across-videos

4 things a consistent voice needs: (1) **one source chosen once** (switching voice sources mid-project for the same character is the most common way consistency breaks); (2) **a saved configuration, not a rebuilt one** (expression/mood/speed/pitch/volume must be recallable, not re-entered by hand each clip); (3) a **cloned voice** when the goal is reproducing one specific real voice (holds up more reliably than eyeballing a preset match each time); (4) the **same settings beyond just source** — speed/volume/emotional-delivery controls left to drift between clips can make one voice sound like two different people.

Two Higgsfield workflows: **A — save a preset configuration** (pick from 50+ presets in Seed Audio 1.0 → set expression/mood-slider/speed/pitch/volume → write the line → toggle "Save settings" on before generating → reuse the saved combo in future videos without rebuilding it); **B — clone a custom voice** (open MiniMax Speech 2.8 HD → Create Custom Voice, name it after the character → record up to 2 min or upload an MP3/WAV up to 11MB, reading a provided sample script produces a cleaner clone than freeform speech → clone (draws credits) → generate/reuse under the saved name indefinitely).

5 audio models and their specialty: Seed Audio 1.0 (multi-speaker scenes, speech+ambience generated together), Eleven v3 (emotionally specific delivery via inline tags), Qwen Audio 3.0 (general natural speech, voice+style+emotion together), MiniMax Speech 2.8 HD (single-voice narration, highest fidelity — this is the voice-cloning model), Seed Speech (multilingual, 30+ languages). Pricing per 15s of audio: Seed Audio 1.0 = 5.7 credits (~$0.30); Eleven v3 = 2.55 credits (~$0.15); Qwen Audio 3.0 = 0.37 credits (~$0.02); MiniMax Speech 2.8 HD = 2.55 credits (~$0.15); Seed Speech = 1.7 credits (~$0.10); Voice Cloning = 40 credits (~$2.00) one-time.

---

## 3. COST / CREDIT-SAVING TACTICS

Sources: https://higgsfield.ai/blog/ai-video-credits-explained , https://higgsfield.ai/blog/credits-vs-unlimited-ai-video-generation

**What actually drives credit cost (three independent multipliers, not additive)**: duration × resolution × model choice. **Resolution is called the single biggest multiplier** — moving 720p→1080p or 1080p→4K typically costs more than adding several extra seconds at the same resolution would. Concrete comparison table (5s clip): Seedance 2.0 at 720p = 23 credits (~$1.15) vs 1080p = 45 credits (~$2.25) — roughly 2x for the resolution bump alone; Cinema Studio 720p = 25 credits (~$1.25) vs 1080p = 50 credits (~$2.50). Cheaper models (Kling 3.0, Wan 2.7) run 2-4x cheaper than Seedance 2.0/Cinema Studio at the same settings, but (per the model-comparison table earlier) may need more attempts to nail a shot, which can flip the real per-finished-clip math.

**Retries are the hidden cost center**: failed/unusable takes deduct the same credits as a keeper. In Higgsfield's own testing, **a usable clip typically takes 3-5 generations to land**. The real cost of a plan is (credits per generation) × (average attempts per keeper), not the sticker price of one generation.

**Concrete credit-saving tactics (directly actionable for Prisma's guidance to users)**:
1. **Test/learn on cheaper models first** — save Cinema Studio/Seedance for once you already know what prompt/settings structure gets a usable result; don't burn expensive-model credits on exploration.
2. **Always draft at 720p, only pay for 1080p/4K on the confirmed final take** — motion, pacing, and camera behavior all read correctly at 720p.
3. **Lock camera movement and lighting as settings (Cinema Studio), not prompt text** — vague text gets reinterpreted differently every attempt, which is exactly what drives up regeneration count/wasted credits.
4. **Train a Soul ID identity for any recurring character** — a freshly-described face drifts between generations and each "fix the face" attempt is a paid regeneration; training once removes that whole failure category.
5. **Move to the pricier, settings-heavy tools (Cinema Studio/Seedance) once the shot actually needs motion/consistency control** — they cost more per generation but reach a usable result in fewer attempts for that use case, which is "often the better deal once you do the real math."
6. Voice/audio generation draws from the *same* credit balance as image/video — no separate subscription, so audio iteration should be budgeted against the same pool.

**Credits vs. Unlimited — when a flat plan beats paying per attempt**: at Higgsfield's Seedance 2.5 rate (72 credits / ~$3.60 per 8s 1080p take), a "regular" workload of ~30 usable clips/month (≈90-150 generations at the 3-5x retry rate) costs **$324-$540 in credits** — at that volume, a time-boxed unlimited pass/window on the working model costs less. Rule of thumb given: **the more retries a workload generates, the sooner a flat period on the working model beats paying per attempt.**

**Higgsfield's specific plan structure** (verified Sep 2026): Starter $15/mo = 200 credits, model catalog, no unlimited set. Plus $49/mo ($39/mo annual) = 1,000 credits + a **365-day unlimited set of 6 image models** + a 7-day window on Nano Banana 2. Ultra $129/mo ($99/mo annual) = 3,000 credits + same 365-day set + windows on Nano Banana Pro and Nano Banana 2. Annual billing on either paid tier adds a Kling 3.0 window. On top: the **Unlimited Models Marketplace** sells 1/3/7-day passes per individual model, from $7 (1-day) to $1,035 (7-day all-models pass). Separately, **"All Unlimited"** is a short (1-7 day) time-boxed window giving zero-credit generation across most flagship models (23 total, image/video/audio) — the tradeoff is **concurrency, not quantity**: 1 generation per format at a time, so regenerating the same shot 5x to nail a camera move costs nothing but happens sequentially, not in parallel. Important scope limit: **unlimited access (both the 365-day set and All Unlimited) applies only on higgsfield.ai's web app — MCP, CLI, Canvas, and Supercomputer always draw from the regular credit balance regardless of Unlimited status.** This is a critical fact for HÜE Prisma / Claude-MCP workflows: MCP-driven generation is never covered by Unlimited, so credit-saving tactics 1-5 above matter *more*, not less, when generating through Claude/MCP.

---

## 4. HIGGSFIELD MCP FOR CLAUDE — full reference

Sources: https://higgsfield.ai/blog/claude-higgsfield-mcp-creative-studio , https://higgsfield.ai/blog/mcp-for-marketers , https://higgsfield.ai/blog/full-ad-campaign-inside-claude

**Setup** (one-time, a few minutes): copy connector URL `https://mcp.higgsfield.ai/mcp` → in Claude Desktop/claude.ai go to Customize (or Settings) → Connectors → add new connector, name it "Higgsfield", paste URL → Connect → sign in with existing Higgsfield account (no separate account/API key). Requires an **active paid Higgsfield subscription**. ChatGPT connects via the official Higgsfield plugin (Plugins Directory) instead of a connector URL — same account/credits either way, but the **Website Building skill is Claude/Cursor/CLI-only, not available in the ChatGPT plugin**.

**What Claude can do once connected**: access to 30+ models (Soul, Cinema Studio, Seedance 2.5, Kling, etc.) — Claude auto-selects a model if none is named, or you can name one explicitly for control. Images up to 4K from text/reference/both. Video generation with reference assets plus post-ops: upscaling, reframing, background removal, motion controls. Audio: voiceover generation, voice cloning, voice change, video dubbing. Claude can also **browse your Higgsfield generation history** and reuse past assets as references instead of regenerating them. Every generation still deducts credits at standard rates (no MCP markup) — **and unlimited-plan coverage does NOT apply to MCP generations** (see Cost section above).

**Higgsfield "Skills" catalog available through MCP (6 categories)** — these are pre-built multi-step workflows (you describe the end result, the skill plans the script + picks the model + runs the generations itself, no manual per-stage prompting):
| Category | Covers |
|---|---|
| Marketing | Ad creatives and campaign content |
| UGC Factory | Creator-led product videos from a photo or store page — named sub-skills: Product Review, Unboxing, Try-on, Tutorial, SaaS UGC (for software products) |
| Faceless Content Factory | Stylized brand videos with no presenter — named formats: Stickman Cartoon, Editorial Motion Graphics, Whiteboard Doodle, Watercolor Chronicle, Pixel Art, Claymotion |
| Utility | Localization (translate a finished video for another market), Subtitles, Voiceover, Personal Clipper (YouTube → short clips), Shorts Maker |
| Motion & Design | Brandkit (visual identity), Animated Infographics, Motion Design |
| Website Building | Campaign landing pages from one prompt, including product pages built from a photo (Claude/Cursor/CLI only) |

**Recommended production sequence (from the full creative-studio guide)**: (1) verify the connector is enabled (optionally ask Claude to show credit balance / recent generations first); (2) generate or attach a reference image FIRST if the project needs a consistent character/product/location — establishes a concrete visual source before anything else is generated from scratch; (3) generate audio next if voice-led (voiceover before video, or generate video with native audio and refine after); (4) generate the video, describing action/environment/framing/lighting/pacing/look in the same message, letting Claude pick the model or naming one; (5) review and refine — describe the specific issue and let Claude run the matching Higgsfield editing operation; (6) finished MCP generations land in Higgsfield Assets automatically, downloadable/reusable from there.

**5 tips given directly in the article (reusable as Prisma operating rules)**: name the model explicitly when you want predictable control (otherwise Claude auto-selects); use references whenever consistency matters, and lock the character/product/direction *before* building later assets around it; be specific about the *output* not just the subject — include format, action, framing, style, pacing, and intended use; review one single generation before scaling to a multi-variant batch; **you can ask Claude to show the expected credit cost and wait for approval before running a generation** — useful as a standing instruction when budget matters (no hard cap exists, it's a prompt-level instruction Claude honors, not a platform limit).

**Concrete cost example from mcp-for-marketers** (create a reusable campaign character, then a UGC video with it): character reference sheet via Soul 2.0, 4 iterations to get it right = 0.5 credits (~$0.03) total; a 20-second vertical UGC product-review video using the Product Review UGC skill = 270 credits (~$13.50). Total ≈270.5 credits (~$13.53). Lesson stated explicitly: **iterating on the character reference is cheap (fractions of a credit per pass) — refine the character fully before spending on the much-more-expensive video generation.**

---

## 5. FULL LIST OF URLS READ

**Index / enumeration pages**:
- https://higgsfield.ai/blog/guides (guides index — full listing, ~110 posts enumerated on one SSR page, no pagination needed)
- https://higgsfield.ai/sitemap.xml and https://higgsfield.ai/blog/sitemap.xml (used to enumerate all ~230 blog post URLs)
- (English index used throughout; Spanish `/es/blog/guides` not separately fetched — the English sitemap already gave full canonical URL coverage and English guide text was preferred per instructions)

**Explicitly required pages**:
- https://higgsfield.ai/blog/case4k — "Make Viral AI Short Films With This Exact Workflow — Full Tutorial"
- https://higgsfield.ai/blog/full-ad-campaign-inside-claude — "How To Make a Full Ad Campaign Inside Claude"

**Per-model guides read**:
- https://higgsfield.ai/blog/seedance-2-5-prompting-guide
- https://higgsfield.ai/blog/seedance-prompting-guide (Seedance 2.0)
- https://higgsfield.ai/blog/guide-animation-seedance2.0 (fetched, referenced for Seedance 2.0 animation format)
- https://higgsfield.ai/blog/guide-youtube-seedance2.0 (fetched)
- https://higgsfield.ai/blog/Seedream-5.0-Lite-Review-How-to-Comparison
- https://higgsfield.ai/blog/Nano-Banana-Pro-is-Here-Full-Review-and-Guide
- https://higgsfield.ai/blog/Nano-Banana-Pro-Expert-Use-Cases
- https://higgsfield.ai/blog/How-Nano-Banana-Pro-Changing-The-Game
- https://higgsfield.ai/blog/Nano-Banana-2-Gemini-3.1-Flash-AI-Image-Generation
- https://higgsfield.ai/blog/gpt-image-2-5-higgsfield
- https://higgsfield.ai/blog/GPT-Image-1.5-by-OpenAI-is-on-Higgsfield-A-Complete-Guide
- https://higgsfield.ai/blog/Kling-3.0-is-on-Higgsfield-User-Guide-AI-Video-Generation
- https://higgsfield.ai/blog/Kling-2.6-Motion-Control-Full-Guide
- https://higgsfield.ai/blog/kling-motion-control-3
- https://higgsfield.ai/blog/Kling-01-is-Here-A-Complete-Guide-to-Video-Model (fetched, background context on the Kling line)
- https://higgsfield.ai/blog/How-to-Use-Google-Veo-3.1-Complete-Guide-for-the-New-Model
- https://higgsfield.ai/blog/gemini-omni-flash-vfx-video-editing
- https://higgsfield.ai/blog/how-to-use-gemini-omni-flash-multi-shot-video
- https://higgsfield.ai/blog/seedance4k-breakdown (fetched, not separately summarized — overlaps with case4k/Seedance-4k content)
- https://higgsfield.ai/blog/Seedance-4k (fetched, background)
- https://higgsfield.ai/blog/VFX-with-Seedance-4k (fetched, background)
- https://higgsfield.ai/blog/vfx_4k (fetched, background)

**Workflow / technique guides read**:
- https://higgsfield.ai/blog/ai-ad-agency (fetched, background on the ad-agency positioning)
- https://higgsfield.ai/blog/how-to-make-ai-ugc-videos — UGC workflow, Marketing Studio structure, UGC genre table
- https://higgsfield.ai/blog/faceless-videos-ugc-ads-2026 (fetched, background)
- https://higgsfield.ai/blog/Product-Videos-TikTok-Reels-Without-Filming — 10 TikTok/Reels formats + presets
- https://higgsfield.ai/blog/how-to-make-ai-product-photos-without-a-studio — product photo set workflow
- https://higgsfield.ai/blog/ai-product-videos-no-studio (fetched, background)
- https://higgsfield.ai/blog/ai-ecommerce-ads-2026 — ecommerce ad workflow (Marketing Studio vs Seedance 2.5), era selector, full worked prompt
- https://higgsfield.ai/blog/script-to-ai-storyboard-shot-list — Popcorn → Cinema Studio 4.0 storyboard pipeline
- https://higgsfield.ai/blog/script-to-storyboard-ai (fetched, background/overlap)
- https://higgsfield.ai/blog/how-to-make-100-creative-ads — Click to Ad (URL-to-ad tool) + tool comparison table
- https://higgsfield.ai/blog/ai-video-camera-control — Cinema Studio full settings reference + movement dictionary
- https://higgsfield.ai/blog/consistent-characters-locations — two-anchor (Soul ID + location reference) consistency method
- https://higgsfield.ai/blog/tools-for-consistent-ai-characters (fetched, background/overlap with Soul ID content)
- https://higgsfield.ai/blog/Soul-ID-AI-Character-Consistency (fetched, background/overlap)
- https://higgsfield.ai/blog/why-ai-characters-look-weird (fetched, background/overlap)
- https://higgsfield.ai/blog/ai-video-prompt-mistakes — 7 named mistakes + 6-step prompt method
- https://higgsfield.ai/blog/ai-video-hands-faces — hands/faces specific fixes
- https://higgsfield.ai/blog/how-to-avoid-distortions-ai-videos — 10 general distortion tips
- https://higgsfield.ai/blog/ai-video-prompt-adherence-comparison (fetched, background)
- https://higgsfield.ai/blog/make-ai-lipsync-videos — lip-sync/talking-avatar realism guide
- https://higgsfield.ai/blog/consistent-ai-voice-across-videos — voice consistency guide
- https://higgsfield.ai/blog/credits-vs-unlimited-ai-video-generation — cross-platform pricing/credits analysis
- https://higgsfield.ai/blog/ai-video-credits-explained — Higgsfield-specific credit mechanics
- https://higgsfield.ai/blog/claude-higgsfield-mcp-creative-studio — full Claude+Higgsfield MCP guide
- https://higgsfield.ai/blog/Generate-AI-Videos-From-Claude-with-Higgsfield-MCP (fetched, earlier/background MCP article)
- https://higgsfield.ai/blog/mcp-for-marketers — MCP skills catalog + cost example
- https://higgsfield.ai/blog/cinema-studio-guide — "100+ camera, lighting and motion prompts" (fetched, overlaps substantially with ai-video-camera-control; not separately re-summarized)

**Robots/sitemap infrastructure checked**: https://higgsfield.ai/robots.txt, https://higgsfield.ai/sitemap.xml, https://higgsfield.ai/blog/sitemap.xml

Note on method: pages are JS-rendered React (TanStack) but ship fully server-rendered HTML, so `curl -sL -A "Mozilla/5.0" --compressed <url>` followed by HTML-tag stripping reliably returned full article text without needing a headless browser. All content above is paraphrased from these pages except short (<40-word) prompt fragments explicitly quoted and marked as Higgsfield examples, per instructions.
