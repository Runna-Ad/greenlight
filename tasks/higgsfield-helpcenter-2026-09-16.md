# Higgsfield Help Center — Notes for HÜE Prisma

Crawled via `curl -sL` (JS-rendered pages return full article text server-side; no login/signup/downloads performed). Sitemap used to enumerate URLs: `https://higgsfield.ai/sitemap.xml` → `https://higgsfield.ai/creator-hub/sitemap.xml`. All facts below are paraphrased from the cited page; nothing fabricated. Team's plan: Ultimate.

---

## 1. General prompt-writing rules

Source: [How do I write a good prompt?](https://higgsfield.ai/creator-hub/help-center/getting-started/how-do-i-write-a-good-prompt)

- **Core rule: be specific.** Vague prompts make the model guess (differently each time); detailed prompts (subject, details, setting, style) get you closer to what you pictured.
- **Image prompt layers**: subject (who/what) → details (appearance, clothing, expression) → environment (where) → style (photorealistic, cinematic, etc.). Don't need to fill every layer, but precision = control.
- **Video prompting is different from image prompting.** Once you're animating an existing image, the prompt should stop describing *what things look like* (the image already holds that) and start describing *what happens*: action, camera movement, timing, mood.
- **Video prompt = shot list, not a sentence.** For cinematic clips, structure in blocks: Style/mood → Cinematography/camera (lens, movement, framing) → Lighting/color → Action (beat by beat) → Audio (score, ambient, dialogue w/ timing) → Shot list (sequence + durations). Example in the article: a 6-shot/15-second cowboy scene with per-shot lens choices (35mm room / 75mm faces), explicit "NOT" exclusions (NOT CGI, NOT plastic skin, NOT teal-orange grade), timed dialogue lines, and a "strictly non-IP" no-logos/no-readable-text clause.
- **Character consistency across a workflow (4-step pattern that works well)**:
  1. Build a base character: neutral studio shot, plain background, maximal physical detail (age, hair, skin texture, exact clothing, lighting, even camera type) — precision here is what makes the character reusable.
  2. Restyle the same character: explicitly say "keep the exact same [person], same face, same pose, same background/lighting" then describe only what changes (wardrobe etc.). The "keep the same X" phrase is what holds identity steady.
  3. Place the character in a scene: describe the setting cinematically (lighting, depth, mood) so the character feels part of the world.
  4. Animate with video: prompt now covers action/camera/timing/mood, not appearance.
- **Reusing a character across separate generations**: for a real person, train a Soul ID; for video, save the character as an Element and reference it; in image models, attach the character's images as references.
- **Habits that make any prompt better**:
  - Say what you want, not what you don't — positive phrasing generally beats long "no this, no that" lists, though naming a few key things to avoid (e.g., "no readable text," "no plastic skin") does help on detailed shots.
  - Keep it focused for simple tasks — a short clip doesn't need a six-block shot list; match complexity to the desired result.
  - Avoid contradictions between the prompt and the input image (e.g., "still, calm" fights a motion-blurred source frame).
  - **Write in English** — models are trained mostly on English, giving the most predictable results. Exception: Chinese-developed models like **Seedance and Kling** sometimes respond better to **Chinese for nuanced motion**.
- **Iteration method**: generate → look → change ONE thing → generate again. This teaches what each change does. To build a longer sequence, use the last frame of one clip as the starting image for the next, then join in an editor.
- If you don't want to write a detailed prompt, **Supercomputer** takes a rough idea (even "make a TikTok for my sneakers") and fills in the details, checks the plan with you, and routes each step to a suitable model automatically.

Source: [Nano Banana Pro Prompt Guide](https://higgsfield.ai/nano-banana-pro-prompt-guide) (marketing page, but directly prompt-relevant — bonus, not help-center)
- Six prompt variables for max control: **Subject** (be specific — "A Shiba Inu with metallic plating," not "dog"), **Composition** (direct the virtual camera: "macro lens for texture," "isometric view from above," "fisheye distortion"), **Action** (define movement/energy, avoid static), **Location** (establish atmosphere), **Style** (medium/aesthetic), plus **Camera and lighting details** (lens focal length, aperture, shutter speed for realistic depth).
- Specify **aspect ratio numerically** (e.g., 16:9, 2:3) and define shot scale to prevent composition drift.
- **Text in images**: isolate the literal string in double quotes, explicitly name the font family.
- **Negative/factual constraints**: use negative constraints to prohibit geometric distortion or biological inaccuracies (useful for charts/diagrams).
- **Reference weighting**: when using image inputs, you can assign weight values to control how much influence an uploaded reference retains.
- **Command-style syntax**: remove polite filler ("please") — models lose focus on conversational language; write like a command line.
- **Negative constraints as a block**: explicitly list exclusions to narrow the model's output space.
- **Lock the seed** for a consistent series once you like a result.
- **"Shot on [specific camera gear]"** tags (e.g., "full-frame cinema camera") push the model toward photorealism/specific film grain.

---

## 2. Per-model notes

### Model picker overview
Source: [Which AI model should I use?](https://higgsfield.ai/creator-hub/help-center/ai-models/which-ai-model-should-i-use)

Images: **Soul** (fashion/cinematic/character consistency), **Popcorn** (storyboards/multi-frame), **Nano Banana** (speed + reference control), **GPT Image** (text rendering/color accuracy), **Seedream** (visual reasoning / complex prompts), **Recraft** (photorealistic or vector), **FLUX** (speed-optimized detail).
Video: **Higgsfield DOP** (VFX/camera control), **Seedance** (realistic human motion), **Kling** (longer/multi-shot, cinematic), **Wan** (first/last frame control), **Grok Imagine** (synced audio), **Sora** (OpenAI), **Veo** (Google), **Minimax Hailuo** (high-dynamic, fast).
Audio: **Seed Audio** (all-in-one: dialogue, music, effects, TTS, voice clone, dubbing — available via MCP + Adobe Premiere/DaVinci plugins), **Eleven** (emotional nuance), **MiniMax Speech**, **Seed Speech** (multilingual), **VibeVoice** (long-form).
Models auto-update to latest version within a family; switching models never deletes existing generations. Credit cost varies by model family, resolution, duration — shown before confirming.

### Kling (3.0, Turbo, Motion Control)
Source: [How do I use Kling?](https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-kling)

| Model | Best for | Max resolution | Duration |
|---|---|---|---|
| Kling 3.0 | Scene-based multi-shot filmmaking with audio | 4K | 3-15s |
| Kling 3.0 Turbo | Fast iteration on 3.0 base | 1080p | 3-15s |
| Kling 3.0 Motion Control | Transfer real motion onto a character | 1080p | 3-30s |
| Kling 3.0 Omni | Highest-quality gen+edit in one model | 4K | 3-15s |
| Kling 3.0 Omni Edit | Editing existing footage | 1080p | 3-10s |

- **Kling 3.0 and 2.6 generate with native audio** (SFX, speech, music synced to action) — toggle off if not needed.
- **Multi-shot workflow**: write a description per scene (action, setting, camera move, mood) as connected narrative beats. Upload Start/End Frames to anchor motion — use the final frame of one scene as the start frame of the next to chain shots seamlessly. Add **Elements** to lock character/product/object identity across all scenes. Select **genre** (General, Action, Horror, Comedy, Noir, Drama, Epic) and **speed ramp** (Linear, Auto, Flash In/Out, Slow-mo, Bullet Time, Impact, Ramp Up).
- **Kling Turbo**: speed-optimized for drafting/prompt testing before a full render; supports text-to-video and image-to-video; available on web, Supercomputer, MCP, CLI.
- **Kling 3.0 Motion Control**: provide (1) a character image — arms/hands visible, space around body, clear background, and (2) a motion reference video — clean footage, clear subject, framing matching the character image, NO camera cuts. Applies motion/timing/expression from the reference while preserving character face/style. Works well for dance, athletics, martial arts, jumps, weight shifts, hand articulation; you can change the scene environment via prompt while keeping the same motion. Also available as a tool in Higgsfield MCP.
- **Accuracy fixes**: disconnected scenes → chain via start/end frames; identity drift → add character as Element; bad Motion Control → check arms/hands visible + no cuts in reference video; long queue → use Turbo for drafts, switch to full model for finals (if stuck >10 hours, contact support).
- Talking avatar: use **Kling Avatars 2.0** in Lipsync Studio (turns one image + audio into a talking video), not Kling video directly.

### Seedance (2.0 / 2.0 Mini / 2.5 / Fast)
Source: [How do I use Seedance?](https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-seedance)

| Variant | Best for | Resolution | Clip length |
|---|---|---|---|
| Seedance 2.5 | Longest clips, synced audio (latest) | up to 1080p on Pro/Plus+ | 4s–30s |
| Seedance 2.5 Edit | Editing existing clips incl. audio | 480p–720p | matches source |
| Seedance 2.0 | Max quality, full multimodal input | 480p–4K | 4s–15s |
| Seedance 2.0 Fast | High-volume iteration | 480p–720p | 4s–15s |
| Seedance 2.0 Mini | Max speed, short-form | 480p–720p | 4s–15s |

- Seedance takes text, images, video clips, and audio at once and generates video with native sound in one pass, with lip sync in multiple languages.
- Seedance **2.5**: up to 30s, any aspect ratio 9:16–21:9, synchronized audio in same pass, **accepts up to 50 references** (30 images, 10 video clips, 10 audio files), better prompt adherence than 2.0. Available Pro/Plus plans and above only.
- Seedance **2.0**: combine up to 9 images, 3 video clips, 3 audio files in one generation.
- **First-generation workflow**: start image-to-video at 720p (sharp, front-facing, well-lit reference image + short action/camera prompt — cheaper and more predictable than text-only) → write a structured prompt in order: subject+action, setting+lighting, camera move, mood/atmosphere → review the full clip (quality problems usually appear at 5–8s mark) → change ONE thing per iteration → once composition is right at 720p, rerun at 1080p/4K with the identical prompt.
- **Camera terms Seedance reads directly**: dolly in, truck left, arc shot, push in, pull back wide, handheld follow, crane up, orbital move.
- Example prompt structure: *"A character walks through a crowded train station at rush hour, checking a phone, camera tracking close at shoulder height, warm overhead fluorescent light, tense and rushed. SFX: station ambient noise, announcements in the background."*
- **Reference (@) system**:
  - `@character` — holds face geometry, skin tone, style consistent **within the clip**
  - `@style` — applies lighting, palette, mood from an image/film still
  - `@motion` — reads camera behavior/motion pattern from a video clip and replicates it
  - `@audio` — syncs visuals to audio, generates lip sync, matches ambient sound
- **Character across separate generations**: `@character` only holds consistency within one generation; for reuse across clips, save as an **Element** (click `@ Elements` under the prompt field, or type `@` in the prompt, select the character — no re-upload). For a real person, train a Soul ID first, then create the Element from its portraits.
- **Accuracy fixes**: ignored camera instruction → use specific terms (dolly in, pull back wide, arc right, crane up) not vague ones; character drifts mid-clip → add specific visual anchors (hair color, clothing, distinguishing features) + reference as Element cross-generation; jerky cut → generate the final frame of one clip + opening frame of next as references, use first-and-last-frame for the transition; credits draining → prototype at 720p short clips, lock the prompt, then run final at full res/length.
- Works in Canvas, MCP, CLI, Supercomputer — but **all generations through those channels always deduct credits regardless of Unlimited status on web**.
- FAQ confirms: native audio toggle does **not** change credit cost — cost depends on model/resolution/duration only.

### Nano Banana family (Pro, 2, 2 Lite, edit)
Source: [How do I use Nano Banana?](https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-nano-banana)

| Model | Best for | Key detail | Max references |
|---|---|---|---|
| Nano Banana Pro | Complex scene generation w/ reasoning | Analyzes prompt before rendering, up to native 4K | 14 |
| Nano Banana 2 | Fast bulk gen at Pro-level quality | Up to 5 consistent characters + 14 stable objects | 14 |
| Nano Banana 2 Lite | Fastest tier, high-volume drafts | ~4s per image, 1K resolution | 14 |
| Nano Banana (base) | Edit an existing image by instruction | Works by instruction, adds/edits text on images | 8 |

- **Nano Banana Pro** has a reasoning core: analyzes the prompt before rendering — evaluates object relationships, checks logical consistency, interprets quantities/spatial layout/lighting. Best for precision with quantities, text, faces, perspective.
- **Workflow (Pro/2/2 Lite)**: choose input mode (Text-to-Image, Multi-reference, Image-to-Image) → write a clear specific prompt (subject, setting, lighting, exact quantities/text) → add up to 14 references, **describe each reference's role in the prompt** → set resolution (start 1K while iterating, scale to 2K/4K for finals) → generate and iterate (change prompt OR reference, not both at once).
- Nano Banana 2 Lite has no resolution picker — instead pick aspect ratio + a **Thinking level (High or Minimal)**.
- **Editing (base Nano Banana)**: upload/create a base image → short instruction ("Change the background to a Parisian café at night," "Replace the T-shirt with a black leather jacket," "Insert text: FUTURE IS NOW") → up to 8 references, each with its role described → generate. Keeps characters consistent between frames, understands product/cultural context, adds/edits text.
- **Character consistency**: use the same reference images of the character in every generation via Multi-reference input, describe the character's role in the prompt.
- **Accuracy fixes**: ignored quantity/layout → be explicit ("exactly 3 bottles on the left side" not "a few bottles"); blurry/misspelled text → put exact text in quotes + describe font style/size/placement; blurry at 2K/4K → retry, or generate lower-res and upscale; reference rejected → check JPG/PNG/WebP + size limit, avoid heavy compression/watermarks.
- Text rendering: **Nano Banana Pro and Nano Banana 2** both render accurate typography — put exact text in quotes.

### Higgsfield DoP (Director of Photography — proprietary image-to-video)
Source: [How do I use DoP?](https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-dop)

- Higgsfield's native cinematic image-to-video model: give it a single image + a **preset** (motion blueprint defining camera logic/effect), and it generates a coherent directed shot. Appears as "**Higgsfield Standard**" in the model selector.
- **Workflow**: open Video → Create Video → select a DoP preset → add keyframe image (upload PNG/JPG, paste, or generate inline) → pick a preset (categories: Effects, Basic Camera Control, Epic Camera Control, Catch the Pulse, New/Trending; "Top Choice" = curated highlights; "Mix" = combine presets in one generation) → describe the scene in the prompt (**Enhance** toggle auto-expands the prompt) → Advanced settings: clip duration (3 or 5 seconds), seed, steps → Generate.
- Best for: cinematic video from keyframes, creative storytelling, ads/branded visuals, image-driven pipelines (e.g., Popcorn storyboards animated with DoP).
- **Fixes**: soft/blurry clip → start from a sharper keyframe; wrong motion → try a different preset/category; scene barely changes → add prompt specifics or turn on Enhance.
- DoP presets are available through MCP too (Claude can browse and generate with them).

### Soul family (Soul, Soul 2.0, Soul Cinema) + Soul ID
Source: [How do I use Soul to generate images?](https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-soul-to-generate-images), [How do I create and use a Soul ID character?](https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-create-and-use-a-soul-id-character), [How do I use Soul Cinema?](https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-soul-cinema)

| Model | Best for | Key features |
|---|---|---|
| Soul | Quick preset-driven generation | Style presets, avatar support |
| Soul 2.0 | Full creative control | Presets, Moodboard, Soul HEX, Soul ID, reference image |
| Soul Cinema | Cinematic-grade visuals | Soul HEX, Soul ID, cinematic style built in |

- **Soul**: select a preset (General, TikTok Core, Instagram Aesthetics, Beauty, Mood, Camera Photo, Graphic Art) → write a prompt (or leave empty) → set batch size + aspect ratio → Generate. Can generate with an avatar (Character section).
- **Soul 2.0**: combine prompt + preset/Moodboard + Soul ID character + Soul HEX palette. **When a reference image is attached, the prompt field becomes unavailable** — the reference becomes the primary direction (Soul ID and Soul HEX can still be applied alongside it). Same rule applies in Soul Cinema.
- **Moodboards** (Soul 2.0 only, not in Soul or Soul Cinema): custom reusable style presets from your own images; Soul 2.0 analyzes lighting/texture/contrast/color. Curated (Y2K Studio, Digital Camera, Retro BW) or Personal. For a strong result: 20+ images, one cohesive aesthetic, **no faces**, avoid blurry/mixed styles.
- **Soul HEX** (Soul 2.0 + Soul Cinema only): color-control tool — upload a reference and it extracts the dominant palette and applies it, or choose built-in palettes (Film colors, Lime Jam, Candy pink, Nostalgic blue, Soft palette, Black gloss). Access via "Color Transfer" in the generation bar.
- **Generation settings**: Aspect ratio 9:16, 3:4, 2:3, 1:1, 4:3, 16:9, 3:2. Quality: 1.5k or 2k. Batch size 1–4 images.
- **Soul Cinema**: no presets/Moodboards — cinematic aesthetic is built in. Close-up shots, atmospheric mood, rich textures. Works especially well as a **keyframe input for Kling or Seedance**. Workflow: write a scene/subject/mood prompt → optional Soul HEX → optional Soul ID → set aspect ratio/quality/batch → Generate.

**Soul ID (character-consistency training)**:
- Train once on **20+ photos of one person (up to 80 supported)**; works across the whole Soul family regardless of preset/lighting/angle/prompt.
- Photos that help: varied angles/expressions, clear well-lit face, recent (last 4–5 months), at least one full-height shot, no obstructions, single subject per photo.
- Photos that hurt: same pose repeated, heavy shadows, outdated photos, headshots only, sunglasses/hats/scarves, group shots.
- Training takes a few minutes. Only upload photos of yourself or someone who gave permission.
- **Use outside Soul models**: works in Seedance video via **Elements** — trained Soul characters appear in Elements automatically. To use: click `@ Elements` under the prompt field (or type `@`) and pick from "My Elements."
- **Limits**: expect "clearly the same person," not pixel-identical, across every generation; extreme style shifts/unusual angles can introduce drift; one Soul ID = one person (use Elements for 2+ consistent characters in a scene); not exportable as a standalone file (only the generated assets are downloadable).

### Popcorn (native storyboard generator)
Source: [How do I use Popcorn?](https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-popcorn)

- Generates up to **8 connected frames** where identity, lighting, atmosphere persist across shots (unlike most image models where each prompt is independent). Can combine real photos + AI-generated images in one sequence.
- **Modes**: Manual (direct every frame yourself), Auto (one prompt, choose up to 8 frames, Popcorn expands the story), Instadump (upload your own photos → generate a styled set based on a reference pack).
- **References**: up to **4 image references** (portraits, props, locations), merged and addressed by number in the prompt: *"Man from image one in the setting of image three, wearing the outfit from image four."*
- **Prompt structure (film cue)**: Subject → Setting → Style (cinematic/anime/realistic/concept art) → Action → Atmosphere. Example: *"Cinematic style. A woman from image one walking through a neon-lit Tokyo street from image three, holding the umbrella from image two. Slow rain, reflections on asphalt, shallow depth of field."*
- **Instadump**: choose/create a style pack (up to 15 reference photos) → upload your own photo → get new images styled like you in that pack's aesthetic.
- **Aspect ratios**: 3:4 (portrait/character), 2:3 (cinematic balance), 3:2 (editorial), 4:3 (classic), 16:9 (widescreen/YouTube), 1:1 (social), 9:16 (Reels/TikTok/Shorts), or Auto. Keep input aspect ratio consistent with target output.
- **Turning storyboard into video**: use a Popcorn frame as a start frame/reference for Kling or DoP; chain the final frame of one clip into the next for continuous motion.
- **Fixes**: style drift between frames → lead with style keywords at the start of the prompt; generic scene → describe the action not the genre ("a knight walks through fire" > "fantasy movie"); mood not landing → use clear emotional language in the atmosphere part; iterations resetting the look → refine the text prompt instead of re-uploading inputs.
- Popcorn ≠ Soul ID: Popcorn = consistency across frames of one sequence; Soul ID = one trained identity across separate generations. They combine well (use a Soul-generated character as a Popcorn reference).

### Lipsync, voiceover, aspect ratios, native audio
Source: [How do I use lipsync, voiceover, and aspect ratios?](https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-lipsync-voiceover-and-aspect-ratios)

- Voice generation (Text to Speech / Voice Change / Translate to 18 languages) lives in **Audio**. Making a character talk (lip sync) lives in **Lipsync Studio**. These are separate tools.
- **Lipsync Studio models**: Google Veo 3.1 (image→video, cinematic talking), Kling 2.6 Lipsync (up to 1080p w/ audio), Wan 2.5 Speak (480–1080p w/ audio), Kling Avatars 2.0 (talking avatars, longer clips), Higgsfield Speak 2.0 (priority-queue speed), Infinite Talk (long-form), Kling Lipsync / Sync Lipsync 3 (video-to-video, up to 4K precision).
- **Native audio co-generation** (audio produced in the same pass, not layered after): **Seedance 2.5** (synced audio same pass), **Kling 3.0** (SFX/speech/music synced to action), **Seedance 2.0** (voice/lip sync/ambience unified), Flux 3, MiniMax Hailuo 3.0, Wan 2.5 (sound sync with camera movement). **Cinema Studio generates native audio across all versions.**
- **Aspect ratios per tool/model**: 9:16 vertical (TikTok/Reels/Shorts), 16:9 horizontal (YouTube/film), 1:1 square (Instagram feed), 4:3 standard, 3:4 portrait (Pinterest), 21:9 ultrawide cinematic. Some models support **Auto** (infers ratio from input image). Not every model supports every ratio.
- To **change aspect ratio after generation**: video → **Reframe tool** (Edit → Reframe); image → **Expand** (outpaints canvas to new ratio, preserving original content).
- Voice cloning: only clone your own voice or one you have permission to use.

---

## 3. References / @ elements syntax and attaching images/videos

Consolidated from Seedance, Canvas, Kling, and Soul ID articles (there is no single dedicated "references" help-center article, but the mechanism recurs consistently):

- **`@` in the prompt field opens Elements/reference picker** — click `@ Elements` under the prompt field, or type `@` directly in the prompt text, to pull in saved Elements, your uploads, or past generations. ([Soul ID article](https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-create-and-use-a-soul-id-character), [Seedance article](https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-seedance))
- **Seedance typed reference tags**: `@character` (face/skin/style within a clip), `@style` (lighting/palette/mood from an image or still), `@motion` (camera behavior/motion pattern from a video clip), `@audio` (sync visuals to audio, lip sync, ambient match). Multiple references combine in one generation (up to 30 images/10 video/10 audio on Seedance 2.5).
- **Elements** = the cross-generation reusable reference object (character, location, or prop), distinct from an in-clip `@character` tag which only holds consistency within a single generation. Create an Element from any generated asset: open it in Assets → three-dot menu → "Create Element." Trained Soul ID characters appear as Elements automatically.
- **Canvas node behavior differs by model**:
  - **Seedance nodes**: a connected reference image does nothing on its own — you must **describe the reference's role explicitly at the start of the prompt** (main character / location / product / other asset). Purely visual connection is not enough.
  - **Kling nodes**: a directly connected image is treated as a **start frame**, not a character reference. For Kling character/element references, create the element on the platform first, then reference it by its **`@element-name` tag** in the prompt.
  - Audio nodes can attach to video generation nodes for voice reference/voiceover/sync workflows.
  (Source: [How do I use Canvas for multi-node generation?](https://higgsfield.ai/creator-hub/help-center/tools/how-do-i-use-canvas))
- **Popcorn references**: up to 4 images, addressed **by number** in the prose prompt (not by @tag): *"...from image one... in the setting of image three... wearing the outfit from image four."* (Source: Popcorn article above.)
- **Nano Banana / Nano Banana Pro / 2 / 2 Lite references**: up to 14 (8 for base editing Nano Banana); attach and **describe each reference's role in the prompt text**. Multi-reference input mode disables the prompt-free direction; describing role is still required in-prompt.
- **Cinema Studio references**: 3.0 supports up to 9 references (characters/locations/scene details) via a `+` picker (device uploads, saved Elements, past generations, liked assets); 4.0 supports up to 50 references (images, videos, Soul Cast characters).
- General rule across models: **when in doubt, describe what each attached reference is for, in the prompt itself** — the visual connection alone is frequently not sufficient (explicit in Seedance/Canvas docs, implied everywhere else).

---

## 4. Camera controls and presets

Source: [Camera Controls page](https://higgsfield.ai/camera-controls) (marketing/preset gallery for Higgsfield DoP — bonus, not help-center, but the authoritative preset name list) and [How do I use DoP?](https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-dop)

- DoP's preset system is the mechanism: each preset is a "motion blueprint" defining camera logic/effect. Categories: **Effects**, **Basic Camera Control**, **Epic Camera Control**, **Catch the Pulse**, plus New/Trending feeds. "Top Choice" = curated highlights; "Mix" lets you combine multiple presets in one generation.
- Full preset name list (50+, exact names as they must be selected/referenced in the UI): Eyes In, Bullet Time, Aerial Pullback, Arc Left, Arc Right, BTS, Buckle Up, Car Chasing, Car Grip, Crane Down, Crane Over The Head, Crane Up, Crash Zoom In, Crash Zoom Out, Dolly In, Dolly Left, Dolly Out, Dolly Right, Dolly Zoom In, Dolly Zoom Out, Double Dolly, Dutch Angle, Eating Zoom, Fisheye, Flying Cam Transition, Focus Change, FPV Drone, Glam, Handheld, Head Tracking, Hero Cam, Hyperlapse, Incline, Jib down, Jib up, Lazy Susan, Low Shutter, Mouth In, Object POV, Overhead, Pan Left, Pan Right, Rapid Zoom In, Rapid Zoom Out, Road Rush, Robo Arm, Snorricam, Static, Super Dolly In, Super Dolly Out, Through Object In, Through Object Out, Tilt Down, Tilt up, Timelapse Glam, Timelapse Human, Timelapse Landscape, Whip Pan, Wiggle, YoYo Zoom, 360 Orbit, Zoom In, Zoom Out, 3D Rotation, General.
- Separately, **free-text camera vocabulary that Seedance reads directly** (not a preset picker, just prompt language): dolly in, truck left, arc shot, push in, pull back wide, handheld follow, crane up, orbital move.
- **Cinema Studio 3.5** per-shot camera controls: Camera, Lens, Focal length, Aperture set per individual shot; global project settings (Genre, Style, Lighting, Color Palette, Camera MoveSet Style) apply project-wide — 8 color palettes, 10 Camera MoveSet styles "inspired by real-world cinematographers," 6 lighting presets.
- **Cinema Studio 4.0 Director's Panel**: Film Setup = genre (General, Action, Epic, Drama, Comedy, Horror, Noir), era (60s–2020s), tempo/editing style (Single Shot to Chaotic). Camera = camera choice (incl. 35mm Film, 8mm Film, DV Camcorder), lens (clean sharp to anamorphic/vintage), aperture, camera moves (POV, Robot Arm, Helicopter Shot). Color Palette = 50+ grading templates. Lighting = 6 presets or custom (color, brightness, diffusion, angle). Character emotion slider controls performance expressiveness.
- **Genre and speed-ramp options (Kling / Cinema Studio 3.0)**: Genres — General, Action, Horror, Comedy, Noir, Drama, Epic. Speed ramps — Linear, Auto, Flash In/Out, Slow-mo, Bullet Time, Impact, Ramp Up.

---

## 5. Troubleshooting

### Generation stuck or failed
Source: [My generation is stuck or failed. What should I do?](https://higgsfield.ai/creator-hub/help-center/troubleshooting/generation-is-stuck-or-failed)
- Status meanings: **Queued not moving** → hover tile → Cancel → retry (instant, credits returned). **"Something went wrong"** → temporary error or skipped captcha → refresh, complete captcha, retry. **"You've hit your limit of generations at the same time"** → parallel limit full → cancel a queued job or wait, or buy Concurrency Boost. **"Rejected due to copyright restrictions"/"IP detected"** → see IP section below. **Flagged as NSFW** → see NSFW section below. **"Failed, Credits refunded"** → just retry.
- Processing stage: Cancel may no longer work (already running on backend) — wait for it to finish/fail.
- Credit generations run in priority queue (faster); Unlimited/free generations run on a shared pool (can be slower under load).
- Failure causes: content checks (NSFW/copyright), incomplete captcha, very long/complex prompts or heavy input files, temporary technical errors.
- Credits are refunded automatically for most failures, usually within minutes (**exception: Grok is charged the moment generation starts**, no refund pattern implied for failures).
- If nothing works after retries: try a different browser/incognito; if still stuck in Processing/Generating, contact support with generation ID, model, error message, browser/OS.

### NSFW false positives
Source: [Why was my content flagged as NSFW...](https://higgsfield.ai/creator-hub/help-center/troubleshooting/content-flagged-as-nsfw)
- Two layers of filtering: Higgsfield's own safety system (prompt processing + image upload/reference stage) AND each external provider's own independent system (Nano Banana, Seedream, Kling, Sora 2, MiniMax, Wan, Veo) — Higgsfield doesn't have visibility into external providers' internal rules, so the exact trigger isn't always knowable.
- Common false-positive triggers: swimwear/revealing clothing, athletic/fitness content, medical/anatomical imagery, borderline-composition reference images, ambiguous prompt wording.
- Fixes: rephrase prompt with neutral/specific language; swap/remove the reference image; **combine image + text** — an image-only input without a descriptive prompt is more likely to false-positive; try a different model (each provider's classifier differs).
- Credits for flagged generations are returned automatically for most models; verify in Manage Account → Usage. Higgsfield **cannot manually override a classifier decision** — only confirmed false positives get credits back, not unblocked content.

### Copyright / IP blocks
Source: [Why was my generation blocked for copyright or IP?](https://higgsfield.ai/creator-hub/help-center/troubleshooting/my-generation-blocked-for-copyright-or-ip)
- Triggers: named fictional characters (Disney/Marvel/DC/Pixar/Nintendo etc.), sports team/league names (NBA/NFL/EPL), named living artists whose style is referenced, branded product names/logos as the subject. Also triggered by **reference images** containing visible logos/branded merch/recognizable characters, even with a clean prompt.
- Some models (e.g., **Seedance**) run their own separate IP check that Higgsfield can't override.
- Fix: **rephrase using descriptive language instead of proper names** — e.g. "Spider-Man" → "a hero in a red and blue suit with a web pattern"; "Mickey Mouse" → "a cartoon mouse with round ears and white gloves"; "in the style of [artist]" → "in a style with bold brushwork and vivid colors." Remove branded reference images.
- If the blocked input is something you own, an **"I own the rights for this image"** button may appear (lower-right of the generation) — can unblock if eligible, but most blocks on original content still can't be lifted (system is conservative by design). IP blocks are platform-wide, never overridden per-account.
- Credits typically refunded automatically.

### Video upscale stuck/failed
Source: [My video upscale is stuck or failed...](https://higgsfield.ai/creator-hub/help-center/troubleshooting/my-video-upscale-is-stuck-or-failed-what-should-i-do)
- Normal wait: 1–5 minutes. Stuck >5 min → hover job tile in Assets → Cancel → retry.
- **Video upscale models**: ByteDance Upscale (high-fidelity, up to 8K, preset-tuned — sharpens/enhances what's already there) vs. Topaz Video (diffusion-based, **invents** creative detail while upscaling).
- **Image upscale models**: Topaz (default, general-purpose), ByteDance Upscale (up to 4K), Topaz Generative (diffusion-based, invents detail).
- **Rule of thumb**: use ByteDance/default Topaz when the output must stay exactly as generated (product shots, text-heavy visuals, approved client deliverables); use the diffusion models (Topaz Video/Topaz Generative) only for creative work where invented detail is acceptable.
- Common failure causes: unsupported input format (use MP4/H.264), source quality too low to reconstruct detail, queue overload during high platform load.
- Credits refunded automatically for failed upscales.

### Site won't load / bug reports
Not deep-read in full (low prompt-relevance), but index confirms: [Higgsfield site won't load](https://higgsfield.ai/creator-hub/help-center/troubleshooting/higgsfield-site-wont-load) and [How do I report a bug or submit a feature request?](https://higgsfield.ai/creator-hub/help-center/troubleshooting/how-do-i-report-a-bug-or-submit-a-feature-request) exist as generic technical-support pages (browser refresh/incognito guidance, contact form) — not prompt-relevant, skipped in depth.

### Identity drift (cross-references)
- Seedance: add more specific visual anchors (hair color, clothing details, distinguishing features); use Element reference for cross-generation consistency, not just `@character`.
- Soul ID: weak/inconsistent training photo sets = weak identity; extreme style shifts or unusual angles can introduce drift even with good training; retrain on a stronger, more varied, recent photo set if generations stay inconsistent.
- Kling: character identity shifts between scenes → add the character as an Element before generating.

### Text rendering
- Nano Banana Pro and Nano Banana 2 render accurate typography — put exact text in quotes, describe font style/size/placement explicitly. GPT Image is also specifically called out (model-picker doc) as best for "accurate text rendering or precise color."

---

## 6. Tools overview (relevant to guiding designers step by step)

### Which tool to use for which goal
Source: [Which Higgsfield tool should I use?](https://higgsfield.ai/creator-hub/help-center/tools/which-higgsfield-tool-should-i-use)

| Goal | Tool |
|---|---|
| Cinematic video with camera control | Cinema Studio |
| Consistent characters across multiple video clips | Cinema Studio + Soul ID |
| Product ad from a URL/image | Marketing Studio |
| UGC-style ads at scale | Marketing Studio |
| Consistent AI influencer / virtual character | AI Influencer |
| Chain multiple models into one workflow | Canvas |
| Real-time team collaboration on generations | Canvas |
| Save/reuse a workflow as a template | Canvas |
| Run a whole creative project from one chat | Supercomputer |
| Generate from Claude | MCP |
| Generate from a coding agent | CLI + Skills |

### Cinema Studio (2.5 / 3.0 / 3.5 / 4.0)
Source: [How do I use Cinema Studio?](https://higgsfield.ai/creator-hub/help-center/tools/how-do-i-use-cinema-studio)
- 4.0 loads by default (runs on Seedance 2.5); version selector switches 2.0–4.0.
- **2.5**: up to 3 Soul Cast characters from Elements; define location in prompt; post-production Colorgrade (Color Temperature, Contrast, Saturation, Sharpness, Film Grain, Highlights, Exposure); "Save to Elements" to reuse actors.
- **3.0**: reasons about physical interaction (collisions carry weight, natural momentum, fabric/environment render higher fidelity); up to 9 references; genre + speed ramp + camera movement configuration; native synced audio; content-protection system blocks real faces/protected IP with "May contain protected content."
- **3.5**: video-first; per-shot camera settings (Camera, Lens, Focal length, Aperture) vs. global project settings (Genre, Style, Lighting, Color Palette, MoveSet Style — 8 palettes/10 movesets/6 lighting presets); Elements system (project-scoped, pullable cross-project); **Claude Chat AI Director** — Claude adjusts Genre/Style/Camera and can break a script into shots with pre-filled camera params, populates the prompt box for review, **never triggers generation itself**; team collaboration with shared Elements.
- **4.0**: Director's Panel (see Camera Controls section above); up to 50 references; clips up to 30 seconds; Video modes — References (new clip), Forward/Backward Extend (continue an uploaded clip up to 30s in either direction), Edit Video (regional edits without full regeneration).
- Common issues: AI Director stuck/Pin auto-triggers → refresh, then log out/in; blocked for protected content → remove real faces/copyrighted IP; video won't upload → check version limits (2.5 no video upload, 3.0/3.5 up to 15s, 4.0 up to 30s).
- Credit/Unlimited status depends on whether Cinema Studio models are in your plan's Unlimited list (check Pricing page).

### Marketing Studio (ads/UGC)
Source: [How do I use Marketing Studio to create video ads?](https://higgsfield.ai/creator-hub/help-center/tools/how-do-i-use-marketing-studio-to-create-video-ads)
- Template-first: 1,500+ templates across Product Shots (Studio/Lifestyle/With Model), Ads (Meta/Google specs), Marketplace, Posters (editable via Higgsfield Layers), UGC Videos (Faceless/Talking Head/Silent), Motion (Hypermotion, 2D Product Motion, Mixed Media, Motion Design — from logo/website for software products), Ref → Video.
- Connect brand: upload product image or paste a website/product URL — auto-extracts product imagery, logo, colors, copy.
- Prompt path still exists for anything no template covers.
- **Match an existing ad**: in UGC Videos, drop in a reference ad you're allowed to use; Marketing Studio reproduces its structure/format with your product substituted.
- **Virality Predictor**: scores a generated video's virality potential/engagement/attention-holding before publishing — an estimate, not a guarantee.
- **Brand Kit**: enter website URL to auto-extract logo/colors/fonts/imagery/tone, or fill manually — keeps ads on-brand.
- **Spokesperson consistency**: train a Soul ID once (20+ photos); every ad variation after reuses the same face automatically.
- **Limits**: max clip length 15s per generation; editing after generation only in Posters category (others are regenerated, not edited); **not available through Supercomputer/MCP/agentic channels yet** (web only).

### Canvas (multi-node)
Source: [How do I use Canvas for multi-node generation?](https://higgsfield.ai/creator-hub/help-center/tools/how-do-i-use-canvas)
- Node-based infinite board; every Higgsfield model is a node; chain prompt → image → video → edit; run nodes in parallel and compare side by side; save workflow as a reusable template; real-time team collaboration (Share option). Credits deducted only when a node actually generates (building/connecting is free).
- Reference behavior differs by node type — see Section 3 above (Seedance vs Kling nodes).
- Also usable inside **Figma/FigJam** via the official Higgsfield plugin (Canvas Nodes with automatic pipelines) — search "Higgsfield AI" in Figma/FigJam plugins.
- **Unlimited does not apply in Canvas** — all Canvas generations deduct credits regardless of plan.
- Common issues: not loading → hard refresh (Ctrl/Cmd+Shift+R), then incognito/different browser; froze and lost work → autosaves periodically, hard refresh restores latest autosave; if a specific generation is affected, contact support with the generation ID (from the generation's page URL in Assets).

### AI Influencer (character builder)
Source: [How do I use AI Influencer?](https://higgsfield.ai/creator-hub/help-center/tools/how-do-i-use-ai-influencer)
- Menu-driven (no prompt writing) character builder, up to 4K output. Builder panel: Character Type, Gender, Ethnicity/Origin, Skin Color, Eye Color, Skin Conditions, Age. Advanced settings: Face / Body / Style tabs.
- Supports humans, mammals, reptiles, fish, hybrids, aliens — categories can blend.
- Text-edit field ("Type to customize character") lets you nudge a generated character with a text instruction — costs credits, shown before confirming.
- Animate: video button under preview, or use **Motion Control** with your own recorded reference video to drive the character's movement while keeping its look; movement templates available as an alternative to recording yourself. For talking-head, add lipsync separately.
- To reuse the character elsewhere: generate a batch of portraits, train a Soul ID on 20+ of them (works in Soul 2.0 / Soul Cinema after that).

### Supercomputer (agentic workspace)
Source: [How do I use Supercomputer?](https://higgsfield.ai/creator-hub/help-center/tools/how-do-i-use-supercomputer)
- Chat-driven agent: describe a goal in plain language, it plans steps, picks a model per step, runs them, assembles the result; connects to external apps (Telegram, Slack, TikTok, Gmail, Google Drive, Notion, etc. under Connectors) so a task can pull in/push out data beyond Higgsfield.
- LLM behind the chat can be auto-routed or manually picked (Anthropic, OpenAI, Google, xAI, DeepSeek models available) — automatic routing is cheaper/faster (sends each step to a suitable model rather than running everything on one flagship).
- Workspace sections: New chat/Search, **Apps** (built apps), **Games**, **Skills** (official Higgsfield skills like Product UGC, Faceless Video, Shorts Maker, YouTube Covers, Personal Clipper, TV Commercials, Animated Infographics, Localization — plus community and personal skills; Supercomputer also auto-builds skills from your chats), **Connectors**, **Memory** (context kept between chats), **Faceless channel** (up to 15-min YouTube videos from a topic: 12 visual styles, AI script, voiceover, 2D animation, music, subtitles).
- Storage: workspace storage measured against plan allowance; buy more via Manage Storage.
- **Supercomputer vs MCP**: Supercomputer runs inside Higgsfield's own web chat (Unlimited access applies, web only); MCP runs inside your own AI assistant like Claude (always deducts credits, no Unlimited).
- All Supercomputer generation steps deduct credits at standard rates; a complex multi-step task costs more than a single generation.

### Higgsfield Apps (Supercomputer-built products)
Source: [What are Higgsfield Apps...](https://higgsfield.ai/creator-hub/help-center/tools/what-are-higgsfield-apps) — lower relevance to prompt-writing; briefly: describe an app idea in Supercomputer, pick a template (App detail / Preset / Studio), agent scaffolds design/code/database/auth; app users sign in with their own Higgsfield accounts and pay their own credits for generations. Not directly prompt-relevant, skipped for depth.

---

## 7. Credits, Unlimited, and watermark notes (context for cost-aware prompting)

Source: [What are Unlimited models...](https://higgsfield.ai/creator-hub/help-center/credits/what-are-unlimited-models-and-which-plans-include-them), [How do credits work?](https://higgsfield.ai/creator-hub/help-center/credits/how-credits-work), [What uses my credits?](https://higgsfield.ai/creator-hub/help-center/credits/what-uses-my-credits), [Watermark article](https://higgsfield.ai/creator-hub/help-center/credits/watermark-and-how-to-remove), [Concurrency Boost](https://higgsfield.ai/creator-hub/help-center/credits/how-does-concurrency-boost-work)

- **Unlimited models are web-only** (higgsfield.ai). Every generation through **MCP, CLI, Canvas, Supercomputer always deducts credits**, even for models covered by Unlimited on the web, and even on the Ultimate plan. This directly affects HÜE Prisma if it drives generation via MCP/API/agents — cost planning must assume credit deduction there regardless of the team's plan tier.
- Unlimited generations run in the **standard queue** (can be slower at peak); credit-based (Credit Mode) generations run in the **priority queue** at max speed — worth knowing for time-sensitive work.
- Batch size (1–4 images/outputs) multiplies credit cost — each output in a batch is charged separately.
- Free account = visible watermark on every generation; **any paid plan removes it** (Ultimate included) — no separate toggle. Upgrading doesn't retroactively clean already-generated assets; must regenerate.
- Higgsfield may also embed **invisible, machine-readable AI-content markers/metadata** separate from the visible watermark — these are not removed by upgrading and aren't visible in the file.
- Concurrency Boost (paid add-on) raises how many generations run in parallel (+4/+8/+12/+16 above plan's base limit) and includes a separate "Boost Credits" balance (90-day expiry) — relevant if HÜE Prisma batches many generations at once and hits "you've hit your limit of generations at the same time."
- Credit spend order: subscription credits first, then remaining balances (Credit Pack/promo/Auto-Refill) by soonest expiration.

---

## 8. Full list of URLs read

Help Center (all read in full):
1. https://higgsfield.ai/creator-hub/help-center (index)
2. https://higgsfield.ai/creator-hub/help-center/getting-started (index)
3. https://higgsfield.ai/creator-hub/help-center/getting-started/what-is-higgsfield
4. https://higgsfield.ai/creator-hub/help-center/getting-started/whats-in-my-higgsfield-account
5. https://higgsfield.ai/creator-hub/help-center/getting-started/how-do-i-create-my-first-generation
6. https://higgsfield.ai/creator-hub/help-center/getting-started/how-do-i-write-a-good-prompt
7. https://higgsfield.ai/creator-hub/help-center/getting-started/official-higgsfield-platforms
8. https://higgsfield.ai/creator-hub/help-center/ai-models (index)
9. https://higgsfield.ai/creator-hub/help-center/ai-models/which-ai-model-should-i-use
10. https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-create-and-use-a-soul-id-character
11. https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-dop
12. https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-kling
13. https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-lipsync-voiceover-and-aspect-ratios
14. https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-nano-banana
15. https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-popcorn
16. https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-seedance
17. https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-soul-cinema
18. https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-soul-to-generate-images
19. https://higgsfield.ai/creator-hub/help-center/tools (index)
20. https://higgsfield.ai/creator-hub/help-center/tools/which-higgsfield-tool-should-i-use
21. https://higgsfield.ai/creator-hub/help-center/tools/what-are-higgsfield-apps
22. https://higgsfield.ai/creator-hub/help-center/tools/how-do-i-use-ai-influencer
23. https://higgsfield.ai/creator-hub/help-center/tools/how-do-i-use-canvas
24. https://higgsfield.ai/creator-hub/help-center/tools/how-do-i-use-cinema-studio
25. https://higgsfield.ai/creator-hub/help-center/tools/how-do-i-use-marketing-studio-to-create-video-ads
26. https://higgsfield.ai/creator-hub/help-center/tools/how-do-i-use-supercomputer
27. https://higgsfield.ai/creator-hub/help-center/credits (index)
28. https://higgsfield.ai/creator-hub/help-center/credits/how-credits-work
29. https://higgsfield.ai/creator-hub/help-center/credits/how-credit-packs-work (title checked, not deep-read — billing mechanics, low prompt relevance)
30. https://higgsfield.ai/creator-hub/help-center/credits/how-does-auto-refill-work (title checked, not deep-read — billing mechanics)
31. https://higgsfield.ai/creator-hub/help-center/credits/how-does-concurrency-boost-work
32. https://higgsfield.ai/creator-hub/help-center/credits/top-up-credits-expiry-a (title checked, not deep-read — billing mechanics)
33. https://higgsfield.ai/creator-hub/help-center/credits/watermark-and-how-to-remove
34. https://higgsfield.ai/creator-hub/help-center/credits/what-are-unlimited-models-and-which-plans-include-them
35. https://higgsfield.ai/creator-hub/help-center/credits/what-uses-my-credits
36. https://higgsfield.ai/creator-hub/help-center/troubleshooting (index)
37. https://higgsfield.ai/creator-hub/help-center/troubleshooting/content-flagged-as-nsfw
38. https://higgsfield.ai/creator-hub/help-center/troubleshooting/generation-is-stuck-or-failed
39. https://higgsfield.ai/creator-hub/help-center/troubleshooting/higgsfield-site-wont-load (title checked, not deep-read — generic technical support)
40. https://higgsfield.ai/creator-hub/help-center/troubleshooting/how-do-i-report-a-bug-or-submit-a-feature-request (title checked, not deep-read — generic support)
41. https://higgsfield.ai/creator-hub/help-center/troubleshooting/my-generation-blocked-for-copyright-or-ip
42. https://higgsfield.ai/creator-hub/help-center/troubleshooting/my-video-upscale-is-stuck-or-failed-what-should-i-do

Bonus (marketing pages, directly prompt-relevant, cross-checked against sitemap-marketing.xml):
43. https://higgsfield.ai/camera-controls
44. https://higgsfield.ai/nano-banana-pro-prompt-guide

Sitemaps used for discovery:
- https://higgsfield.ai/sitemap.xml
- https://higgsfield.ai/creator-hub/sitemap.xml
- https://higgsfield.ai/sitemap-marketing.xml

Not crawled (out of scope / low relevance to prompt-writing, all under help-center): account/* (delete account, account recovery, GDPR, IP ownership), billing/* (invoices, payment failures, VAT), business/* (partnerships, DMCA, team plans), plans/* (upgrade/downgrade, renewal, promo pricing), refunds/* (cancellation, refund requests), integrations/* (MCP/CLI/agent connection mechanics — not prompt content itself), getting-started/create-an-account-and-sign-in, getting-started/higgsfield-community-on-discord. These are account/billing/administrative topics, not prompt-writing or generation guidance, and were intentionally deprioritized given the goal (feeding a prompt generator + step-by-step designer guidance for actual generation).

**Note on requested model coverage**: The help center has no dedicated articles for **Seedream, GPT Image, Veo 3.1, or Gemini Omni Flash** individually — they only appear in the comparison table on "Which AI model should I use?" (Seedream = visual reasoning/complex prompts; GPT Image = text rendering/color accuracy; Veo = Google's model, also appears as a Lipsync Studio option for cinematic talking video). No dedicated "Motion Control" or "Image Auto" articles exist either; Motion Control is documented only as a Kling 3.0 sub-feature, and "Image Auto" isn't named anywhere in the help center (aspect-ratio "Auto" exists as a per-model setting, described in section 2 above).
