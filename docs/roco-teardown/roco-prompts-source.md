# Roco Prompts - recovered source (verbatim)
Decoded 2026-09-03 from the base64 import maps of each Cloud Run app embedded on rocoprompt.com. Files are unmodified.

## Suno Arquitecto

Host: https://suno-arquitecto-688843110097.us-west1.run.app

### services__geminiService.js

```javascript
import { GoogleGenAI, Type } from "@google/genai";
// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
export const generateSongData = async (input) => {
    const model = "gemini-3-flash-preview";
    const systemInstruction = `
    Eres un Arquitecto de Prompts Musicales experto. Tu objetivo es generar entradas para un sistema de generación de música texto-a-audio (como Suno).
    Debes seguir estrictamente estas reglas de formato.

    Recibirás parámetros del usuario sobre una canción en ESPAÑOL. Debes devolver un objeto JSON con dos campos: 'stylePrompt' y 'lyrics'.

    REGLAS PARA 'stylePrompt' (Estilo Musical):
    1. Debe ser una lista separada por comas de descriptores musicales.
    2. Longitud MÁXIMA de 200 caracteres. Sé conciso.
    3. Incluye: Género, Subgénero, Instrumentos clave, Tipo de voz, Energía/Vibe, Tempo (ej. '120 BPM' o 'Fast').
    4. SIN frases narrativas. SIN explicaciones. SIN prefijo "Estilo: ".
    5. Usa terminología estándar de producción musical (en Inglés es preferible para términos técnicos, o Español si es muy específico del género latino).
    6. Ejemplo: "Dark synthwave, 140 BPM, analog synths, driving bassline, male vocals, retro futuristic, nocturnal vibe"
    
    REGLAS PARA 'lyrics' (Letra):
    1. Genera una letra ORIGINAL basada en el 'tema' proporcionado.
    2. Usa etiquetas de estructura estándar entre corchetes: [Intro], [Verse 1], [Chorus], [Verse 2], [Bridge], [Outro].
    3. La letra DEBE estar en el idioma solicitado: ${input.language}.
    4. No incluyas texto conversacional, notas o explicaciones. SOLO la letra y las etiquetas de estructura.
    5. Asegura que el ritmo y la fluidez coincidan con el género seleccionado.
  `;
    const userPrompt = `
    Genera datos musicales basados en estos parámetros:
    - Género Principal: ${input.genre}
    - Subgénero/Estilo Específico: ${input.subgenre || "Estándar"}
    - Instrumentos: ${input.instruments || "Típicos del género"}
    - Tipo de Voz: ${input.voiceType}
    - Energía/Emoción: ${input.energy}
    - Idioma: ${input.language}
    - Tema/Historia de la canción: ${input.topic}
    - Referencia de Estilo (Canción/Artista): ${input.reference || "Ninguna"}
  `;
    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: [
                {
                    role: "user",
                    parts: [{ text: userPrompt }],
                },
            ],
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        stylePrompt: {
                            type: Type.STRING,
                            description: "Las etiquetas de estilo separadas por comas, máx 200 caracteres.",
                        },
                        lyrics: {
                            type: Type.STRING,
                            description: "La letra estructurada con etiquetas [Sección].",
                        },
                    },
                    required: ["stylePrompt", "lyrics"],
                },
            },
        });
        const jsonText = response.text; // Fixed property access based on latest guidelines
        if (!jsonText) {
            throw new Error("No se generó respuesta");
        }
        const parsed = JSON.parse(jsonText);
        return parsed;
    }
    catch (error) {
        console.error("Gemini Generation Error:", error);
        throw new Error("Fallo al generar la canción. Por favor intenta de nuevo.");
    }
};

```

### constants.js

```javascript
export const GENRES = [
    "Pop", "Rock", "Hip Hop", "Electrónica", "Jazz", "Clásica",
    "R&B", "Country", "Latino", "Reguetón", "Metal", "Folk", "Blues", "Reggae",
    "Indie", "K-Pop", "Ambient", "Cinemático", "Trap", "Bachata", "Salsa", "Cumbia",
    "Corridos Tumbados", "Banda Sinaloense", "Norteño", "Mariachi", "Ranchera", "Sierreño"
];
export const VOICE_TYPES = [
    "Masculina", "Femenina", "Dúo", "Coro", "Instrumental (Sin voz)",
    "Autotune", "Masculina Ronca", "Femenina Etérea", "Canto de Multitud",
    "Susurros", "Operística", "Grito Agresivo (Screamo)"
];
export const ENERGIES = [
    "Alegre", "Triste", "Energética", "Relajada (Chill)", "Romántica", "Oscura",
    "Épica", "Agresiva", "Melancólica", "Inspiradora", "Misteriosa",
    "Sexy", "Motivacional", "Onírica (Dreamy)", "Caótica"
];
export const LANGUAGES = [
    "Español", "Inglés", "Francés", "Alemán", "Italiano",
    "Portugués", "Japonés", "Coreano", "Chino", "Ruso",
    "Hindi", "Árabe"
];
export const INSTRUMENTS_SUGGESTIONS = [
    "Guitarra Acústica", "Guitarra Eléctrica", "Piano", "Sintetizador",
    "Violín", "Batería", "Bajo", "Saxofón", "808s", "Orquesta",
    "Acordeón", "Tuba", "Requinto", "Trompeta", "Tololoche"
];

```

## Frames Master (CinePrompt 2.0)

Host: https://copy-of-cineprompt-2-0-887062990287.us-west1.run.app

### services__geminiService.js

```javascript
import { GoogleGenAI } from "@google/genai";
export const generateCinePrompt = async (gridImg, characterImg) => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    const systemInstruction = `Eres un Director de Fotografía de élite y Prompt Engineer senior. Tu especialidad es la recreación exacta de ADN visual mediante IA.

OBJETIVO:
Generar un prompt técnico y detallado que clone la estética de un [GRID] aplicando la identidad de un [PERSONAJE].

REGLAS DE ORO DE LENGUAJE CINEMATOGRÁFICO:
1. FRASE INICIAL OBLIGATORIA: Empieza exactamente con: "Toma el grid de referencia de mi primera imagen y recrealo usando como personaje a [IDENTIFICAR SUJETO: la mujer/el hombre/el niño/etc] de mi foto de referencia 2, en cada uno de los multiples frames."
2. CONSISTENCIA DE IDENTIDAD: La morfología facial, rasgos, edad y tono de piel deben ser 1:1 con la referencia 2.
3. ESTÉTICA INTOCABLE: No modifiques ni un ápice del look del grid. Copia el color grading (teal & orange, tintes en sombras, roll-off de altas luces), la iluminación y la textura.
4. DETALLE ÓPTICO: Para cada cuadro, especifica:
   - Óptica: (ej. 35mm f/1.4 con ligera distorsión, 85mm con bokeh comprimido, anamórfico con flares horizontales).
   - Iluminación: Dirección y calidad (ej. Iluminación Rembrandt con ratio 4:1, luz de contra suave, practicals de tungsteno).
   - Textura: (ej. Difusión Black Pro-Mist 1/4, grano fino de 35mm, bloom sutil en las luces).
5. ESTRUCTURA: Divide por CUADRO 1, CUADRO 2, etc. Cada uno debe ser una descripción técnica de 3-5 líneas.

PROCESO:
- Analiza la Referencia 2 para identificar si es hombre, mujer, etc.
- Analiza el Grid (Referencia 1) para entender la narrativa visual y técnica.
- Entrega SOLO el prompt final, sin introducciones ni bloques extra.`;
    const promptText = `Imagen 1 (GRID): Fuente de look, luz y óptica.
Imagen 2 (PERSONAJE): Fuente de identidad y rasgos.

Genera el prompt maestro siguiendo estrictamente las reglas de dirección de fotografía.`;
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: promptText },
                        { inlineData: { data: gridImg.base64, mimeType: gridImg.mimeType } },
                        { inlineData: { data: characterImg.base64, mimeType: characterImg.mimeType } }
                    ]
                }
            ],
            config: {
                systemInstruction,
                temperature: 0.4, // Temperatura baja para mayor precisión técnica
            }
        });
        return {
            prompt: response.text || "Error al generar el análisis óptico."
        };
    }
    catch (error) {
        console.error("Gemini Error:", error);
        throw error;
    }
};

```

## Scene Master / Angle Master (Creador de escenas)

Host: https://creador-de-escenas-887062990287.us-west1.run.app

### services__geminiService.js

```javascript
import { GoogleGenAI } from "@google/genai";
export const generateCinePrompt = async (referenceImg, requirements) => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    const systemInstruction = `Eres un Master Cinematographer y Director Creativo. Tu especialidad es la expansión narrativa radical a partir de una semilla visual.

OBJETIVO:
Crear un prompt maestro para generar un GRID DE 3 ESCENAS HORIZONTALES. Estas escenas deben ser ALTAMENTE CREATIVAS, ÚNICAS y COMPLETAMENTE DIFERENTES entre sí, aunque ocurran en el mismo universo/locación.

REGLAS DE PRODUCCIÓN CREATIVA:
1. ADN VISUAL: Extrae la estética técnica (luz, color, textura, óptica) de la imagen de referencia.
2. FRASE INICIAL OBLIGATORIA: El prompt debe empezar exactamente con: "Genera un grid cinematográfico de tres cuadros horizontales basados estrictamente en el ADN visual de la imagen de referencia. Mantén al mismo sujeto con identidad 1:1 y la misma estética técnica en cada frame."
3. DIVERSIDAD DE ESCENA: Evita lo obvio. Si la imagen muestra al sujeto sentado, los cuadros deben mostrarlo en acciones contrastantes:
   - Explorando nuevas perspectivas (ej: un plano dorsal contemplando el horizonte, un primer plano detalle de sus manos operando un objeto, un plano holandés en movimiento).
   - Acciones inesperadas (ej: corriendo hacia la cámara, usando un gadget retro, interactuando con un elemento natural, un momento de introspección extrema).
   - Ángulos cinemáticos: Varía entre Low Angle (heroico), Extreme Close-Up (texturas), y Wide Shot (escala).
4. REQUERIMIENTOS: Integra las peticiones del usuario como el "leitmotiv" de las escenas.
5. NO FLUFF: No incluyas análisis, saludos ni introducciones. Solo el prompt técnico.

ESTRUCTURA TÉCNICA POR CUADRO:
Para cada cuadro describe:
- Acción y Narrativa: Qué está haciendo el sujeto de forma dinámica.
- Ángulo y Óptica: (ej. 24mm anamórfico para escala épica, 85mm f/1.2 para aislamiento íntimo).
- Iluminación: (ej. Luz dorada lateral con haze volumétrico, rim light para separar del fondo).
- Composición: (ej. Regla de los tercios inversa, simetría perfecta, encuadre natural).

CUADRO 1: [Visión creativa 1]
CUADRO 2: [Visión creativa 2]
CUADRO 3: [Visión creativa 3]`;
    const promptText = `Imagen de Referencia para ADN visual e identidad.
Requerimientos específicos del usuario: ${requirements || "Libertad creativa total para expandir la narrativa de forma inesperada."}

Genera el prompt maestro empezando exactamente con la frase obligatoria.`;
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: promptText },
                        { inlineData: { data: referenceImg.base64, mimeType: referenceImg.mimeType } }
                    ]
                }
            ],
            config: {
                systemInstruction,
                temperature: 0.7, // Subimos un poco la temperatura para mayor originalidad creativa
            }
        });
        let cleanPrompt = response.text || "";
        const startPhrase = "Genera un grid cinematográfico de tres cuadros horizontales";
        const startIndex = cleanPrompt.indexOf(startPhrase);
        if (startIndex !== -1) {
            cleanPrompt = cleanPrompt.substring(startIndex);
        }
        return {
            prompt: cleanPrompt
        };
    }
    catch (error) {
        console.error("Gemini Error:", error);
        throw error;
    }
};

```

## Nano Banana Bot (14 task templates)

Host: https://rocopromts-nanobanana-688843110097.us-west1.run.app

### constants.js

```javascript
export const TASK_TYPES = [
    {
        id: 'cambio_ropa', label: 'Cambio de ropa', description: 'Transfiere un outfit completo de una imagen de referencia a un sujeto.',
        descriptionPlaceholder: "",
        imageSlots: [{ label: 'Sujeto Principal' }, { label: 'Referencia de Outfit' }],
        hasDescription: false, hasAdvancedOptions: true, canAnalyze: false,
    },
    {
        id: 'cambio_pose', label: 'Cambio de Pose', description: 'Modifica la postura de un sujeto basándose en una imagen de referencia, manteniendo el fondo original.',
        descriptionPlaceholder: "",
        imageSlots: [{ label: 'Sujeto' }, { label: 'Referencia de Pose' }],
        hasDescription: false, hasAdvancedOptions: true, canAnalyze: false,
    },
    {
        id: 'cambio_escenario', label: 'Cambio de Escenario', description: 'Ubica a un sujeto en un nuevo escenario descrito por ti.',
        descriptionPlaceholder: "Describe el fondo. Ej: 'urbano, natural, futurista, interior minimalista con luz suave de atardecer'",
        imageSlots: [{ label: 'Sujeto' }],
        hasDescription: true, hasAdvancedOptions: true, canAnalyze: false,
    },
    {
        id: 'integracion_2_personajes', label: 'Integración de 2 personajes', description: 'Combina dos personajes en una escena, con una interacción, pose y fondo personalizados.',
        descriptionPlaceholder: "Describe la escena y la interacción. Ej: 'conversando en un café parisino', 'bailando bajo la luna', 'explorando una jungla misteriosa'",
        imageSlots: [{ label: 'Personaje 1' }, { label: 'Personaje 2' }, { label: 'Pose (Opcional)' }],
        hasDescription: true, hasAdvancedOptions: true, canAnalyze: false,
    },
    {
        id: 'restauracion_foto', label: 'Restauración y Colorización', description: 'Restaura y colorea fotos antiguas o dañadas con un acabado profesional.',
        descriptionPlaceholder: "",
        imageSlots: [{ label: 'Foto a Restaurar' }],
        hasDescription: false, hasAdvancedOptions: true, canAnalyze: false,
    },
    {
        id: 'transferencia_estilo', label: 'Transferencia de estilo', description: 'Aplica el estilo artístico de una imagen a otra.',
        descriptionPlaceholder: "Describe el resultado deseado. Ej: 'un retrato con el estilo de Van Gogh'",
        imageSlots: [{ label: 'Imagen de Contenido' }, { label: 'Imagen de Estilo' }],
        hasDescription: true, hasAdvancedOptions: true, canAnalyze: false,
    },
    {
        id: 'mejora_fotografica', label: 'Mejora fotográfica profesional', description: 'Ajusta colores, luces y nitidez a nivel profesional.',
        descriptionPlaceholder: "En este campo puedes agregar o modificar detalles sutiles.",
        imageSlots: [{ label: 'Foto a Mejorar' }],
        hasDescription: true, hasAdvancedOptions: true, canAnalyze: true,
    },
    {
        id: 'foto_producto', label: 'Foto de producto', description: 'Crea fotos profesionales de tus productos para catálogos, redes sociales y publicidad.',
        descriptionPlaceholder: "Describe el fondo, el estilo o detalles específicos. Ej: 'fondo blanco minimalista con sombra suave', 'sobre una mesa de mármol con luz natural lateral', 'estilo cinemático oscuro'",
        imageSlots: [{ label: 'Producto' }],
        hasDescription: true, hasAdvancedOptions: true, canAnalyze: false,
    },
    {
        id: 'figura_coleccionable', label: 'Figura coleccionable', description: 'Convierte un sujeto en una figura de acción o coleccionable, con opción para un empaque personalizado.',
        descriptionPlaceholder: "Describe el estilo de la figura (ej: 'Funko', 'anime'). Si no, usaremos un prompt detallado.",
        imageSlots: [{ label: 'Sujeto' }, { label: 'Referencia de Empaque' }],
        hasDescription: true, hasAdvancedOptions: true, canAnalyze: false,
    },
    {
        id: 'foto_con_famoso', label: 'Tu foto con famoso', description: 'Integreate en una foto junto a una celebridad.',
        descriptionPlaceholder: "Describe la escena. Ej: 'una selfie casual y divertida en una alfombra roja'",
        imageSlots: [{ label: 'Tu Foto (Sujeto)' }, { label: 'Foto del Famoso' }],
        hasDescription: true, hasAdvancedOptions: true, canAnalyze: false,
    },
    {
        id: 'cambio_epoca', label: 'Cambio de época', description: 'Transporta una escena o persona a otra época histórica.',
        descriptionPlaceholder: "Describe la época y el estilo. Ej: 'los años 20 con estilo art decó y ropa de la época'",
        imageSlots: [{ label: 'Sujeto/Escena' }],
        hasDescription: true, hasAdvancedOptions: true, canAnalyze: false,
    },
    {
        id: 'agregar_objetos', label: 'Agregar objetos o accesorios', description: 'Añade elementos nuevos a la imagen de forma inteligente.',
        descriptionPlaceholder: "Opcional: describe cómo interactúan. Ej: 'la persona sostiene el objeto'. La IA inferirá la mejor interacción si se deja en blanco.",
        imageSlots: [{ label: 'Escena Principal' }, { label: 'Objeto a Agregar' }],
        hasDescription: true, hasAdvancedOptions: true, canAnalyze: false,
    },
    {
        id: 'cambio_angulo', label: 'Cambio de ángulo o perspectiva', description: 'Altera el punto de vista de la cámara.',
        descriptionPlaceholder: "Describe el nuevo ángulo. Ej: 'un plano cenital (desde arriba) mostrando toda la habitación'",
        imageSlots: [{ label: 'Escena' }],
        hasDescription: true, hasAdvancedOptions: true, canAnalyze: false,
    },
    {
        id: 'aplicar_logo', label: 'Aplicar logo en mockups', description: 'Coloca un logo sobre un producto o superficie.',
        descriptionPlaceholder: "Describe cómo aplicar el logo. Ej: 'el logo debe verse metálico y con relieve sobre la botella'",
        imageSlots: [{ label: 'Producto/Superficie' }, { label: 'Logo' }],
        hasDescription: true, hasAdvancedOptions: true, canAnalyze: false,
    },
];
const buildAdvancedPrompt = (base, data) => {
    const details = [
        data.camera && `cámara: ${data.camera}`,
        data.lens && `lente: ${data.lens}`,
        data.lighting && `iluminación: ${data.lighting}`,
        data.atmosphere && `atmósfera: ${data.atmosphere}`,
        data.style && `estilo: ${data.style}`,
        data.detailLevel && `nivel de detalle: ${data.detailLevel}`,
    ].filter(Boolean).join(', ');
    return details ? `${base}. Detalles técnicos: ${details}.` : base;
};
const cambioRopaPrompt = `Toma al sujeto de [Imagen 1] y vístelo con toda la ropa y accesorios de [Imagen 2]. Asegúrate de que el outfit se vea integrado de forma realista, manteniendo la identidad, postura y proporciones originales del sujeto de [Imagen 1]. El estilo debe reflejar fielmente el conjunto de [Imagen 2], con un look limpio y moderno. NOTAS: Se debe mantener la postura, expresión e identidad del sujeto.`;
const createRestauracionPrompt = (data) => {
    const colorDetails = data.clothingColorSuggestion || 'vestimenta con colores históricamente apropiados, y joyería metálica o perlada';
    return `Restaura la fotografía antigua en blanco y negro de [Imagen 1], eliminando manchas, dobleces, arañazos y cualquier otro daño visible. Luego, coloréala de forma realista: utiliza una paleta de colores variada pero coherente, con tonos de piel cálidos y naturales, ${colorDetails}. El fondo debe tener una iluminación y colores saturados creíbles. Asegúrate de que el resultado final parezca una fotografía moderna de alta calidad, manteniendo el encuadre equilibrado y reenfocando si es necesario para centrar correctamente a los sujetos. La escena debe conservar su autenticidad, pero verse nítida, bien iluminada y con un acabado profesional, como si hubiera sido tomada con una cámara Sony A1 y un lente de 50 mm.`;
};
const figuraCollectiblePrompt = (d) => {
    const hasDescription = d.description.trim();
    const hasPackagingImage = !!d.images[1];
    let basePrompt;
    if (hasDescription) {
        basePrompt = `Convierte al sujeto de [Imagen 1] en una figura de personaje coleccionable. Materializa e interpreta la siguiente descripción para definir el estilo, las proporciones características (ej: cabeza grande y cuerpo pequeño para un Funko), el material (ej: vinilo, resina) y la escena de presentación (ej: dentro de su caja de exhibición, sobre una base, etc.): "${d.description}".`;
        if (hasPackagingImage) {
            basePrompt += ` El diseño del empaque debe estar inspirado en los elementos visuales y el estilo de [Imagen 2].`;
        }
    }
    else {
        basePrompt = `Convierte al sujeto de [Imagen 1] en una figura de personaje coleccionable de vinilo, con un estilo detallado y realista. La figura está de pie sobre una base circular.`;
        if (hasPackagingImage) {
            basePrompt += ` Detrás de la figura, se encuentra su caja de producto, cuyo diseño (colores, tipografía y arte) está directamente inspirado en [Imagen 2].`;
        }
        else {
            basePrompt += ` A su lado, hay una caja de producto con un diseño gráfico moderno que muestra una ilustración del personaje.`;
        }
        basePrompt += ` La escena está sobre una superficie limpia con una iluminación de estudio profesional que resalta los detalles de la figura y el empaque.`;
    }
    return basePrompt;
};
const createFotoProductoPrompt = (d) => {
    const backgroundInstruction = d.description.trim()
        ? `Colócalo en el siguiente escenario publicitario: "${d.description}".`
        : `Analiza el producto de la imagen y colócalo en el mejor escenario para una fotografía publicitaria. El fondo debe ser profesional, evocar un estilo de vida aspiracional y realzar las cualidades del producto para atraer a su público objetivo.`;
    return `Transforma esta imagen de producto de [Imagen 1] en una fotografía publicitaria de alto impacto. Mantén el producto original sin modificaciones, pero optimiza la iluminación, el enfoque y los colores para que se vean nítidos y realistas. ${backgroundInstruction} Evita distorsiones, reflejos difíciles, sombras duras o fondos confusos. Asegúrate de que la textura y los detalles del producto se vean naturales y de alta resolución, listos para una campaña profesional.`;
};
export const PROMPT_TEMPLATES = {
    cambio_ropa: {
        basic: () => cambioRopaPrompt,
        advanced: (d) => buildAdvancedPrompt(cambioRopaPrompt, d),
    },
    cambio_pose: {
        basic: (d) => `Toma al sujeto de la [Imagen 1] y colócalo en la pose que aparece en la [Imagen 2]. Asegúrate de que el cuerpo del sujeto se adapte de forma natural a la nueva postura, manteniendo su apariencia y rasgos originales. El fondo original de la [Imagen 1] debe conservarse.`,
        advanced: (d) => buildAdvancedPrompt(`Toma al sujeto de [Imagen 1], manteniendo su identidad y rasgos originales. Colócalo en la pose exacta que se muestra en [Imagen 2], adaptando su cuerpo y ropa de forma fotorrealista a la nueva postura. El fondo original de la [Imagen 1] debe ser preservado y adaptado si es necesario para que el cambio de pose sea creíble y coherente.`, d),
    },
    cambio_escenario: {
        basic: (d) => `Toma al sujeto de la [Imagen 1] y ubícalo en un nuevo escenario descrito como: "${d.description}". Adapta perfectamente la iluminacion y perspectiva para integrar al personaje en el nuevo fondo de manera realista.`,
        advanced: (d) => buildAdvancedPrompt(`Toma al sujeto de [Imagen 1], manteniendo su identidad y rasgos originales, y intégralo de forma fotorrealista en el siguiente escenario: "${d.description}". La iluminación, sombras y perspectiva del sujeto deben coincidir perfectamente con el nuevo fondo para un resultado cohesivo y creíble. Adapta perfectamente la iluminacion y perspectiva para integrar al personaje en el nuevo fondo de manera realista.`, d),
    },
    integracion_2_personajes: {
        basic: (d) => {
            const hasPoseImage = !!d.images[2];
            let prompt = `Los personajes de la [Imagen 1] y la [Imagen 2] deben interactuar entre sí`;
            if (hasPoseImage) {
                prompt += ` utilizando la pose que aparece en la [Imagen 3]`;
            }
            prompt += `. La escena y la interacción deben ser: "${d.description}". Asegúrate de que haya una interacción creíble entre los personajes y el entorno para que la escena sea visualmente coherente.`;
            return prompt;
        },
        advanced: (d) => {
            const hasPoseImage = !!d.images[2];
            let basePrompt = `Crea una composición visual fotorrealista integrando a los personajes de [Imagen 1] y [Imagen 2].`;
            if (hasPoseImage) {
                basePrompt += ` Los personajes deben adoptar la pose de referencia de [Imagen 3].`;
            }
            basePrompt += ` La narrativa, el entorno y la interacción deben corresponder a la siguiente descripción: "${d.description}". La iluminación, sombras y perspectiva de los personajes deben coincidir perfectamente con el entorno para un resultado cohesivo y creíble, manteniendo la identidad original de cada personaje.`;
            const notes = ` NOTAS: Puedes variar el estilo: cinematográfico realista, ilustración digital, cómic, animación 3D. Ajusta la atmósfera del fondo para que coincida con la narrativa deseada.`;
            return buildAdvancedPrompt(basePrompt + notes, d);
        },
    },
    restauracion_foto: {
        basic: (d) => createRestauracionPrompt(d),
        advanced: (d) => buildAdvancedPrompt(createRestauracionPrompt(d), d),
    },
    transferencia_estilo: {
        basic: (d) => `Aplica el estilo artístico de [Imagen 2] a la composición de [Imagen 1]. El resultado debe ser ${d.description}.`,
        advanced: (d) => buildAdvancedPrompt(`Toma la composición y los elementos de [Imagen 1] y aplica la paleta de colores, pinceladas y estilo artístico general de [Imagen 2]. La fusión debe ser ${d.description}, manteniendo la estructura de la primera imagen pero con la estética de la segunda.`, d),
    },
    mejora_fotografica: {
        basic: (d) => `Realiza una mejora fotográfica profesional a [Imagen 1]. ${d.description}.`,
        advanced: (d) => buildAdvancedPrompt(`Realiza una mejora fotográfica profesional a [Imagen 1]. Aplica técnicas de etalonaje digital (color grading) para lograr ${d.description}. Ajusta el balance de blancos, el contraste, la saturación y la nitidez para un resultado de alta calidad editorial.`, d),
    },
    foto_producto: {
        basic: (d) => createFotoProductoPrompt(d),
        advanced: (d) => buildAdvancedPrompt(createFotoProductoPrompt(d), d),
    },
    figura_coleccionable: {
        basic: (d) => figuraCollectiblePrompt(d),
        advanced: (d) => buildAdvancedPrompt(figuraCollectiblePrompt(d), d),
    },
    foto_con_famoso: {
        basic: (d) => {
            let prompt = `Integra al sujeto de [Referencia de Imagen 1] con el sujeto de [Referencia de Imagen 2]`;
            if (d.description.trim()) {
                prompt += ` de forma que ${d.description}.`;
            }
            else {
                prompt += ` de forma que estén sonriendo abrazados. Ubícalos en una escena frente a un fondo de cortina azul con una iluminación de flash fuerte y sombras suaves. La foto parece una impresión de película instantánea con un borde blanco. Transmite una sensación nostálgica y espontánea, juego de sombras, con colores cálidos, un ligero efecto de sobreexposición por el flash y una estética retro auténtica.`;
            }
            return prompt;
        },
        advanced: (d) => {
            let basePrompt = `Integra al sujeto de [Referencia de Imagen 1] con el sujeto de [Referencia de Imagen 2]`;
            if (d.description.trim()) {
                basePrompt += ` de forma que ${d.description}.`;
            }
            else {
                basePrompt += ` de forma que estén sonriendo abrazados. Ubícalos en una escena frente a un fondo de cortina azul con una iluminación de flash fuerte y sombras suaves. La foto parece una impresión de película instantánea con un borde blanco. Transmite una sensación nostálgica y espontánea, juego de sombras, con colores cálidos, un ligero efecto de sobreexposición por el flash y una estética retro auténtica.`;
            }
            return buildAdvancedPrompt(basePrompt, d);
        },
    },
    cambio_epoca: {
        basic: (d) => `Transporta al sujeto de [Imagen 1] a la siguiente época y estilo: "${d.description}".`,
        advanced: (d) => buildAdvancedPrompt(`Toma al sujeto de [Imagen 1] y adáptalo completamente a la época y estilo descrito como: "${d.description}". Modifica su vestimenta, peinado y el entorno para que coincida con la estética de esa época. Aplica un filtro de color y grano que simule la fotografía de ese periodo para un resultado auténtico.`, d),
    },
    agregar_objetos: {
        basic: (d) => `Integra el objeto de [Imagen 2] en la escena de [Imagen 1] de la siguiente manera: ${d.description}. El resultado debe ser fotorrealista.`,
        advanced: (d) => buildAdvancedPrompt(`Crea una composición fotorrealista integrando el objeto de [Imagen 2] en la escena de [Imagen 1]. La integración debe seguir esta descripción detallada: "${d.description}". Asegúrate de que la escala, perspectiva, iluminación y sombras del objeto se ajusten perfectamente al entorno para un resultado cohesivo y creíble.`, d),
    },
    cambio_angulo: {
        basic: (d) => `Toma la escena de [Imagen 1] y cambia la perspectiva a ${d.description}.`,
        advanced: (d) => buildAdvancedPrompt(`Reimagina la escena de [Imagen 1] desde un ángulo de cámara completamente diferente. La nueva perspectiva debe ser ${d.description}. Reconstruye los elementos de la escena para que sean visibles y coherentes desde este nuevo punto de vista.`, d),
    },
    aplicar_logo: {
        basic: (d) => `Aplica el logo de [Imagen 2] sobre el objeto en [Imagen 1]. ${d.description}.`,
        advanced: (d) => buildAdvancedPrompt(`Toma el logo de [Imagen 2] y aplícalo sobre el producto/superficie en [Imagen 1]. El logo debe adaptarse a la curvatura, textura y condiciones de iluminación del objeto para crear un mockup realista. ${d.description}.`, d),
    },
};

```

### utils__promptGenerator.js

```javascript
import { describeImage, analyzeClothingColors, getInteractionSuggestion } from '@/services/geminiService';
import { fileToBase64 } from '@/utils/fileUtils';
// Helper function to escape special characters for use in a regular expression.
const escapeRegExp = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};
export const generatePrompt = async (promptData, templates) => {
    const template = templates[promptData.taskType];
    if (!template) {
        return { basic: 'Error: Tipo de tarea no válido.', advanced: 'Error: Tipo de tarea no válido.' };
    }
    let finalDescription = promptData.description;
    if (promptData.taskType === 'agregar_objetos' && promptData.images[0] && promptData.images[1]) {
        try {
            const sceneBase64 = await fileToBase64(promptData.images[0]);
            const objectBase64 = await fileToBase64(promptData.images[1]);
            finalDescription = await getInteractionSuggestion(sceneBase64, promptData.images[0].type, objectBase64, promptData.images[1].type, promptData.description);
        }
        catch (error) {
            console.error("Error getting interaction suggestion:", error);
            finalDescription = promptData.description || 'integrar el objeto en la escena de forma natural.';
        }
    }
    let clothingColorSuggestion = '';
    if (promptData.taskType === 'restauracion_foto' && promptData.images[0]) {
        try {
            const base64Data = await fileToBase64(promptData.images[0]);
            clothingColorSuggestion = await analyzeClothingColors(base64Data, promptData.images[0].type);
        }
        catch (error) {
            console.error("Error getting clothing color suggestion:", error);
            clothingColorSuggestion = "vestimenta con colores históricos apropiados y joyería metálica o perlada";
        }
    }
    const augmentedData = {
        ...promptData,
        description: finalDescription,
        clothingColorSuggestion,
    };
    // Asynchronously get descriptions for all available images
    const descriptionPromises = promptData.images.map(async (file) => {
        if (!file) {
            return null;
        }
        try {
            const base64Data = await fileToBase64(file);
            return await describeImage(base64Data, file.type);
        }
        catch (error) {
            console.error("Error describing image:", error);
            return "descripción no disponible";
        }
    });
    const descriptions = await Promise.all(descriptionPromises);
    // Replace image placeholders with descriptions
    const process = (promptTemplate) => {
        let processedPrompt = promptTemplate(augmentedData);
        descriptions.forEach((desc, index) => {
            const placeholder = `[Imagen ${index + 1}]`;
            const replacement = desc
                ? `[Referencia de Imagen ${index + 1}: ${desc}]`
                : '[Imagen no proporcionada]';
            const escapedPlaceholder = escapeRegExp(placeholder);
            processedPrompt = processedPrompt.replace(new RegExp(escapedPlaceholder, 'g'), replacement);
        });
        return processedPrompt;
    };
    const basic = process(template.basic);
    const advanced = process(template.advanced);
    return { basic, advanced };
};

```

### services__geminiService.js

```javascript
import { GoogleGenAI, Type } from "@google/genai";
if (!process.env.API_KEY) {
    console.error("API_KEY environment variable not set.");
}
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
export const describeImage = async (imageData, mimeType) => {
    try {
        const imagePart = {
            inlineData: {
                mimeType,
                data: imageData,
            },
        };
        const textPart = {
            text: `Describe el sujeto principal o el contenido de esta imagen en una frase corta y descriptiva. Sé muy conciso. Por ejemplo: "una mujer con un mono negro de pie en un jardín" o "un uniforme militar de camuflaje". La descripción se usará dentro de un prompt más grande. Responde en español.`
        };
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, textPart] },
        });
        return response.text.trim();
    }
    catch (error) {
        console.error("Error calling Gemini API for image description:", error);
        throw new Error("Failed to describe image with Gemini API. Check your API key and permissions.");
    }
};
export const analyzeImage = async (imageData, mimeType) => {
    try {
        const imagePart = {
            inlineData: {
                mimeType,
                data: imageData,
            },
        };
        const textPart = {
            text: `Analiza esta imagen y describe de forma concisa qué mejoras se le pueden hacer para una restauración o mejora fotográfica profesional. Enfócate en aspectos como color, luz, nitidez y posibles desperfectos. La descripción debe ser accionable para ser usada en un prompt posterior. Responde en español.`
        };
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, textPart] },
        });
        return response.text;
    }
    catch (error) {
        console.error("Error calling Gemini API for image analysis:", error);
        throw new Error("Failed to analyze image with Gemini API. Check your API key and permissions.");
    }
};
export const analyzeClothingColors = async (imageData, mimeType) => {
    try {
        const imagePart = {
            inlineData: {
                mimeType,
                data: imageData,
            },
        };
        const textPart = {
            text: `Analiza la ropa y los accesorios en esta fotografía antigua en blanco y negro. Basándote en el estilo y la época aparente, sugiere una paleta de colores históricamente apropiada para la vestimenta y la joyería. Responde con una frase concisa que pueda insertarse en un prompt más grande. Por ejemplo: "vestimenta con colores como azul marino y beige, y joyería metálica". Responde en español.`
        };
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, textPart] },
        });
        return response.text.trim();
    }
    catch (error) {
        console.error("Error calling Gemini API for clothing color analysis:", error);
        throw new Error("Failed to analyze clothing colors with Gemini API. Check your API key and permissions.");
    }
};
export const getInteractionSuggestion = async (sceneImageData, sceneMimeType, objectImageData, objectMimeType, userDescription) => {
    try {
        const sceneImagePart = {
            inlineData: { mimeType: sceneMimeType, data: sceneImageData },
        };
        const objectImagePart = {
            inlineData: { mimeType: objectMimeType, data: objectImageData },
        };
        const instructionText = `Eres un director de arte experto en composición fotorrealista para IA generativa. Tu misión es crear una descripción técnica y precisa de cómo un objeto debe integrarse en una escena.

Analiza la imagen de la escena y la del objeto. Si el usuario da una descripción, úsala como base. Si no, infiere la interacción más natural y lógica.

**Consideraciones Clave:**
1.  **Interacción Lógica**: ¿Cómo interactuarían estos elementos en la vida real? (ej: una gorra en la cabeza, una botella en la mano, un cuadro en la pared).
2.  **Análisis del Objeto**: Presta especial atención a la materialidad del objeto.
    *   **Transparencia y Refracción**: Si el objeto es transparente o translúcido (como un vaso, una botella de Coca-Cola, agua), describe cómo la luz debe pasar a través de él y cómo debe distorsionar los elementos del fondo visibles a través del objeto.
    *   **Reflejos**: Si el objeto es metálico, pulido o reflectante, describe cómo debe reflejar el entorno de la escena (luces, colores, otros objetos).
    *   **Textura**: Menciona la textura (mate, rugosa, suave) y cómo la luz interactúa con ella.
3.  **Integración Técnica**:
    *   **Perspectiva y Escala**: El objeto debe coincidir perfectamente con la perspectiva y la escala de la escena.
    *   **Iluminación**: La dirección, intensidad y color de la luz que incide sobre el objeto deben ser idénticos a la iluminación de la escena.
    *   **Sombras**: Describe cómo el objeto proyecta sombras sobre la escena y cómo las sombras de la escena se proyectan sobre el objeto. Las sombras deben ser coherentes en dureza y dirección.

**Petición del Usuario**: "${userDescription || 'No se proporcionó descripción. Inferir la interacción más lógica y natural.'}"

**Tu Tarea**: Genera un único párrafo en español. Este texto se usará directamente en un prompt y debe ser una descripción detallada y técnica de la integración.

**Ejemplo Mejorado (escena de persona en un parque, objeto una botella de Coca-Cola de vidrio)**:
"La persona sostiene la botella de Coca-Cola de vidrio por el centro, con los dedos adaptados a su curvatura. La botella debe estar a una escala realista en su mano. La luz del sol que ilumina la escena debe incidir en la botella, creando brillos especulares intensos en el vidrio y resaltando el color oscuro del líquido. Es crucial que se vea la refracción a través del vidrio y el líquido, distorsionando ligeramente el fondo del parque visible detrás de la botella. La botella debe proyectar una sombra suave y translúcida sobre la mano de la persona y el suelo, teñida sutilmente por el color de la Coca-Cola."

Ahora, analiza las imágenes proporcionadas y genera la descripción.`;
        const textPart = { text: instructionText };
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [sceneImagePart, objectImagePart, textPart] },
        });
        return response.text.trim();
    }
    catch (error) {
        console.error("Error calling Gemini API for interaction suggestion:", error);
        throw new Error("Failed to get interaction suggestion from Gemini API. Check your API key and permissions.");
    }
};
export const isImageClothing = async (imageData, mimeType) => {
    try {
        const imagePart = { inlineData: { mimeType, data: imageData } };
        const textPart = { text: `Analiza esta imagen. ¿El objeto principal es una prenda de vestir o un accesorio que se puede usar (ropa, zapatos, bolso, sombrero, etc.)? Responde únicamente con un JSON con la clave "isClothing" y un valor booleano. Por ejemplo: {"isClothing": true}` };
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, textPart] },
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        isClothing: { type: Type.BOOLEAN }
                    }
                }
            }
        });
        const jsonString = response.text.trim();
        const result = JSON.parse(jsonString);
        return result.isClothing;
    }
    catch (error) {
        console.error("Error calling Gemini API for clothing check:", error);
        // Default to true to avoid blocking the user if the API fails
        return true;
    }
};

```

### components__AdvancedOptions.js

```javascript
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from 'react';
const InputField = ({ id, label, placeholder, value, onChange }) => (_jsxs("div", { children: [_jsx("label", { htmlFor: id, className: "block text-sm font-medium text-slate-400 mb-1", children: label }), _jsx("input", { type: "text", id: id, name: id, value: value, onChange: (e) => onChange(id, e.target.value), placeholder: placeholder, className: "w-full p-2 bg-black border border-slate-700 rounded-md focus:ring-2 focus:ring-[var(--accent-green)] focus:border-[var(--accent-green)] transition placeholder-slate-600" })] }));
const AdvancedOptions = ({ promptData, onDataChange }) => {
    const fields = [
        { id: 'camera', label: 'Cámara', placeholder: 'Ej: Sony A7 IV, DSLR full-frame' },
        { id: 'lens', label: 'Lente', placeholder: 'Ej: 85mm f/1.4, 35mm' },
        { id: 'lighting', label: 'Iluminación', placeholder: 'Ej: Luz dorada, flash lateral, neón' },
        { id: 'atmosphere', label: 'Atmósfera', placeholder: 'Ej: Cinematográfico HDR, misteriosa' },
        { id: 'style', label: 'Estilo Artístico', placeholder: 'Ej: Vintage editorial, fotorrealista' },
        { id: 'detailLevel', label: 'Nivel de Detalle', placeholder: 'Ej: Altamente detallado, 8k, nítido' },
    ];
    return (_jsx("div", { className: "space-y-4", children: fields.map(field => (_jsx(InputField, { id: field.id, label: field.label, placeholder: field.placeholder, value: promptData[field.id], onChange: onDataChange }, field.id))) }));
};
export default AdvancedOptions;

```

## Nano Banana - Cambio de Perspectiva

Host: https://rocopromts-cambios-de-angulo-688843110097.us-west1.run.app

### constants.js

```javascript
export const PHOTO_ANGLES = [
    { name: "🎯 Plano picado (High Angle)", description: "La cámara está por encima del sujeto, apuntando hacia abajo." },
    { name: "🦸 Plano contrapicado (Low Angle)", description: "La cámara está por debajo del sujeto, apuntando hacia arriba." },
    { name: "🕊️ Cenital (Overhead / Top-down)", description: "La cámara está directamente arriba, mirando verticalmente hacia el suelo." },
    { name: "🚶 Toma de cuerpo completo (Full Body Shot)", description: "La cámara está frente al sujeto, encuadrando todo el cuerpo de pies a cabeza." },
    { name: "🌆 Plano general (Wide / Long Shot)", description: "La cámara está a una distancia amplia, mostrando al sujeto y su entorno completo." },
    { name: "↔️ Side Shot (Toma lateral)", description: "La cámara está ubicada a un lado del sujeto, mostrando su perfil o dirección de movimiento." },
    { name: "🔙 Toma posterior (Back View)", description: "La cámara se sitúa directamente detrás del sujeto, mostrando su espalda y a menudo lo que el sujeto está mirando." },
    { name: "🙋 Plano medio (Medium Shot)", description: "La cámara está a la altura del pecho o cintura, encuadrando de la cintura hacia arriba." },
    { name: "👁️ Close-up (Primer plano / Plano detalle)", description: "La cámara está muy cerca del rostro o del objeto, enfocando una parte clave." },
    { name: "👁️‍🗨️ Extreme Close-up (Detalle extremo del ojo)", description: "Cámara extremadamente cerca (ej. el ojo). Se enfoca en texturas hiperrealistas de piel, detalles macro y calidad HDR." },
    { name: "🚁 Toma aérea de dron (Aerial Drone Shot)", description: "Plano amplio y elevado que captura la escena desde gran altura, mostrando el entorno completo o el movimiento dentro del paisaje. Suele transmitir escala, libertad o una visión panorámica del lugar." },
];

```

### services__geminiService.js

```javascript
import { GoogleGenAI } from "@google/genai";
const fileToGenerativePart = async (file) => {
    const base64EncodedDataPromise = new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(file);
    });
    return {
        inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
    };
};
export const generatePromptFromImageAndAngle = async (imageFile, userDescription, angle) => {
    if (!process.env.API_KEY) {
        throw new Error("API key not found. Please make sure it's configured in your environment variables.");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const imagePart = await fileToGenerativePart(imageFile);
    const isExtremeCloseUp = angle.includes('Extreme Close-up');
    const specificInstruction = isExtremeCloseUp
        ? `\n**Instrucción Adicional para Extreme Close-up (Detalle del Ojo):** El objetivo es un nivel de detalle artístico y fotográfico extremo, centrado en el ojo del sujeto. Sigue este modelo:
1.  **Análisis de Contexto y Accesorios (Obligatorio):** Analiza la imagen original. **Si el sujeto lleva accesorios cerca del ojo, como gafas, sombreros o piercings, DEBES incluirlos en el prompt.** Describe cómo estos accesorios interactúan con el ojo, la luz y la composición. Si no hay accesorios, enfócate en los detalles naturales (pestañas, cejas, arrugas).
2.  **Composición Macro:** Describe la escena como una fotografía macro. Usa los accesorios (si existen) o los rasgos faciales para enmarcar el ojo. Por ejemplo, "el borde superior del ojo está enmarcado por el metal frío de sus gafas" o "sus largas pestañas proyectan una sombra sutil sobre el iris".
3.  **Reflejos y Luz:** Describe con sumo detalle los reflejos en el cristal de las gafas o en la superficie del ojo. ¿Qué se ve reflejado? ¿Cómo incide la luz?
4.  **Formato Final:** El prompt debe ser una sola descripción fluida y evocadora. **Obligatoriamente**, debe terminar con la frase exacta: ", texturas realistas de piel, HDR, tomado con un lente macro 70mm."
**Ejemplo de la lógica deseada:** 'Reimaginando esta escena, transfórmala en un extreme close-up del ojo derecho del hombre. El marco plateado de sus gafas aviador enmarca con fuerza la mitad superior del ojo, mientras el cristal refleja un suave y alargado destello de una luz superior, texturas realistas de piel, HDR, tomado con un lente macro 70mm.'`
        : '';
    const prompt = `Tu rol es el de un director de escena virtual. Tu tarea es re-imaginar una escena completa desde un ángulo de cámara totalmente nuevo.

Analiza la imagen proporcionada. Ahora, genera un prompt para recrear esa escena desde este ángulo: **${angle}**.

**Instrucción CRÍTICA:** No solo cambies el ángulo del sujeto. Debes describir cómo se transforma TODO el entorno. Imagina que tomas una cámara y te mueves físicamente a una nueva posición. El fondo original desaparecerá y será reemplazado por una nueva vista coherente con la nueva perspectiva.

Por ejemplo, si cambias de un plano frontal a un **Side Shot**, lo que estaba directamente detrás del sujeto ya no se ve. En su lugar, describe lo que ahora es visible a su lado en el entorno.

Considera la descripción del usuario: "${userDescription || 'Sin detalles adicionales'}".${specificInstruction}

El prompt final debe ser conciso, visual y cinematográfico. Describe:
1.  Sujeto: Su nueva pose y cómo es visto desde el nuevo ángulo.
2.  Entorno: **Describe el NUEVO fondo y los elementos de la escena que ahora son visibles.**
3.  Atmósfera: Iluminación, estilo y ambiente general, ajustados a la nueva composición.

**Instrucción de formato:** Comienza el prompt generado con un concepto adaptado de "Toma mi escena y modifica su perspectiva completa, incluido el sujeto y el fondo, para transformarla en una...". No uses esa frase literal, adáptala para que sea un buen inicio de prompt de imagen. Genera solo el prompt, sin preámbulos ni explicaciones.

**Regla CLAVE:** El prompt es para el modelo 'nano banana' (Gemini). Debe ser puramente descriptivo en lenguaje natural. NO incluyas NUNCA parámetros técnicos de otras IAs como Midjourney (ej: "--ar", "::", "--v", etc.).

**Idioma:** El prompt final debe estar escrito exclusivamente en español.`;
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, { text: prompt }] },
        });
        const text = response.text;
        if (!text) {
            throw new Error("Received an empty response from the API.");
        }
        return text.trim();
    }
    catch (error) {
        console.error("Error calling Gemini API:", error);
        throw new Error("Failed to generate prompt. The model might be unavailable or the request could be invalid.");
    }
};

```

## VEO 3.1 - JSON prompts

Host: https://rocoprompt-para-veo-3-688843110097.us-west1.run.app

### App.js

```javascript
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState, useCallback } from 'react';
import PromptForm from '@/components/WebhookForm';
import ResponseDisplay from '@/components/ResponseDisplay';
import { GoogleGenAI } from '@google/genai';
const systemInstruction = `
Instrucciones completas del GPT personalizado
Rol del modelo
Eres un director creativo y técnico especializado en spots cinemáticos de producto.
Tu tarea es transformar una idea breve en un prompt JSON estructurado para generar un video cinemático.

Reglas generales
Responde siempre en dos partes:
Parte 1 - Resumen en español:
Un párrafo breve (3-6 líneas) que resuma el video de forma objetiva. Describe la escena con un lenguaje claro y conciso, sin saludos ni un tono personal.
Parte 2 – Prompt JSON en inglés:
El prompt estructurado y válido en formato JSON, siguiendo la plantilla establecida, envuelto en un bloque de código markdown (\`\`\`json).
**Prioridad a la literalidad:** Interpreta la idea del usuario de la forma más literal posible. No añadas elementos surrealistas o fantásticos a menos que se soliciten explícitamente. Si la idea es simple, el prompt debe ser simple y directo.
**Audio por defecto:** NO incluyas música de fondo a menos que el usuario lo pida explícitamente. El campo \`audio\` debe omitirse por defecto.

Estructura obligatoria del JSON:
{
  "description": "...",
  "style": "...",
  "camera": "...",
  "lighting": "...",
  "environment": "...",
  "elements": ["...", "..."],
  "motion": "...",
  "ending": "...",
  "text": "none",
  "dialogue": "optional, user-provided dialogue in its original language",
  "keywords": ["16:9", "...", "..."],
  "timeline": [
    {
      "timestamp": "00:00-00:02",
      "action": "optional micro sequence"
    }
  ],
  "negative_prompts": ["No subtitles", "no text overlays", "no hard cuts", "no music background"]
}

**Manejo de diálogos:** Si la idea del usuario incluye diálogos explícitos (ej: un personaje diciendo 'Hola mundo'), estos deben ser incluidos en el campo \`dialogue\` del JSON, **manteniendo el idioma original del diálogo**. Los diálogos deben ser hablados de forma natural. No deben ser cantados, rapeados o tener un estilo musical, a menos que el usuario lo especifique claramente. El resto del JSON debe permanecer en inglés.

Estética de los videos:
El video debe tener una narrativa visual clara. Enfócate en una composición y movimiento de cámara cinemáticos que presenten la escena descrita. Las transformaciones complejas (explosión, morph, etc.) solo deben incluirse si el usuario las pide.
La cámara debe ser continua, sin cortes bruscos.
El ending siempre muestra el producto centrado o la escena final completa.
Por defecto, text = "none". Solo incluir texto si el usuario lo pide.
Keywords siempre incluyen "16:9" más entre 3 y 6 palabras clave relacionadas.

Estética según marca (si se menciona en la idea):
Apple: minimalismo blanco, transiciones suaves, sin cortes bruscos, foco en productos flotando.
Pepsi: futurismo urbano, colores neón, explosión de energía, festival holográfico.
Dior: lujo onírico, sedas, pétalos, jardines flotantes, atmósfera mágica.
Corona: playa que se transforma en fiesta/rave al atardecer.
IKEA: caja → ensamble rápido de habitación escandinava.
NYC: contenedor → skyline de Nueva York armado en hiperlapso.
Mecha/Transformers: huevo metálico → criatura robótica, movimientos pesados, industriales.

Si no hay marca: usa un estilo premium cinemático y realista.

Banco de keywords recomendado:
Estilos: cinematic, photorealistic, premium minimalism, elegant, futuristic, CGI.
Cámara: ultra close-up, macro, dolly out, crane up, orbital shot, continuous shot, slow motion.
Iluminación: morning sunlight, golden hour, neon glow, soft diffused light, volumetric rays.
Ambientes: cozy nook, futuristic showroom, infinite white void, marble hall, beach rave, urban plaza.
Acciones: explode, morph, levitate, unfold, assemble, hyper-lapse transformation.
Negativos: "no text overlays", "no overt graphics", "no hard cuts".

---
REGLAS DE ITERACIÓN:
Si el usuario proporciona un "JSON Actual" y una "Solicitud de Refinamiento", tu tarea es modificar el JSON existente basándote ÚNICAMENTE en la solicitud de refinamiento.
- NO generes un JSON desde cero.
- MANTÉN todos los campos del JSON original intactos a menos que la solicitud pida explícitamente cambiarlos.
- Responde con el mismo formato: Resumen en español (explicando los cambios) y el bloque de código JSON modificado.
- Ignora la idea original y céntrate en aplicar la modificación al JSON.
---

Ejemplo de funcionamiento
Entrada del usuario:
"Idea: Una botella de perfume libera un jardín de flores flotantes con luz dorada, sin texto."

Respuesta del GPT:
Resumen (Español):
El video comienza con un primer plano macro de una botella de perfume sobre una superficie de mármol, iluminada por una luz dorada. Al presionar el atomizador, una bruma se libera en cámara lenta y se transforma en flores y pétalos flotantes. El entorno evoluciona de un salón de mármol a un jardín etéreo suspendido, manteniendo la botella de perfume como elemento central.

Prompt (JSON en inglés):
\`\`\`json
{
  "description": "Cinematic macro of a perfume bottle on a marble pedestal, glowing under soft golden light. As the spritz is released in slow motion, shimmering mist transforms into floating flowers and petals. The marble hall dissolves into an ethereal garden suspended in the clouds, blending elegance with magic.",
  "style": "cinematic, elegant magical realism",
  "camera": "macro close-up, dolly back with orbit, crane up to reveal full transformation",
  "lighting": "soft golden glow transitioning into moonlit sparkle",
  "environment": "marble hall transforming into a floating flower garden",
  "elements": [
    "perfume bottle with detailed glass reflections",
    "slow-motion mist turning into petals",
    "flowers blooming mid-air",
    "marble dissolving into sky",
    "floating garden scenery"
  ],
  "motion": "mist release → petals and flowers bloom → environment opens into dreamscape",
  "ending": "perfume bottle in foreground, ethereal floating garden glowing behind",
  "text": "none",
  "keywords": ["16:9", "perfume", "floating flowers", "magical realism", "cinematic"],
  "negative_prompts": ["No subtitles", "no text overlays", "no hard cuts", "no music background"]
}
\`\`\`
`;
const App = () => {
    const [prompt, setPrompt] = useState('');
    const [refinementPrompt, setRefinementPrompt] = useState('');
    const [summaryResponse, setSummaryResponse] = useState(null);
    const [jsonResponse, setJsonResponse] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const processApiResponse = (rawText) => {
        const summaryMatch = rawText.match(/Resumen \(Español\):\s*([\s\S]*?)Prompt \(JSON en inglés\):|Resumen \(Español\):\s*([\s\S]*)/s);
        const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
        const summary = summaryMatch ? (summaryMatch[1] || summaryMatch[2] || '').trim() : null;
        if (summary && jsonMatch?.[1]) {
            setSummaryResponse(summary);
            try {
                const parsedJson = JSON.parse(jsonMatch[1]);
                setJsonResponse(JSON.stringify(parsedJson, null, 2));
            }
            catch (e) {
                setJsonResponse(jsonMatch[1].trim());
            }
        }
        else {
            setSummaryResponse(rawText);
            setJsonResponse(null);
        }
    };
    const handleSubmit = useCallback(async () => {
        if (!prompt.trim()) {
            setError('Por favor, introduce un prompt.');
            return;
        }
        setIsLoading(true);
        setError(null);
        setSummaryResponse(null);
        setJsonResponse(null);
        setRefinementPrompt('');
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const fullPrompt = `${systemInstruction}\nAHORA, APLICA ESTAS REGLAS A LA SIGUIENTE IDEA DEL USUARIO.\nEntrada del usuario:\n"Idea: ${prompt}"`;
            const result = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: fullPrompt,
            });
            processApiResponse(result.text);
        }
        catch (err) {
            setError(`Se produjo un error: ${err.message}. Revisa la consola del navegador para más detalles.`);
            setSummaryResponse(null);
            setJsonResponse(null);
        }
        finally {
            setIsLoading(false);
        }
    }, [prompt]);
    const handleRefinementSubmit = useCallback(async () => {
        if (!refinementPrompt.trim()) {
            setError('Por favor, introduce una solicitud de refinamiento.');
            return;
        }
        if (!jsonResponse) {
            setError('No hay un JSON para refinar. Genera un prompt primero.');
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const fullPrompt = `
        ${systemInstruction}
        ---
        Idea Original (contexto):
        "${prompt}"

        JSON Actual:
        \`\`\`json
        ${jsonResponse}
        \`\`\`

        Solicitud de Refinamiento:
        "${refinementPrompt}"

        AHORA, APLICA LAS REGLAS DE ITERACIÓN A ESTE JSON.
      `;
            const result = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: fullPrompt,
            });
            processApiResponse(result.text);
            // Fix: Corrected syntax for catch block. The `=>` was incorrect and caused multiple compile errors.
        }
        catch (err) {
            setError(`Se produjo un error: ${err.message}. Revisa la consola del navegador para más detalles.`);
        }
        finally {
            setIsLoading(false);
            setRefinementPrompt('');
        }
    }, [refinementPrompt, jsonResponse, prompt]);
    return (_jsx("div", { className: "min-h-screen bg-black text-slate-200 font-bold", children: _jsx("div", { className: "container mx-auto px-4 py-8", children: _jsxs("main", { className: "grid grid-cols-1 lg:grid-cols-2 gap-8", children: [_jsx(PromptForm, { prompt: prompt, setPrompt: setPrompt, handleSubmit: handleSubmit, isLoading: isLoading, error: error }), _jsx(ResponseDisplay, { summary: summaryResponse, json: jsonResponse, isLoading: isLoading, error: error, refinementPrompt: refinementPrompt, setRefinementPrompt: setRefinementPrompt, handleRefinementSubmit: handleRefinementSubmit })] }) }) }));
};
export default App;

```

### components__WebhookForm.js

```javascript
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState, useEffect, useRef } from 'react';
const promptOptionsConfig = {
    "tipo_de_video": {
        "opciones": [
            "iPhone",
            "GoPro POV",
            "Cámara en grúa",
            "Car rig POV",
            "Time-lapse",
            "Cámara lenta",
            "Dron",
            "Cámara de seguridad",
            "Stop motion",
            "Close-up / Macro"
        ],
        "instruccion": "Tipo de video: {opcion}"
    },
    "estetica": {
        "opciones": [
            "Cinematográfico",
            "Vintage 8mm",
            "VHS",
            "Blanco y negro / Cine noir",
            "Orange & Teal",
            "Minimalista",
            "Dreamy",
            "Cartoon",
            "Surrealista",
            "Sketch / Boceto",
            "Publicitario"
        ],
        "instruccion": "Estilo {opcion}"
    },
    "camara": {
        "opciones": [
            "Canon EOS R5",
            "RED Komodo 6K",
            "Blackmagic",
            "Arri Alexa Mini",
            "Sony FX3",
            "iPhone",
            "GoPro"
        ],
        "instruccion": "Capturado con {opcion}"
    },
    "lente": {
        "opciones": [
            "Ojo de pez 8mm",
            "Gran angular 24mm",
            "Retrato 85mm",
            "Macro 100mm",
            "Anamórfico"
        ],
        "instruccion": "Con un lente {opcion}"
    },
    "iluminacion": {
        "opciones": [
            "Suave / Difusa",
            "Luz dura de flash",
            "Cálida",
            "Fría",
            "Luz de sol",
            "Hora dorada",
            "Hora azul",
            "Candlelight"
        ],
        "instruccion": "Iluminado con {opcion}"
    },
    "movimiento_de_camara": {
        "opciones": [
            "Dolly shot",
            "Zoom in/out",
            "Paneo",
            "Tilt",
            "Travelling lateral",
            "Plano secuencia",
            "Cámara en mano",
            "Tracking shot",
            "Orbit shot",
            "Steadicam"
        ],
        "instruccion": "Movimiento de cámara: {opcion}"
    },
    "efectos": {
        "opciones": [
            "Grano de película",
            "Lens flare",
            "Motion blur",
            "Light leaks",
            "HDR",
            "Halation",
            "Bloom"
        ],
        "instruccion": "Con efecto {opcion}"
    },
    "voz_masculina": {
        "opciones": [
            "Rasposa profunda",
            "Grave y autoritaria",
            "Cálida y narradora",
            "Juvenil y energética",
            "Relajada y amigable",
            "Aguda y caricaturesca",
            "Dramática y épica",
            "Susurrada e íntima",
            "Robótica / sintetizada"
        ],
        "instruccion": "Estilo de voz masculina {opcion}"
    },
    "voz_femenina": {
        "opciones": [
            "Suave y angelical",
            "Aguda y juvenil",
            "Grave y sensual",
            "Cálida y maternal",
            "Dinámica y comercial",
            "Firme y profesional",
            "Misteriosa y etérea",
            "Caricaturesca / estilo anime",
            "Robótica / sintetizada"
        ],
        "instruccion": "Estilo de voz femenina {opcion}"
    },
    "voz_especial": {
        "opciones": [
            "Neutral narrador documental",
            "ASMR suave y susurrante",
            "Épica de tráiler de cine",
            "Distorsionada estilo radio antigua",
            "Metálica estilo androide",
            "Modulada estilo villano de cómic",
            "Caricatura cómica / exagerada",
            "Niño inocente",
            "Anciano sabio"
        ],
        "instruccion": "Estilo de voz {opcion}"
    },
    "acentos": {
        "opciones": [
            "Mexicano neutral",
            "Español de España",
            "Español argentino",
            "Español colombiano",
            "Inglés estadounidense",
            "Inglés británico",
            "Portugués de Brasil",
            "Francés"
        ],
        "instruccion": "Con acento {opcion}"
    }
};
const categoryDisplayNames = {
    tipo_de_video: '📹 Tipos de video',
    estetica: '🎨 Look',
    camara: '📷 Cámaras',
    lente: '🔭 Lentes',
    iluminacion: '💡 Iluminación',
    movimiento_de_camara: '🎥 Movimientos de cámara',
    efectos: '✨ Efectos',
    voz_masculina: '👨 Voz Masculina',
    voz_femenina: '👩 Voz Femenina',
    voz_especial: '🎤 Voz Especial',
    acentos: '🌐 Acentos',
};
const PromptForm = ({ prompt, setPrompt, handleSubmit, isLoading, error, }) => {
    const [openDropdown, setOpenDropdown] = useState(null);
    const dropdownsRef = useRef(null);
    const handleKeywordClick = (option, instruction) => {
        const textToAdd = instruction.replace('{opcion}', option);
        setPrompt(prev => prev.trim() ? `${prev.trim()}, ${textToAdd}` : textToAdd);
    };
    const handleFormSubmit = (e) => {
        e.preventDefault();
        handleSubmit();
    };
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownsRef.current && !dropdownsRef.current.contains(event.target)) {
                setOpenDropdown(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);
    return (_jsxs("div", { className: "bg-gradient-to-b from-green-950/50 via-black/30 to-black border border-[#31C417]/60 p-6 rounded-2xl card-glow h-full flex flex-col", children: [_jsx("h2", { className: "text-2xl mb-4 text-white", children: "Tu Idea" }), _jsxs("form", { onSubmit: handleFormSubmit, className: "flex flex-col flex-grow", children: [_jsxs("div", { className: "flex-grow flex flex-col", children: [_jsx("label", { htmlFor: "prompt", className: "block text-sm font-normal text-slate-400 mb-2", children: "Describe tu concepto para generar el prompt de VEO 3" }), _jsx("textarea", { id: "prompt", value: prompt, onChange: (e) => setPrompt(e.target.value), placeholder: "Ej: Un panda surfista en una ola gigante de estilo ukiyo-e...", className: "w-full h-64 flex-grow bg-black border border-slate-700 rounded-lg px-4 py-3 text-slate-200 font-mono text-sm placeholder-slate-500 focus:ring-2 focus:ring-[#31C417] focus:border-[#31C417] outline-none transition duration-200 resize-none custom-scrollbar", "aria-label": "Entrada de prompt", "aria-required": "true" })] }), _jsx("div", { className: "my-4", ref: dropdownsRef, children: _jsx("div", { className: "flex flex-wrap gap-2", children: Object.entries(promptOptionsConfig).map(([categoryKey, categoryValue]) => (_jsxs("div", { className: "relative", children: [_jsxs("button", { type: "button", onClick: () => setOpenDropdown(openDropdown === categoryKey ? null : categoryKey), className: "flex items-center justify-center bg-black/20 hover:bg-slate-800/60 text-slate-400 font-normal py-1.5 px-4 rounded-lg transition-colors duration-200 text-sm border border-slate-800", "aria-haspopup": "true", "aria-expanded": openDropdown === categoryKey, children: [categoryDisplayNames[categoryKey], _jsx("svg", { className: `w-4 h-4 ml-2 text-slate-500 transition-transform duration-200 ${openDropdown === categoryKey ? 'rotate-180' : ''}`, fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M19 9l-7 7-7-7" }) })] }), openDropdown === categoryKey && (_jsx("div", { className: "absolute z-10 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto custom-scrollbar", children: _jsx("ul", { className: "py-1", role: "menu", children: categoryValue.opciones.map((item) => (_jsx("li", { children: _jsx("button", { type: "button", onClick: () => {
                                                        handleKeywordClick(item, categoryValue.instruccion);
                                                        setOpenDropdown(null);
                                                    }, className: "w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors duration-150", role: "menuitem", children: item }) }, item))) }) }))] }, categoryKey))) }) }), error && _jsx("p", { className: "text-red-400 text-sm mb-4 font-normal", children: error }), _jsxs("button", { type: "submit", disabled: isLoading, className: "w-full flex items-center justify-center bg-gradient-to-r from-[#31C417] to-[#4ade80] hover:from-[#2DAF15] hover:to-[#31c417] disabled:bg-none disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-black font-bold py-3 px-4 rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black focus:ring-[#31C417]", "aria-live": "polite", children: [_jsx("span", { role: "img", "aria-label": "fire", className: "mr-2 text-xl", children: "\uD83D\uDD25" }), isLoading ? 'Generando...' : 'Generar Prompt'] })] })] }));
};
export default PromptForm;

```

## VEO 3.1 - Imagen a video

Host: https://rocoprompt-para-veo-3-basada-en-imagen-y-prompt-688843110097.us-west1.run.app

### App.js

```javascript
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState, useCallback } from 'react';
import PromptForm from '@/components/WebhookForm';
import ResponseDisplay from '@/components/ResponseDisplay';
import { GoogleGenAI } from '@google/genai';
const systemInstruction = `
Rol del modelo:
Eres un asistente experto en la creación de prompts para la generación de video. Tu tarea es convertir la idea de un usuario en un prompt de texto narrativo, detallado y en español, listo para ser usado por un modelo de video.

Reglas generales:
1.  **Respuesta única:** Tu respuesta SIEMPRE debe ser únicamente el prompt narrativo. NO incluyas resúmenes, explicaciones o texto introductorio como "Aquí está el prompt:".
2.  **Idioma:** El prompt final DEBE estar completamente en español.

3.  **Estructura del Prompt Narrativo:** El prompt debe ser un párrafo cohesivo que describa la escena. Usa frases cortas y directas para cada elemento. Sigue este orden estructural:
    - **Tipo de video:** Comienza con el tipo de video (Ej: Video cinematográfico.).
    - **Sujeto y acción:** Describe al sujeto y lo que está haciendo.
    - **Diálogo:** Si hay diálogo, inclúyelo entre comillas (Ej: Él dice: "soy adicto a la IA".).
    - **Voz y acento:** Describe la voz.
    - **Movimiento de cámara:** Describe el movimiento de la cámara.
    - **Detalles extra:** Describe la iluminación, ambiente, estilo, etc.
    - **Prompts negativos:** Termina siempre con "Prompts negativos: sin subtítulos, sin texto, sin música de fondo" en una nueva línea, a menos que el usuario pida lo contrario.

4.  **Manejo de imágenes (MUY IMPORTANTE):** Si el usuario sube una imagen, esta es la referencia visual. En este caso:
    *   **NO describas lo que ya está en la imagen.**
    *   La descripción del **sujeto y acción** debe enfocarse en la *animación* que el sujeto de la imagen debe realizar (ej: El hombre en la foto levanta la mirada lentamente.).
    *   Los **detalles extra** deben describir los *cambios o adiciones* al ambiente, iluminación o estilo de la imagen (ej: Añade un destello de lente cinemático y un sutil grano de película.).
    *   Si el usuario no especifica acciones o cambios, puedes inferir una acción sutil (ej: Sutil movimiento de respiración.).

5.  **Literalidad:** Interpreta la idea del usuario de la forma más literal posible. No añadas elementos complejos o fantásticos si no se piden.

---
REGLAS DE ITERACIÓN:
Si el usuario proporciona un "Prompt Actual" y una "Solicitud de Refinamiento", tu tarea es modificar el prompt de texto narrativo existente basándote ÚNICAMENTE en la solicitud de refinamiento.
- NO generes un prompt desde cero.
- MANTÉN el flujo y estructura del prompt original intactos a menos que la solicitud pida explícitamente cambiarlos.
- Responde únicamente con el prompt modificado en español.
- Ignora la idea original y céntrate en aplicar la modificación al prompt.
---

Ejemplo de funcionamiento:

Entrada del usuario:
"Idea: Un hombre con barba corta y gafas, vestido con un traje negro roto y camisa blanca, se sienta en una silla de madera dentro de una cancha de baloncesto con poca luz. Dice: “soy adicto a la IA”. Voz neutra con acento mexicano. Movimiento de cámara: dolly in lento a nivel de los ojos. Luz dramática desde arriba con sombras profundas. Fondo oscuro con líneas y aro de básquet desenfocados. Estilo fotorealista con efecto HDR y atmósfera cinematográfica."

Respuesta del GPT:
Video cinematográfico.
Un hombre con barba corta y gafas, vestido con un traje negro roto y camisa blanca, se sienta en una silla de madera dentro de una cancha de baloncesto con poca luz.
Él dice: "soy adicto a la IA".
La voz es neutra con acento mexicano.
La cámara realiza un dolly in lento a nivel de los ojos.
La escena presenta una luz cenital dramática con sombras profundas, un fondo oscuro con líneas de baloncesto y aro desenfocados, y un estilo fotorrealista HDR con atmósfera cinematográfica.
Prompts negativos: sin subtítulos, sin texto, sin música de fondo
`;
const App = () => {
    const [prompt, setPrompt] = useState('');
    const [image, setImage] = useState(null);
    const [refinementPrompt, setRefinementPrompt] = useState('');
    const [promptResponse, setPromptResponse] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const processApiResponse = (rawText) => {
        setPromptResponse(rawText.trim());
    };
    const handleSubmit = useCallback(async () => {
        if (!prompt.trim() && !image) {
            setError('Por favor, introduce un prompt o sube una imagen.');
            return;
        }
        setIsLoading(true);
        setError(null);
        setPromptResponse(null);
        setRefinementPrompt('');
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const userPromptText = `Idea: ${prompt}`;
            let userContent;
            if (image) {
                const imagePart = {
                    inlineData: { mimeType: image.mimeType, data: image.data },
                };
                const textPart = { text: userPromptText };
                userContent = { parts: [imagePart, textPart] };
            }
            else {
                userContent = userPromptText;
            }
            const result = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: userContent,
                config: {
                    systemInstruction: systemInstruction,
                },
            });
            processApiResponse(result.text);
        }
        catch (err) {
            setError(`Se produjo un error: ${err.message}. Revisa la consola del navegador para más detalles.`);
            setPromptResponse(null);
        }
        finally {
            setIsLoading(false);
        }
    }, [prompt, image]);
    const handleRefinementSubmit = useCallback(async () => {
        if (!refinementPrompt.trim()) {
            setError('Por favor, introduce una solicitud de refinamiento.');
            return;
        }
        if (!promptResponse) {
            setError('No hay un prompt para refinar. Genera un prompt primero.');
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const refinementText = `
        Idea Original (contexto):
        "${prompt}"

        Prompt Actual:
        ${promptResponse}

        Solicitud de Refinamiento:
        "${refinementPrompt}"
      `;
            let userContent;
            if (image) {
                const imagePart = {
                    inlineData: { mimeType: image.mimeType, data: image.data },
                };
                const textPart = { text: refinementText };
                userContent = { parts: [imagePart, textPart] };
            }
            else {
                userContent = refinementText;
            }
            const result = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: userContent,
                config: {
                    systemInstruction: systemInstruction,
                }
            });
            processApiResponse(result.text);
        }
        catch (err) {
            setError(`Se produjo un error: ${err.message}. Revisa la consola del navegador para más detalles.`);
        }
        finally {
            setIsLoading(false);
            setRefinementPrompt('');
        }
    }, [refinementPrompt, promptResponse, prompt, image]);
    return (_jsx("div", { className: "min-h-screen bg-black text-slate-200 font-bold", children: _jsx("div", { className: "container mx-auto px-4 py-8", children: _jsxs("main", { className: "grid grid-cols-1 lg:grid-cols-2 gap-8", children: [_jsx(PromptForm, { prompt: prompt, setPrompt: setPrompt, handleSubmit: handleSubmit, isLoading: isLoading, error: error, image: image, setImage: setImage }), _jsx(ResponseDisplay, { promptText: promptResponse, isLoading: isLoading, error: error, refinementPrompt: refinementPrompt, setRefinementPrompt: setRefinementPrompt, handleRefinementSubmit: handleRefinementSubmit })] }) }) }));
};
export default App;

```

### components__WebhookForm.js

```javascript
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState, useEffect, useRef } from 'react';
import { PhotoIcon } from '@/components/icons/PhotoIcon';
const promptOptionsConfig = {
    "tipo_de_video": {
        "opciones": [
            "iPhone",
            "GoPro POV",
            "Cámara en grúa",
            "Car rig POV",
            "Time-lapse",
            "Cámara lenta",
            "Dron",
            "Cámara de seguridad",
            "Stop motion",
            "Close-up / Macro"
        ],
        "instruccion": "Tipo de video: {opcion}"
    },
    "estetica": {
        "opciones": [
            "Cinematográfico",
            "Vintage 8mm",
            "VHS",
            "Blanco y negro / Cine noir",
            "Orange & Teal",
            "Minimalista",
            "Dreamy",
            "Cartoon",
            "Surrealista",
            "Sketch / Boceto",
            "Publicitario",
            "Video casual de celular"
        ],
        "instruccion": "Estilo {opcion}"
    },
    "iluminacion": {
        "opciones": [
            "Suave / Difusa",
            "Luz dura de flash",
            "Cálida",
            "Fría",
            "Luz de sol",
            "Hora dorada",
            "Hora azul",
            "Candlelight"
        ],
        "instruccion": "Iluminado con {opcion}"
    },
    "movimiento_de_camara": {
        "opciones": [
            "Dolly in",
            "Dolly out",
            "Zoom in",
            "Zoom out",
            "Paneo",
            "Tilt",
            "Travelling lateral",
            "Plano secuencia",
            "Cámara en mano",
            "Tracking shot",
            "Orbit shot",
            "Steadicam"
        ],
        "instruccion": "Movimiento de cámara: {opcion}"
    },
    "efectos": {
        "opciones": [
            "Grano de película",
            "Lens flare",
            "Motion blur",
            "Light leaks",
            "HDR",
            "Halation",
            "Bloom"
        ],
        "instruccion": "Con efecto {opcion}"
    },
    "voz_masculina": {
        "opciones": [
            "Rasposa profunda",
            "Grave y autoritaria",
            "Cálida y narradora",
            "Juvenil y energética",
            "Relajada y amigable",
            "Aguda y caricaturesca",
            "Dramática y épica",
            "Susurrada e íntima",
            "Robótica / sintetizada"
        ],
        "instruccion": "Estilo de voz masculina {opcion}"
    },
    "voz_femenina": {
        "opciones": [
            "Suave y angelical",
            "Aguda y juvenil",
            "Grave y sensual",
            "Cálida y maternal",
            "Dinámica y comercial",
            "Firme y profesional",
            "Misteriosa y etérea",
            "Caricaturesca / estilo anime",
            "Robótica / sintetizada"
        ],
        "instruccion": "Estilo de voz femenina {opcion}"
    },
    "voz_especial": {
        "opciones": [
            "Neutral narrador documental",
            "ASMR suave y susurrante",
            "Épica de tráiler de cine",
            "Distorsionada estilo radio antigua",
            "Metálica estilo androide",
            "Modulada estilo villano de cómic",
            "Caricatura cómica / exagerada",
            "Niño inocente",
            "Anciano sabio"
        ],
        "instruccion": "Estilo de voz {opcion}"
    },
    "acentos": {
        "opciones": [
            "Mexicano neutral",
            "Español de España",
            "Español argentino",
            "Español colombiano",
            "Inglés estadounidense",
            "Inglés británico",
            "Portugués de Brasil",
            "Francés"
        ],
        "instruccion": "Con acento {opcion}"
    }
};
const categoryDisplayNames = {
    tipo_de_video: '📹 Tipos de video',
    estetica: '🎨 Look',
    iluminacion: '💡 Iluminación',
    movimiento_de_camara: '🎥 Movimientos de cámara',
    efectos: '✨ Efectos',
    voz_masculina: '👨 Voz Masculina',
    voz_femenina: '👩 Voz Femenina',
    voz_especial: '🎤 Voz Especial',
    acentos: '🌐 Acentos',
};
const PromptForm = ({ prompt, setPrompt, handleSubmit, isLoading, error, image, setImage }) => {
    const [openDropdown, setOpenDropdown] = useState(null);
    const dropdownsRef = useRef(null);
    const fileInputRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    const handleKeywordClick = (option, instruction) => {
        const textToAdd = instruction.replace('{opcion}', option);
        setPrompt(prev => prev.trim() ? `${prev.trim()}, ${textToAdd}` : textToAdd);
    };
    const handleFormSubmit = (e) => {
        e.preventDefault();
        handleSubmit();
    };
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownsRef.current && !dropdownsRef.current.contains(event.target)) {
                setOpenDropdown(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);
    const toBase64 = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result;
            if (!result) {
                reject(new Error("FileReader result is null."));
                return;
            }
            const base64Data = result.split(',')[1];
            resolve({ data: base64Data, mimeType: file.type });
        };
        reader.onerror = error => reject(error);
    });
    const handleFileChange = async (files) => {
        if (files && files[0]) {
            if (!files[0].type.startsWith('image/')) {
                console.error("File is not an image.");
                return;
            }
            try {
                const imageData = await toBase64(files[0]);
                setImage(imageData);
            }
            catch (error) {
                console.error("Error converting file to base64:", error);
            }
        }
    };
    const handleRemoveImage = () => {
        setImage(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };
    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };
    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };
    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFileChange(e.dataTransfer.files);
    };
    const placeholderText = image
        ? "Describe la acción o los cambios para la imagen. Ej: que la cámara se mueva lentamente hacia adelante, añadir un efecto de lluvia..."
        : "Ej: Un panda surfista en una ola gigante de estilo ukiyo-e...";
    return (_jsxs("div", { className: "bg-gradient-to-b from-green-950/50 via-black/30 to-black border border-[#31C417]/60 p-6 rounded-2xl card-glow h-full flex flex-col", children: [_jsx("h2", { className: "text-2xl mb-4 text-white", children: "Tu Idea" }), _jsxs("form", { onSubmit: handleFormSubmit, className: "flex flex-col flex-grow", children: [_jsxs("div", { className: "flex-grow flex flex-col", children: [_jsx("label", { htmlFor: "prompt", className: "block text-sm font-normal text-slate-400 mb-2", children: "Describe tu concepto para generar el prompt de VEO 3" }), _jsx("textarea", { id: "prompt", value: prompt, onChange: (e) => setPrompt(e.target.value), placeholder: placeholderText, className: "w-full h-40 bg-black border border-slate-700 rounded-lg px-4 py-3 text-slate-200 font-mono text-sm placeholder-slate-500 focus:ring-2 focus:ring-[#31C417] focus:border-[#31C417] outline-none transition duration-200 resize-none custom-scrollbar", "aria-label": "Entrada de prompt" })] }), _jsx("div", { className: "my-4", children: image ? (_jsxs("div", { className: "relative group", children: [_jsx("img", { src: `data:${image.mimeType};base64,${image.data}`, alt: "Preview de la imagen subida", className: "w-full rounded-lg max-h-48 object-contain bg-black/50 border border-slate-700" }), _jsx("button", { type: "button", onClick: handleRemoveImage, className: "absolute top-2 right-2 bg-black/70 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 outline-none", "aria-label": "Eliminar imagen", children: _jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M6 18L18 6M6 6l12 12" }) }) })] })) : (_jsxs("div", { onClick: () => fileInputRef.current?.click(), onDragOver: handleDragOver, onDragLeave: handleDragLeave, onDrop: handleDrop, className: `cursor-pointer border-2 border-dashed border-slate-700 rounded-lg p-6 text-center transition-colors ${isDragging ? 'border-[#31C417] bg-green-950/30' : 'hover:border-slate-500'}`, role: "button", "aria-label": "Subir imagen", children: [_jsx("input", { type: "file", ref: fileInputRef, onChange: (e) => handleFileChange(e.target.files), className: "hidden", accept: "image/*" }), _jsxs("div", { className: "flex flex-col items-center justify-center text-slate-400 pointer-events-none", children: [_jsx(PhotoIcon, { className: "w-10 h-10 mb-2 text-slate-500" }), _jsx("p", { className: "font-semibold", children: "Arrastra una imagen aqu\u00ED" }), _jsx("p", { className: "text-sm font-normal", children: "o haz clic para seleccionar" })] })] })) }), _jsx("div", { className: "my-4", ref: dropdownsRef, children: _jsx("div", { className: "flex flex-wrap gap-2", children: Object.entries(promptOptionsConfig).map(([categoryKey, categoryValue]) => (_jsxs("div", { className: "relative", children: [_jsxs("button", { type: "button", onClick: () => setOpenDropdown(openDropdown === categoryKey ? null : categoryKey), className: "flex items-center justify-center bg-black/20 hover:bg-slate-800/60 text-slate-400 font-normal py-1.5 px-4 rounded-lg transition-colors duration-200 text-sm border border-slate-800", "aria-haspopup": "true", "aria-expanded": openDropdown === categoryKey, children: [categoryDisplayNames[categoryKey], _jsx("svg", { className: `w-4 h-4 ml-2 text-slate-500 transition-transform duration-200 ${openDropdown === categoryKey ? 'rotate-180' : ''}`, fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M19 9l-7 7-7-7" }) })] }), openDropdown === categoryKey && (_jsx("div", { className: "absolute z-10 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto custom-scrollbar", children: _jsx("ul", { className: "py-1", role: "menu", children: categoryValue.opciones.map((item) => (_jsx("li", { children: _jsx("button", { type: "button", onClick: () => {
                                                        handleKeywordClick(item, categoryValue.instruccion);
                                                        setOpenDropdown(null);
                                                    }, className: "w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors duration-150", role: "menuitem", children: item }) }, item))) }) }))] }, categoryKey))) }) }), error && _jsx("p", { className: "text-red-400 text-sm mb-4 font-normal", children: error }), _jsxs("button", { type: "submit", disabled: isLoading, className: "w-full flex items-center justify-center bg-gradient-to-r from-[#31C417] to-[#4ade80] hover:from-[#2DAF15] hover:to-[#31c417] disabled:bg-none disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-black font-bold py-3 px-4 rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black focus:ring-[#31C417]", "aria-live": "polite", children: [_jsx("span", { role: "img", "aria-label": "fire", className: "mr-2 text-xl", children: "\uD83D\uDD25" }), isLoading ? 'Generando...' : 'Generar Prompt'] })] })] }));
};
export default PromptForm;

```

## VEO 3.1 - Transiciones

Host: https://roco-prompt-trancisiones-veo-3-688843110097.us-west1.run.app

### services__geminiService.js

```javascript
import { GoogleGenAI } from "@google/genai";
// This should be securely managed and not hardcoded.
// For this environment, we assume process.env.API_KEY is available.
const API_KEY = process.env.API_KEY;
if (!API_KEY) {
    // In a real app, you'd want to handle this more gracefully.
    // For this example, we'll throw an error to make it obvious if the key is missing.
    throw new Error("API_KEY is not defined in environment variables.");
}
const ai = new GoogleGenAI({ apiKey: API_KEY });
const fileToGenerativePart = async (file) => {
    const base64EncodedDataPromise = new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(file);
    });
    return {
        inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
    };
};
export const generateTransitionPrompt = async (startImage, endImage, userNotes) => {
    const model = 'gemini-2.5-flash';
    const basePrompt = `You are an expert creative director specializing in cinematic video transitions for AI video generation. Your goal is to write a detailed, imaginative, and script-like prompt in English that describes a seamless and visually spectacular transition from the 'Start Image' to the 'End Image'.

Analyze both images carefully. The transition must be more than a simple fade or cut. Think about transforming key elements, dynamic camera movements, visual effects (VFX), and thematic connections between the two scenes.`;
    const userDirectionPrompt = userNotes.trim()
        ? `The user has provided the following creative direction:\n"${userNotes}"`
        : `The user has not provided specific creative direction. Your task is to deeply analyze both images to imagine the best possible transition that can be generated without any cuts, as if it were a single, continuous shot. Connect elements, colors, or themes between the 'Start Image' and the 'End Image' to create a fluid and logical cinematic bridge. The camera should move seamlessly or elements should morph organically to connect the two scenes into one uninterrupted sequence.`;
    const finalPromptPart = `Based on the images and the provided direction (or your creative analysis if none was given), generate ONLY the detailed text prompt in English, ready to be used in a video generation model.

The prompt must be direct, without titles, headers, asterisks, JSON quotes, or additional explanations. Only the instructions for the video AI. The entire response must be in English.`;
    const prompt = `${basePrompt}\n\n${userDirectionPrompt}\n\n${finalPromptPart}`;
    try {
        const startImagePart = await fileToGenerativePart(startImage);
        const endImagePart = await fileToGenerativePart(endImage);
        const response = await ai.models.generateContent({
            model: model,
            contents: {
                parts: [
                    { text: "Start Image:" },
                    startImagePart,
                    { text: "End Image:" },
                    endImagePart,
                    { text: prompt },
                ],
            },
        });
        return response.text;
    }
    catch (error) {
        console.error("Error calling Gemini API:", error);
        if (error instanceof Error && error.message.includes('API key not valid')) {
            throw new Error("La clave de API no es válida. Por favor, verifica tu configuración.");
        }
        throw new Error("No se pudo generar el prompt. Inténtalo de nuevo más tarde.");
    }
};

```

## Kling - Imagen a video

Host: https://kling-imagen-a-video-688843110097.us-west1.run.app

### App.js

```javascript
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState, useCallback } from 'react';
import PromptForm from '@/components/WebhookForm';
import ResponseDisplay from '@/components/ResponseDisplay';
import { GoogleGenAI } from '@google/genai';
const systemInstruction = `
**Rol y Objetivo:**
Eres un asistente experto en la creación de prompts para Kling, una IA de generación de video. Tu tarea es generar un único prompt efectivo de hasta 50 palabras, en INGLÉS, siguiendo una estructura estricta.

**Reglas Fundamentales:**
1.  **Solo el Prompt:** Tu respuesta completa debe ser ÚNICAMENTE el prompt generado. Sin introducciones, explicaciones ni ningún otro texto.
2.  **Idioma:** El prompt final DEBE estar completamente en INGLÉS, incluso si la idea del usuario está en español.
3.  **Formato:** Una sola oración, máximo 50 palabras. Usa comas para separar conceptos, no conectores largos.
4.  **Estilo:** Usa tercera persona y lenguaje visual concreto. Evita la subjetividad, la redundancia, las contradicciones o la repetición de estilo/acción.

**Estructura del Prompt (Orden Estricto):**
1.  **Estilo Visual (Obligatorio):** Comienza siempre con el estilo visual.
    *   Ejemplos: cinematic video, anime scene, 3D animated style, digital painting, watercolor animation, hyperrealistic short film, surreal dreamlike video.
2.  **Sujetos y Acción (Obligatorio):** Describe los personajes/objetos y lo que están haciendo.
    *   Ejemplos: a wolf chasing a deer through the woods, two astronauts repairing a satellite in orbit, a child and a robot walking in the rain.
3.  **Movimiento de Cámara (Opcional pero recomendado):** Describe el movimiento de la cámara. Puedes usar uno o una combinación coherente de dos.
    *   Ejemplos: camera slowly zooms in, tracking shot from behind, overhead drone-like shot, camera rotates around subject, camera tilts upward, top-down static shot, handheld camera effect, dramatic dolly zoom, steadycam following subject, first-person view.
4.  **Detalles Estéticos / Atmósfera (Opcional):** Añade detalles sobre la iluminación, el ambiente, el estado de ánimo, etc.
    *   Ejemplos: dense fog and cold morning light, neon lights reflecting on wet asphalt, fireflies glowing in the dark, sunset with long shadows, post-apocalyptic ruins in the background, heavy rain and lightning flashes.

**Manejo de Imágenes (Si el usuario proporciona una imagen):**
La imagen es la referencia visual principal.
-   **Analiza, no Describas:** NO describas lo que es obviamente visible en la imagen.
-   **Enfócate en la Acción:** Para "Sujetos y Acción", describe la *animación* o el *movimiento* que el sujeto debe realizar. Si el usuario no especifica una acción, infiere una sutil y natural (ej: "...subtle breathing movement...").
-   **Enfócate en los Cambios:** Para "Detalles Estéticos", describe los *cambios o adiciones* al entorno de la imagen (ej: "...heavy rain and lightning flashes...", "...the scene transitions to night...").

**Reglas de Refinamiento:**
Si el usuario proporciona un "Prompt Actual" y una "Solicitud de Refinamiento", modifica el prompt existente basándote ÚNICAMENTE en la solicitud. No generes un prompt completamente nuevo. Mantén la estructura.

**Ejemplo de Prompt Final:**
Cinematic video, two samurai fighting on a snowy bridge, camera rotates slowly around them, wind blowing snowflakes, dramatic lighting and cold fog rising from the river below.
`;
const App = () => {
    const [prompt, setPrompt] = useState('');
    const [image, setImage] = useState(null);
    const [refinementPrompt, setRefinementPrompt] = useState('');
    const [promptResponse, setPromptResponse] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const processApiResponse = (rawText) => {
        setPromptResponse(rawText.trim());
    };
    const handleSubmit = useCallback(async () => {
        if (!prompt.trim() && !image) {
            setError('Por favor, introduce un prompt o sube una imagen.');
            return;
        }
        setIsLoading(true);
        setError(null);
        setPromptResponse(null);
        setRefinementPrompt('');
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const userPromptText = `Idea: ${prompt}`;
            let userContent;
            if (image) {
                const imagePart = {
                    inlineData: { mimeType: image.mimeType, data: image.data },
                };
                const textPart = { text: userPromptText };
                userContent = { parts: [imagePart, textPart] };
            }
            else {
                userContent = userPromptText;
            }
            const result = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { role: 'user', parts: Array.isArray(userContent.parts) ? userContent.parts : [{ text: userContent }] },
                config: {
                    systemInstruction: systemInstruction,
                },
            });
            processApiResponse(result.text);
        }
        catch (err) {
            setError(`Se produjo un error: ${err.message}. Revisa la consola del navegador para más detalles.`);
            setPromptResponse(null);
        }
        finally {
            setIsLoading(false);
        }
    }, [prompt, image]);
    const handleRefinementSubmit = useCallback(async () => {
        if (!refinementPrompt.trim()) {
            setError('Por favor, introduce una solicitud de refinamiento.');
            return;
        }
        if (!promptResponse) {
            setError('No hay un prompt para refinar. Genera un prompt primero.');
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const refinementText = `
        Idea Original (contexto):
        "${prompt}"

        Prompt Actual:
        ${promptResponse}

        Solicitud de Refinamiento:
        "${refinementPrompt}"
      `;
            let userContent;
            if (image) {
                const imagePart = {
                    inlineData: { mimeType: image.mimeType, data: image.data },
                };
                const textPart = { text: refinementText };
                userContent = { parts: [imagePart, textPart] };
            }
            else {
                userContent = refinementText;
            }
            const result = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { role: 'user', parts: Array.isArray(userContent.parts) ? userContent.parts : [{ text: userContent }] },
                config: {
                    systemInstruction: systemInstruction,
                }
            });
            processApiResponse(result.text);
        }
        catch (err) {
            setError(`Se produjo un error: ${err.message}. Revisa la consola del navegador para más detalles.`);
        }
        finally {
            setIsLoading(false);
            setRefinementPrompt('');
        }
    }, [refinementPrompt, promptResponse, prompt, image]);
    return (_jsx("div", { className: "min-h-screen bg-black text-slate-200 font-bold", children: _jsx("div", { className: "container mx-auto px-4 py-8", children: _jsxs("main", { className: "grid grid-cols-1 lg:grid-cols-2 gap-8", children: [_jsx(PromptForm, { prompt: prompt, setPrompt: setPrompt, handleSubmit: handleSubmit, isLoading: isLoading, error: error, image: image, setImage: setImage }), _jsx(ResponseDisplay, { promptText: promptResponse, isLoading: isLoading, error: error, refinementPrompt: refinementPrompt, setRefinementPrompt: setRefinementPrompt, handleRefinementSubmit: handleRefinementSubmit })] }) }) }));
};
export default App;

```

### components__WebhookForm.js

```javascript
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState, useEffect, useRef } from 'react';
import { PhotoIcon } from '@/components/icons/PhotoIcon';
const promptOptionsConfig = {
    "estilo_visual": {
        "opciones": [
            "cinematic video",
            "anime scene",
            "3D animated style",
            "digital painting",
            "watercolor animation",
            "hyperrealistic short film",
            "surreal dreamlike video"
        ],
        "instruccion": "{opcion}"
    },
    "movimiento_camara": {
        "opciones": [
            "camera slowly zooms in",
            "camera slowly zooms out",
            "fast zoom in",
            "tracking shot from behind",
            "tracking shot from the side",
            "overhead drone-like shot",
            "camera rotates around subject",
            "camera tilts upward",
            "camera pans from left to right",
            "camera pans down",
            "top-down static shot",
            "handheld camera effect",
            "slow motion shot",
            "dramatic dolly zoom",
            "wide-angle fixed shot",
            "orbiting camera",
            "steadycam following subject",
            "first-person view",
            "fly-through camera movement",
            "vertical rise (elevating camera)",
            "close-up shot followed by zoom out"
        ],
        "instruccion": "{opcion}"
    },
    "detalles_esteticos": {
        "opciones": [
            "dense fog and cold morning light",
            "neon lights reflecting on wet asphalt",
            "fireflies glowing in the dark",
            "sunset with long shadows",
            "post-apocalyptic ruins in the background",
            "surreal floating elements in the air",
            "heavy rain and lightning flashes",
            "wind blowing snowflakes",
            "dramatic lighting",
            "cold fog rising from the river",
            "glowing clouds and warm sunset",
            "deep blue water with sun reflections",
            "gentle waves",
            "dust and golden sunlight",
            "intense contrast and dynamic shadows"
        ],
        "instruccion": "{opcion}"
    }
};
const categoryDisplayNames = {
    estilo_visual: '🎨 Estilo Visual',
    movimiento_camara: '🎥 Movimiento de Cámara',
    detalles_esteticos: '✨ Detalles / Atmósfera',
};
const PromptForm = ({ prompt, setPrompt, handleSubmit, isLoading, error, image, setImage }) => {
    const [openDropdown, setOpenDropdown] = useState(null);
    const dropdownsRef = useRef(null);
    const fileInputRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    const handleKeywordClick = (option, instruction) => {
        const textToAdd = instruction.replace('{opcion}', option);
        setPrompt(prev => prev.trim() ? `${prev.trim()}, ${textToAdd}` : textToAdd);
    };
    const handleFormSubmit = (e) => {
        e.preventDefault();
        handleSubmit();
    };
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownsRef.current && !dropdownsRef.current.contains(event.target)) {
                setOpenDropdown(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);
    const toBase64 = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result;
            if (!result) {
                reject(new Error("FileReader result is null."));
                return;
            }
            const base64Data = result.split(',')[1];
            resolve({ data: base64Data, mimeType: file.type });
        };
        reader.onerror = error => reject(error);
    });
    const handleFileChange = async (files) => {
        if (files && files[0]) {
            if (!files[0].type.startsWith('image/')) {
                console.error("File is not an image.");
                return;
            }
            try {
                const imageData = await toBase64(files[0]);
                setImage(imageData);
            }
            catch (error) {
                console.error("Error converting file to base64:", error);
            }
        }
    };
    const handleRemoveImage = () => {
        setImage(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };
    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };
    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };
    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFileChange(e.dataTransfer.files);
    };
    const placeholderText = image
        ? "Describe la acción o los cambios para la imagen. Ej: que la cámara se mueva lentamente hacia adelante, añadir un efecto de lluvia..."
        : "Ej: cinematic video, un panda surfista en una ola gigante...";
    return (_jsxs("div", { className: "bg-gradient-to-b from-green-950/50 via-black/30 to-black border border-[#31C417]/60 p-6 rounded-2xl card-glow h-full flex flex-col", children: [_jsx("h2", { className: "text-2xl mb-4 text-white", children: "Tu Idea" }), _jsxs("form", { onSubmit: handleFormSubmit, className: "flex flex-col flex-grow", children: [_jsxs("div", { className: "flex-grow flex flex-col", children: [_jsx("label", { htmlFor: "prompt", className: "block text-sm font-normal text-slate-400 mb-2", children: "Describe tu concepto para generar el prompt para Kling" }), _jsx("textarea", { id: "prompt", value: prompt, onChange: (e) => setPrompt(e.target.value), placeholder: placeholderText, className: "w-full h-40 bg-black border border-slate-700 rounded-lg px-4 py-3 text-slate-200 font-mono text-sm placeholder-slate-500 focus:ring-2 focus:ring-[#31C417] focus:border-[#31C417] outline-none transition duration-200 resize-none custom-scrollbar", "aria-label": "Entrada de prompt" })] }), _jsx("div", { className: "my-4", children: image ? (_jsxs("div", { className: "relative group", children: [_jsx("img", { src: `data:${image.mimeType};base64,${image.data}`, alt: "Preview de la imagen subida", className: "w-full rounded-lg max-h-48 object-contain bg-black/50 border border-slate-700" }), _jsx("button", { type: "button", onClick: handleRemoveImage, className: "absolute top-2 right-2 bg-black/70 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 outline-none", "aria-label": "Eliminar imagen", children: _jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M6 18L18 6M6 6l12 12" }) }) })] })) : (_jsxs("div", { onClick: () => fileInputRef.current?.click(), onDragOver: handleDragOver, onDragLeave: handleDragLeave, onDrop: handleDrop, className: `cursor-pointer border-2 border-dashed border-slate-700 rounded-lg p-6 text-center transition-colors ${isDragging ? 'border-[#31C417] bg-green-950/30' : 'hover:border-slate-500'}`, role: "button", "aria-label": "Subir imagen", children: [_jsx("input", { type: "file", ref: fileInputRef, onChange: (e) => handleFileChange(e.target.files), className: "hidden", accept: "image/*" }), _jsxs("div", { className: "flex flex-col items-center justify-center text-slate-400 pointer-events-none", children: [_jsx(PhotoIcon, { className: "w-10 h-10 mb-2 text-slate-500" }), _jsx("p", { className: "font-semibold", children: "Arrastra una imagen aqu\u00ED" }), _jsx("p", { className: "text-sm font-normal", children: "o haz clic para seleccionar" })] })] })) }), _jsx("div", { className: "my-4", ref: dropdownsRef, children: _jsx("div", { className: "flex flex-wrap gap-2", children: Object.entries(promptOptionsConfig).map(([categoryKey, categoryValue]) => (_jsxs("div", { className: "relative", children: [_jsxs("button", { type: "button", onClick: () => setOpenDropdown(openDropdown === categoryKey ? null : categoryKey), className: "flex items-center justify-center bg-black/20 hover:bg-slate-800/60 text-slate-400 font-normal py-1.5 px-4 rounded-lg transition-colors duration-200 text-sm border border-slate-800", "aria-haspopup": "true", "aria-expanded": openDropdown === categoryKey, children: [categoryDisplayNames[categoryKey], _jsx("svg", { className: `w-4 h-4 ml-2 text-slate-500 transition-transform duration-200 ${openDropdown === categoryKey ? 'rotate-180' : ''}`, fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M19 9l-7 7-7-7" }) })] }), openDropdown === categoryKey && (_jsx("div", { className: "absolute z-10 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto custom-scrollbar", children: _jsx("ul", { className: "py-1", role: "menu", children: categoryValue.opciones.map((item) => (_jsx("li", { children: _jsx("button", { type: "button", onClick: () => {
                                                        handleKeywordClick(item, categoryValue.instruccion);
                                                        setOpenDropdown(null);
                                                    }, className: "w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors duration-150", role: "menuitem", children: item }) }, item))) }) }))] }, categoryKey))) }) }), error && _jsx("p", { className: "text-red-400 text-sm mb-4 font-normal", children: error }), _jsxs("button", { type: "submit", disabled: isLoading, className: "w-full flex items-center justify-center bg-gradient-to-r from-[#31C417] to-[#4ade80] hover:from-[#2DAF15] hover:to-[#31c417] disabled:bg-none disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-black font-bold py-3 px-4 rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black focus:ring-[#31C417]", "aria-live": "polite", children: [_jsx("span", { role: "img", "aria-label": "fire", className: "mr-2 text-xl", children: "\uD83D\uDD25" }), isLoading ? 'Generando...' : 'Generar Prompt'] })] })] }));
};
export default PromptForm;

```

## Kling - Transiciones

Host: https://kling-transiciones-688843110097.us-west1.run.app

### services__geminiService.js

```javascript
import { GoogleGenAI } from "@google/genai";
// This should be securely managed and not hardcoded.
// For this environment, we assume process.env.API_KEY is available.
const API_KEY = process.env.API_KEY;
if (!API_KEY) {
    // In a real app, you'd want to handle this more gracefully.
    // For this example, we'll throw an error to make it obvious if the key is missing.
    throw new Error("API_KEY is not defined in environment variables.");
}
const ai = new GoogleGenAI({ apiKey: API_KEY });
const fileToGenerativePart = async (file) => {
    const base64EncodedDataPromise = new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(file);
    });
    return {
        inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
    };
};
export const generateTransitionPrompt = async (startImage, endImage, userNotes) => {
    const model = 'gemini-2.5-flash';
    const basePrompt = `You are an expert creative director specializing in cinematic video transitions for AI video generation. Your goal is to write a detailed, imaginative, and script-like prompt in English that describes a seamless and visually spectacular transition from the 'Start Image' to the 'End Image'.

Analyze both images carefully. The transition must be more than a simple fade or cut. Think about transforming key elements, dynamic camera movements, visual effects (VFX), and thematic connections between the two scenes.`;
    const userDirectionPrompt = userNotes.trim()
        ? `The user has provided the following creative direction:\n"${userNotes}"`
        : `The user has not provided specific creative direction. Your task is to deeply analyze both images to imagine the best possible transition that can be generated without any cuts, as if it were a single, continuous shot. Connect elements, colors, or themes between the 'Start Image' and the 'End Image' to create a fluid and logical cinematic bridge. The camera should move seamlessly or elements should morph organically to connect the two scenes into one uninterrupted sequence.`;
    const finalPromptPart = `Based on the images and the provided direction (or your creative analysis if none was given), generate ONLY the detailed text prompt in English, ready to be used in a video generation model.

The prompt must be direct, without titles, headers, asterisks, JSON quotes, or additional explanations. Only the instructions for the video AI. The entire response must be in English.

CRITICAL CONSTRAINT: The final output text MUST NOT exceed 500 characters. This is a hard limit. Prioritize the most impactful visual details and ensure the description is complete within this limit.`;
    const prompt = `${basePrompt}\n\n${userDirectionPrompt}\n\n${finalPromptPart}`;
    try {
        const startImagePart = await fileToGenerativePart(startImage);
        const endImagePart = await fileToGenerativePart(endImage);
        const response = await ai.models.generateContent({
            model: model,
            contents: {
                parts: [
                    { text: "Start Image:" },
                    startImagePart,
                    { text: "End Image:" },
                    endImagePart,
                    { text: prompt },
                ],
            },
        });
        return response.text;
    }
    catch (error) {
        console.error("Error calling Gemini API:", error);
        if (error instanceof Error && error.message.includes('API key not valid')) {
            throw new Error("La clave de API no es válida. Por favor, verifica tu configuración.");
        }
        throw new Error("No se pudo generar el prompt. Inténtalo de nuevo más tarde.");
    }
};

```

## Kling - Texto a video

Host: https://kling-texto-a-video-688843110097.us-west1.run.app

### App.js

```javascript
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState, useCallback } from 'react';
import PromptForm from '@/components/WebhookForm';
import ResponseDisplay from '@/components/ResponseDisplay';
import { GoogleGenAI } from '@google/genai';
const systemInstruction = `
Eres un asistente experto en la creación de prompts para el generador de video IA Kling.
Tu objetivo es tomar la idea del usuario y transformarla en un prompt efectivo de una sola oración, con un máximo de 50 palabras, siguiendo una estructura específica.

La estructura del prompt DEBE ser en este orden y separada por comas:
1. Estilo Visual (obligatorio - siempre al inicio)
2. Sujetos y Acción (obligatorio)
3. Movimiento(s) de Cámara (opcional pero recomendado)
4. Detalles Estéticos / Atmósfera (opcional)

---
LISTAS DE EJEMPLOS PARA CADA SECCIÓN:

1. Estilo Visual:
- cinematic video
- anime scene
- 3D animated style
- digital painting
- watercolor animation
- hyperrealistic short film
- surreal dreamlike video

2. Sujetos y Acción:
- a wolf chasing a deer through the woods
- two astronauts repairing a satellite in orbit
- a child and a robot walking in the rain
- birds flying across a canyon
- people dancing in a neon-lit street

3. Movimiento de Cámara (puedes usar uno o una combinación coherente):
- camera slowly zooms in
- tracking shot from behind
- overhead drone-like shot
- camera rotates around subject
- camera tilts upward
- top-down static shot
- steadycam following subject
- close-up shot followed by zoom out

4. Detalles Estéticos / Atmósfera:
- dense fog and cold morning light
- neon lights reflecting on wet asphalt
- fireflies glowing in the dark
- sunset with long shadows
- post-apocalyptic ruins in the background
- surreal floating elements in the air
- heavy rain and lightning flashes

---
REGLAS GENERALES OBLIGATORIAS:
- El prompt final debe ser UNA SOLA oración.
- Máximo 50 palabras.
- Usar tercera persona y lenguaje visual concreto.
- Separar las partes del prompt con comas, no usar conectores largos como 'and' o 'then'.
- Evitar subjetividad (ej. "hermoso") o redundancias.
- No usar contradicciones.
- No repetir el estilo o la acción.
- El prompt debe estar en inglés.

---
Ejemplos de prompts completos y correctos:
- Idea: "dos samuráis peleando en un puente con nieve" -> Prompt: Cinematic video, two samurai fighting on a snowy bridge, camera rotates slowly around them, wind blowing snowflakes, dramatic lighting and cold fog rising from the river below.
- Idea: "un niño y su robot volando" -> Prompt: Anime scene, a boy and his robot flying over mountains, tracking shot from below and upward tilt, glowing clouds and warm sunset in the distance.
- Idea: "un caballo corriendo por un cañón" -> Prompt: Hyperrealistic short film, a horse galloping through a canyon, camera pans left then follows behind, dust and golden sunlight creating intense contrast and dynamic shadows.

---
AHORA, APLICA ESTAS REGLAS A LA SIGUIENTE IDEA DEL USUARIO. Responde ÚNICAMENTE con el prompt generado en inglés. No incluyas explicaciones, saludos ni ningún otro texto. Solo el prompt.
`;
const App = () => {
    const [prompt, setPrompt] = useState('');
    const [response, setResponse] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const handleSubmit = useCallback(async () => {
        if (!prompt.trim()) {
            setError('Por favor, introduce una idea.');
            return;
        }
        setIsLoading(true);
        setError(null);
        setResponse(null);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const fullPrompt = `${systemInstruction}\nIdea del usuario: "${prompt}"`;
            const result = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: fullPrompt,
            });
            setResponse(result.text.trim());
        }
        catch (err) {
            setError(`Se produjo un error: ${err.message}. Revisa la consola del navegador para más detalles.`);
            setResponse(null);
        }
        finally {
            setIsLoading(false);
        }
    }, [prompt]);
    return (_jsx("div", { className: "min-h-screen bg-black text-slate-200 font-bold", children: _jsx("div", { className: "container mx-auto px-4 py-8", children: _jsxs("main", { className: "grid grid-cols-1 lg:grid-cols-2 gap-8", children: [_jsx(PromptForm, { prompt: prompt, setPrompt: setPrompt, handleSubmit: handleSubmit, isLoading: isLoading, error: error }), _jsx(ResponseDisplay, { response: response, isLoading: isLoading, error: error })] }) }) }));
};
export default App;

```

### components__WebhookForm.js

```javascript
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState, useEffect, useRef } from 'react';
const promptOptionsConfig = {
    "tipo_de_video": {
        "opciones": [
            "iPhone",
            "GoPro POV",
            "Cámara en grúa",
            "Car rig POV",
            "Time-lapse",
            "Cámara lenta",
            "Dron",
            "Cámara de seguridad",
            "Stop motion",
            "Close-up / Macro"
        ],
        "instruccion": "Tipo de video: {opcion}"
    },
    "estetica": {
        "opciones": [
            "Cinematográfico",
            "Vintage 8mm",
            "VHS",
            "Blanco y negro / Cine noir",
            "Orange & Teal",
            "Minimalista",
            "Dreamy",
            "Cartoon",
            "Surrealista",
            "Sketch / Boceto",
            "Publicitario"
        ],
        "instruccion": "Estilo {opcion}"
    },
    "camara": {
        "opciones": [
            "Canon EOS R5",
            "RED Komodo 6K",
            "Blackmagic",
            "Arri Alexa Mini",
            "Sony FX3",
            "iPhone",
            "GoPro"
        ],
        "instruccion": "Capturado con {opcion}"
    },
    "lente": {
        "opciones": [
            "Ojo de pez 8mm",
            "Gran angular 24mm",
            "Retrato 85mm",
            "Macro 100mm",
            "Anamórfico"
        ],
        "instruccion": "Con un lente {opcion}"
    },
    "iluminacion": {
        "opciones": [
            "Suave / Difusa",
            "Luz dura de flash",
            "Cálida",
            "Fría",
            "Luz de sol",
            "Hora dorada",
            "Hora azul",
            "Candlelight"
        ],
        "instruccion": "Iluminado con {opcion}"
    },
    "movimiento_de_camara": {
        "opciones": [
            "Dolly shot",
            "Zoom in/out",
            "Paneo",
            "Tilt",
            "Travelling lateral",
            "Plano secuencia",
            "Cámara en mano",
            "Tracking shot",
            "Orbit shot",
            "Steadicam"
        ],
        "instruccion": "Movimiento de cámara: {opcion}"
    },
    "efectos": {
        "opciones": [
            "Grano de película",
            "Lens flare",
            "Motion blur",
            "Light leaks",
            "HDR",
            "Halation",
            "Bloom"
        ],
        "instruccion": "Con efecto {opcion}"
    }
};
const categoryDisplayNames = {
    tipo_de_video: '📹 Tipos de video',
    estetica: '🎨 Look',
    camara: '📷 Cámaras',
    lente: '🔭 Lentes',
    iluminacion: '💡 Iluminación',
    movimiento_de_camara: '🎥 Movimientos de cámara',
    efectos: '✨ Efectos',
};
const PromptForm = ({ prompt, setPrompt, handleSubmit, isLoading, error, }) => {
    const [openDropdown, setOpenDropdown] = useState(null);
    const dropdownsRef = useRef(null);
    const handleKeywordClick = (option, instruction) => {
        const textToAdd = instruction.replace('{opcion}', option);
        setPrompt(prev => prev.trim() ? `${prev.trim()}, ${textToAdd}` : textToAdd);
    };
    const handleFormSubmit = (e) => {
        e.preventDefault();
        handleSubmit();
    };
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownsRef.current && !dropdownsRef.current.contains(event.target)) {
                setOpenDropdown(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);
    return (_jsxs("div", { className: "bg-gradient-to-b from-green-950/50 via-black/30 to-black border border-[#31C417]/60 p-6 rounded-2xl card-glow h-full flex flex-col", children: [_jsx("h2", { className: "text-2xl mb-4 text-white", children: "Tu Idea" }), _jsxs("form", { onSubmit: handleFormSubmit, className: "flex flex-col flex-grow", children: [_jsxs("div", { className: "flex-grow flex flex-col", children: [_jsx("label", { htmlFor: "prompt", className: "block text-sm font-normal text-slate-400 mb-2", children: "Describe tu concepto para generar el prompt de Kling" }), _jsx("textarea", { id: "prompt", value: prompt, onChange: (e) => setPrompt(e.target.value), placeholder: "Ej: Un panda surfista en una ola gigante de estilo ukiyo-e...", className: "w-full h-64 flex-grow bg-black border border-slate-700 rounded-lg px-4 py-3 text-slate-200 font-mono text-sm placeholder-slate-500 focus:ring-2 focus:ring-[#31C417] focus:border-[#31C417] outline-none transition duration-200 resize-none custom-scrollbar", "aria-label": "Entrada de prompt", "aria-required": "true" })] }), _jsx("div", { className: "my-4", ref: dropdownsRef, children: _jsx("div", { className: "flex flex-wrap gap-2", children: Object.entries(promptOptionsConfig).map(([categoryKey, categoryValue]) => (_jsxs("div", { className: "relative", children: [_jsxs("button", { type: "button", onClick: () => setOpenDropdown(openDropdown === categoryKey ? null : categoryKey), className: "flex items-center justify-center bg-black/20 hover:bg-slate-800/60 text-slate-400 font-normal py-1.5 px-4 rounded-lg transition-colors duration-200 text-sm border border-slate-800", "aria-haspopup": "true", "aria-expanded": openDropdown === categoryKey, children: [categoryDisplayNames[categoryKey], _jsx("svg", { className: `w-4 h-4 ml-2 text-slate-500 transition-transform duration-200 ${openDropdown === categoryKey ? 'rotate-180' : ''}`, fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M19 9l-7 7-7-7" }) })] }), openDropdown === categoryKey && (_jsx("div", { className: "absolute z-10 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto custom-scrollbar", children: _jsx("ul", { className: "py-1", role: "menu", children: categoryValue.opciones.map((item) => (_jsx("li", { children: _jsx("button", { type: "button", onClick: () => {
                                                        handleKeywordClick(item, categoryValue.instruccion);
                                                        setOpenDropdown(null);
                                                    }, className: "w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors duration-150", role: "menuitem", children: item }) }, item))) }) }))] }, categoryKey))) }) }), error && _jsx("p", { className: "text-red-400 text-sm mb-4 font-normal", children: error }), _jsxs("button", { type: "submit", disabled: isLoading, className: "w-full flex items-center justify-center bg-gradient-to-r from-[#31C417] to-[#4ade80] hover:from-[#2DAF15] hover:to-[#31c417] disabled:bg-none disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-black font-bold py-3 px-4 rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black focus:ring-[#31C417]", "aria-live": "polite", children: [_jsx("span", { role: "img", "aria-label": "fire", className: "mr-2 text-xl", children: "\uD83D\uDD25" }), isLoading ? 'Generando...' : 'Generar Prompt'] })] })] }));
};
export default PromptForm;

```

## Midjourney - Bot para Prompts

Host: https://midjourney-prompt-688843110097.us-west1.run.app

### services__geminiService.js

```javascript
import { GoogleGenAI } from "@google/genai";
const API_KEY = process.env.API_KEY;
if (!API_KEY) {
    throw new Error("API_KEY environment variable not set");
}
const ai = new GoogleGenAI({ apiKey: API_KEY });
const model = 'gemini-2.5-flash';
const MASTER_STRUCTURE_INSTRUCTIONS = `
You must follow a strict 10-part structure, with each part separated by a comma. The final output must be a single line of text.

The structure is as follows:
1.  **Image Type:** (e.g., cinematic photo, 3D render, watercolor painting)
2.  **Subject and Action:** (Based on the user's input, but embellished)
3.  **Environment or Location:** (Based on the user's input, but embellished)
4.  **Mood or Emotion:** (e.g., mysterious, joyful, melancholic, chaotic)
5.  **Aesthetic and Visual Details:** (e.g., glowing elements, detailed textures, fog in the background)
6.  **Camera Angle:** (e.g., low angle, aerial view, bird's-eye view)
7.  **Lighting Style:** (e.g., cinematic lighting, golden hour light, neon lighting)
8.  **Shot Type:** (e.g., wide shot, macro shot, full body shot)
9.  **Camera or Lens:** (e.g., captured with Canon EOS R5, shot on 35mm film, fisheye lens)
10. **Artistic Inspiration or Style:** (e.g., in the style of Wes Anderson, inspired by Studio Ghibli, surrealist Dali-inspired)

**Crucial Rules:**
- ALWAYS generate prompts in English.
- NEVER use any Midjourney technical parameters (like --v, --ar, --style, etc.).
- Separate all concepts with commas.
- Use clear, concise, and visual descriptions.
- AVOID conversational language (do not use "Please show me", "I want", etc.).
- The final output must be a single, continuous string of text.
- Be creative and logical in your combinations. The elements should feel aesthetically coherent.
`;
export const generateMidjourneyPrompt = async (idea) => {
    const masterPrompt = `
You are an expert Midjourney prompt generation bot. Your sole purpose is to take a user's simple idea and transform it into a rich, detailed, and creative prompt in English for the Midjourney image generation service.

${MASTER_STRUCTURE_INSTRUCTIONS}

**Example 1:**
User Input: "a dragon on a mountain"
Your Output: cinematic photo of a majestic dragon perched atop a craggy peak, on a snowy mountain under a stormy sky, mysterious and dramatic mood, with glowing embers drifting from its mouth and fog swirling in the background, low-angle shot, dramatic lighting from a lightning strike, wide shot, captured with RED Komodo camera, in the style of Dark Souls visual tone.

**Example 2:**
User Input: "a futuristic ballerina"
Your Output: 3D render of a futuristic ballerina with holographic wings spinning on stage, inside a neon-drenched futuristic city, dreamy and magical, iridescent highlights on her metallic costume and bokeh background, eye-level shot, colorful LED lighting, full body shot, using a wide-angle lens, cyberpunk manga look.

Now, generate a prompt for the following user idea.

User Input: "${idea}"
Your Output:
    `;
    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: masterPrompt,
        });
        const text = response.text;
        if (!text) {
            throw new Error("Received an empty response from the API.");
        }
        return text.trim().replace(/(\r\n|\n|\r)/gm, "");
    }
    catch (error) {
        console.error("Error calling Gemini API:", error);
        throw new Error("Failed to communicate with the AI model.");
    }
};
export const refineMidjourneyPrompt = async (currentPrompt, refinementInstruction) => {
    const refinementPrompt = `
You are an expert Midjourney prompt editor. You have generated a prompt for a user, but they want to modify it.
Your task is to rewrite the prompt to incorporate the user's requested changes while STRICTLY maintaining the 10-part cinematic structure defined below.

${MASTER_STRUCTURE_INSTRUCTIONS}

**Current Prompt:**
"${currentPrompt}"

**User's Requested Modification/Refinement:**
"${refinementInstruction}"

**Instructions:**
1. Analyze the current prompt.
2. Apply the user's modification (e.g., change the weather, add an object, change the style).
3. Ensure the rest of the prompt remains high quality and coherent with the new changes.
4. Output ONLY the new, full prompt string.

**Your New Output:**
    `;
    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: refinementPrompt,
        });
        const text = response.text;
        if (!text) {
            throw new Error("Received an empty response from the API.");
        }
        return text.trim().replace(/(\r\n|\n|\r)/gm, "");
    }
    catch (error) {
        console.error("Error calling Gemini API (Refinement):", error);
        throw new Error("Failed to refine the prompt.");
    }
};

```

## Midjourney - Bot de estilos (33 sref)

Host: https://midjourney-estilos-vista-lateral-688843110097.us-west1.run.app

### services__geminiService.js

```javascript
import { GoogleGenAI } from "@google/genai";
const SYSTEM_INSTRUCTION = `You are RocoPrompts, an assistant that generates Midjourney prompts in English.
Your task is to combine a user's idea with a specific visual style and style weight.

Instructions:
1.  Take the user's idea and translate it to English if it's not already.
2.  Combine the idea with the provided English style description.
3.  Append the style's --sref code.
4.  Append the style weight parameter (--sw) at the very end.
5.  The final output must be a single, fluent line of text in English, ready to be copied into Midjourney.
6.  Do not add any extra text, explanations, labels, or quotation marks.

Example Input:
Idea: "un mapache tocando el piano"
Style Description: "nostalgic 90s compact camera aesthetic, warm tones, natural light, fine grain"
Style SREF: "3622211966"
Style Weight: "100"

Example Output:
a raccoon playing the piano, nostalgic 90s compact camera aesthetic, warm tones, natural light, fine grain --sref 3622211966 --sw 100`;
export async function generateMidjourneyPrompt(idea, style, styleWeight) {
    if (!process.env.API_KEY) {
        throw new Error("API_KEY environment variable not set");
    }
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const userPrompt = `Idea: "${idea}"\nStyle Description: "${style.description}"\nStyle SREF: "${style.sref}"\nStyle Weight: "${styleWeight}"`;
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: userPrompt,
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
            },
        });
        // Check if text exists directly on the response object (for simple text generation)
        if (response.text) {
            return response.text.trim();
        }
        // Fallback/Safety: Check candidates if strictly necessary, though response.text is the standard way now.
        // This handles cases where the model might return an empty response or block it.
        return '';
    }
    catch (error) {
        console.error("Error calling Gemini API:", error);
        throw new Error("Failed to generate prompt. Please check your API key and try again.");
    }
}

```

### constants.js

```javascript
export const STYLES = [
    // 📸 1. Fotografía y Estética Analógica
    {
        id: 'analog-casual',
        category: '📸 1. Fotografía y Estética Analógica',
        name: 'Fotografía Analógica Casual',
        sref: '3622211966',
        description: 'Estética nostálgica de cámara compacta de los 90, tonos cálidos, luz natural y grano fino.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763576093/Analogica_casual_qtict4.webp'
    },
    {
        id: 'retro-cinematic-blur',
        category: '📸 1. Fotografía y Estética Analógica',
        name: 'Retro Cinemático Borroso',
        sref: '3521709204',
        description: 'Paleta vintage, desenfoque de movimiento artístico y una cálida luz cinematográfica.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763576097/Retro_Cinematico_Borroso_nyxu6d.webp'
    },
    {
        id: 'modern-blue',
        category: '📸 1. Fotografía y Estética Analógica',
        name: 'Fotografía Azul Moderna',
        sref: '2150728072',
        description: 'Dominante de azul lavanda, luz limpia y una sensación de serenidad.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763576094/Fotografia_Azul_Moderna_l9syen.webp'
    },
    {
        id: 'classic-bw',
        category: '📸 1. Fotografía y Estética Analógica',
        name: 'Blanco y Negro Clásico',
        sref: '2950554102',
        description: 'Monocromático elegante con alto contraste y texturas definidas.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763576097/B_N_Clasico_kjrerf.webp'
    },
    {
        id: 'vintage-horror',
        category: '📸 1. Fotografía y Estética Analógica',
        name: 'Horror Cinematográfico Vintage',
        sref: '2465131771',
        description: 'Tonos oscuros y verdosos con una atmósfera de terror clásico.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763576095/Horror_cinematografico_vintage_r5ftwc.webp'
    },
    {
        id: 'fisheye-amateur',
        category: '📸 1. Fotografía y Estética Analógica',
        name: 'Toma Amateur con Fisheye',
        sref: '905403035',
        description: 'Lente ojo de pez, flash directo y una estética urbana y casera.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763576095/Toma_amateur_con_fisheye_n2crgr.webp'
    },
    {
        id: 'minimalism-bw',
        category: '📸 1. Fotografía y Estética Analógica',
        name: 'Minimalismo en Blanco y Negro',
        sref: '3724521495',
        description: 'Fuerte contraste, composición limpia y una calma elegante.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763576095/Minimalismo_en_blanco_y_negro_kbbjvx.webp'
    },
    // 🎨 2. Pintura y Arte Clásico
    {
        id: 'fauvism',
        category: '🎨 2. Pintura y Arte Clásico',
        name: 'Fauvismo',
        sref: '964722926',
        description: 'Colores intensos, pinceladas expresivas y una energía vibrante.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763576100/Fauvismo_ygb1sl.webp'
    },
    {
        id: 'oil-painting',
        category: '🎨 2. Pintura y Arte Clásico',
        name: 'Pintura al Óleo (Barroco / Rembrandt)',
        sref: '2939053262',
        description: 'Iluminación dramática, tonos cálidos y una textura clásica y rica.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763576102/Rembrant_alzyn0.webp'
    },
    {
        id: 'abstract-cubism',
        category: '🎨 2. Pintura y Arte Clásico',
        name: 'Cubismo Abstracto',
        sref: '1486347920',
        description: 'Geometrías fragmentadas y deconstruidas al estilo de Picasso.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763576098/Cubismo_abstracto_k3mgnz.webp'
    },
    {
        id: 'colorful-cubism',
        category: '🎨 2. Pintura y Arte Clásico',
        name: 'Cubismo Colorido',
        sref: '2424110041',
        description: 'Colores vivos, formas geométricas suaves y una composición dinámica.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763576098/Cubismo_colorido_dti04h.webp'
    },
    {
        id: 'dali-surrealism',
        category: '🎨 2. Pintura y Arte Clásico',
        name: 'Surrealismo (Dalí Style)',
        sref: '1142199271',
        description: 'Objetos flotantes, paisajes oníricos y una composición que desafía la lógica.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763599499/Surrealismo_Dali_style_dv68ft.webp'
    },
    // 🏛️ 3. Arquitectura y Diseño Técnico
    {
        id: 'futuristic-architecture',
        category: '🏛️ 3. Arquitectura y Diseño Técnico',
        name: 'Minimalismo Arquitectónico Futurista',
        sref: '3585060140',
        description: 'Espacios monocromáticos, líneas limpias y un diseño moderno y depurado.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763599499/Minimalista_Arquitectinici_Futurista_p1djnq.webp'
    },
    {
        id: 'blueprint',
        category: '🏛️ 3. Arquitectura y Diseño Técnico',
        name: 'Blueprint Técnico',
        sref: '835293620',
        description: 'Líneas de dibujo técnico blancas sobre un fondo azul intenso.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763576096/Blueprint_Tecnico_bwx3do.webp'
    },
    {
        id: 'isometric-architecture',
        category: '🏛️ 3. Arquitectura y Diseño Técnico',
        name: 'Isométrico Arquitectónico',
        sref: '3884842662',
        description: 'Vista arquitectónica axonométrica limpia, detallada y ordenada.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763576101/Isom_trico_Arquitect_nico_jyggoj.webp'
    },
    {
        id: 'futuristic-blue-mono',
        category: '🏛️ 3. Arquitectura y Diseño Técnico',
        name: 'Monocromo Azul Futurista',
        sref: '4127361315',
        description: 'Estética holográfica 3D con rejillas, mallas y un brillo digital.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763599499/monocromo_azul_futurista_iobnff.webp'
    },
    // 🕯️ 4. Fantasía y Estilos Oscuros
    {
        id: 'gothic-surrealism',
        category: '🕯️ 4. Fantasía y Estilos Oscuros',
        name: 'Surrealismo Gótico Monocromático',
        sref: '3728379869',
        description: 'Luz teatral, sombras profundas y una atmósfera misteriosa e inquietante.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763576106/Surrealismo_G_tico_Monocrom_tico_d2lepv.webp'
    },
    {
        id: 'baroque-gothic',
        category: '🕯️ 4. Fantasía y Estilos Oscuros',
        name: 'Gótico Barroco / Dark Fantasy',
        sref: '3762780486',
        description: 'Arquitectura lúgubre y una luz tenue al estilo de Guillermo Del Toro.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763576101/Go%CC%81tico_Barroco_Dark_Fantasy_u1bnvc.webp'
    },
    {
        id: '3d-surreal-fantasy',
        category: '🕯️ 4. Fantasía y Estilos Oscuros',
        name: '3D Fantasía Surrealista',
        sref: '3691229463',
        description: 'Miniaturas flotantes, detalles intrincados y una composición mágica.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763576096/3D_fantasia_surrealista_s5w5iz.webp'
    },
    {
        id: 'diorama',
        category: '🕯️ 4. Fantasía y Estilos Oscuros',
        name: 'Diorama Miniatura',
        sref: '3839362656',
        description: 'Escenas artesanales en miniatura al estilo de Wes Anderson.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763576094/Diorama_Miniatura_mrem3j.webp'
    },
    {
        id: 'cosmic-fantasy',
        category: '🕯️ 4. Fantasía y Estilos Oscuros',
        name: 'Fantasía Cósmica y Brillante',
        sref: '1225462680',
        description: 'Luz de estrellas, reflejos iridiscentes y una atmósfera mágica y etérea.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763576094/Fantasia_Cosmica_brillante_fmxhsl.webp'
    },
    // 🖍️ 5. Ilustración y Cultura Pop
    {
        id: '3d-playful-pastel',
        category: '🖍️ 5. Ilustración y Cultura Pop',
        name: '3D Pastel Juguetón',
        sref: '3392918032',
        description: 'Formas suaves, paleta de colores pastel y un adorable aspecto de juguete.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763576093/3D_Pastel_Juguet_n_hjwoaw.webp'
    },
    {
        id: 'art-nouveau',
        category: '🖍️ 5. Ilustración y Cultura Pop',
        name: 'Art Nouveau Ilustrativo',
        sref: '4006268797',
        description: 'Ornamentación floral, líneas orgánicas y una textura litográfica clásica.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763576104/Art_Nouveau_Ilustrativo_zwiupf.webp'
    },
    {
        id: 'kids-illustration',
        category: '🖍️ 5. Ilustración y Cultura Pop',
        name: 'Ilustración Infantil / Cartoon',
        sref: '848947587',
        description: 'Colores planos, formas simples y un estilo de dibujo amigable y claro.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763576095/ilustracion_infantil_cartoon_z4xozz.webp'
    },
    {
        id: 'retro-cartoon',
        category: '🖍️ 5. Ilustración y Cultura Pop',
        name: 'Cartoon Retro 80s/90s',
        sref: '2671164062',
        description: 'Nostalgia de dibujos animados de los 90, con colores y formas características de la época.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763576093/cartoon_retro_80s_90s_novsq2.webp'
    },
    {
        id: 'retro-collage',
        category: '🖍️ 5. Ilustración y Cultura Pop',
        name: 'Collage Retro / Pop Surrealista',
        sref: '1768709372',
        description: 'Fotomontaje vintage con colores intensos y una composición surrealista.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763576098/collegue_retro_90_hdpaxs.webp'
    },
    {
        id: 'soft-retro',
        category: '🖍️ 5. Ilustración y Cultura Pop',
        name: 'Ilustración Retro Suave',
        sref: '3309634448',
        description: 'Paleta de colores pastel suave de los 60 y una estética alegre y optimista.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763576101/Ilustracion_retro_suave_ee34yo.webp'
    },
    {
        id: 'clay-sculpture',
        category: '🖍️ 5. Ilustración y Cultura Pop',
        name: 'Escultura Ilustrada Infantil',
        sref: '3300005992',
        description: 'Textura rugosa y colores planos que asemejan a la arcilla o plastilina.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763576100/escultura_ilustrada_infantil_yq5hjs.webp'
    },
    // 💜 6. Futurismo y Look Digital
    {
        id: 'cyberpunk',
        category: '💜 6. Futurismo y Look Digital',
        name: 'Cyberpunk / Vaporwave / Neon Noir',
        sref: '1530736501',
        description: 'Luces de ciudad, brillos de neón y una atmósfera retro-futurista.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763576099/cyberpunk_vaporwave_neon_noir_rsyb8f.webp'
    },
    {
        id: 'retrowave',
        category: '💜 6. Futurismo y Look Digital',
        name: 'Retrowave / Analog VHS',
        sref: '1681026862',
        description: 'Glitch analógico y una estética que evoca las cintas VHS de los 80/90.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763576104/retrowave_analog_vhs_aquq3k.webp'
    },
    {
        id: 'dreamy-anime',
        category: '💜 6. Futurismo y Look Digital',
        name: 'Dreamy Anime / Light Academia',
        sref: '38531779',
        description: 'Cielos suaves, colores pastel y un tono cotidiano al estilo Ghibli.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763576094/dreamy_anime_fcrfhf.webp'
    },
    {
        id: 'pixel-art-anime',
        category: '💜 6. Futurismo y Look Digital',
        name: 'Pixel Art Anime Japonés',
        sref: '4289664488',
        description: 'Textura digital de pixel art y una atmósfera nostálgica de videojuego.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763576107/pixel_art_japones_iarwpw.webp'
    },
    {
        id: 'continuous-line',
        category: '💜 6. Futurismo y Look Digital',
        name: 'Dibujo de Línea Continua',
        sref: '1383597658',
        description: 'Un único trazo minimalista y elegante que define la forma.',
        imageUrl: 'https://res.cloudinary.com/dis56u04h/image/upload/v1763576099/Dibujo_de_linea_continua_jwmnbh.webp'
    }
];

```

## Sora 2

Host: https://generador-de-prompts-sora-2-688843110097.us-west1.run.app

### services__geminiService.js

```javascript
import { GoogleGenAI } from "@google/genai";
const SYSTEM_PROMPT = `
IDENTIDAD DEL MODELO

Eres un Creador Experto de Escenas Cinematográficas para SORA 2.
Tu tarea es transformar cualquier idea del usuario en una escena audiovisual de 10 o 15 segundos, según el valor que recibas en duration_seconds.

Tienes la capacidad de:
- escribir visual con hiperrealismo
- narrar como director de cine
- estructurar como guionista técnico
- describir cámara, luz, atmósferas y emociones
- crear timestamps impecables para IA de video

**AJUSTE DE ESTILO OBLIGATORIO Y TÉCNICO**
- **Estilo General:** Usa un estilo técnico, conciso y cinematográfico. Escribe como si fueran instrucciones directas para un director de cine, no como una novela.
- **Tono:** Visual y táctil, no narrativo. Prioriza acciones claras, movimientos de cámara, luz, sonido, texturas y movimiento físico.
- **Frases:** Utiliza frases cortas y directas, siempre enfocadas en lo que la IA de video debe mostrar visualmente.
- **Qué Evitar:**
    - Descripciones poéticas, metáforas largas o lenguaje dramático/romántico.
    - Palabras que describan emociones complejas o internas como “determinación”, “angustia profunda”, “una mezcla de…”. Describe la emoción a través de la acción física.
- **Contenido OBLIGATORIO en 'Secuencia por segundos':** Cada bloque de tiempo debe incluir: Acción principal, Movimiento de cámara, Atmósfera/emoción (simple, directa), y SFX con onomatopeyas entre asteriscos (\`*boom grave*\`).

Siempre entregas UNA SOLA escena, sin variantes.
Nunca explicas tu proceso.
Tu respuesta final siempre va dentro de un solo bloque de código con triple backtick \`\`\`, sin texto antes ni después.

1. CÓMO RECIBES LA INFORMACIÓN

Siempre recibirás un input estructurado (no lo muestres al usuario, solo úsalo internamente) con estos campos:

mode: "NEW_SCENE" o "ITERATE_SCENE".
video_type: uno de estos valores exactos (en español): "Trailer cinematográfico", "Comercial de producto", "Video de celular sin cortes", "GoPro POV", "Cámara de seguridad", "Tomas aéreas de drone", "ASMR", "Vlog Selfie", "Unboxing de producto", "Story Vertical", "Video Old VHS"
duration_seconds: 10 o 15.
user_idea: texto libre con la idea del usuario.
previous_prompt: Vacío cuando mode = "NEW_SCENE". Contiene el prompt completo anterior cuando mode = "ITERATE_SCENE".
next_scene_idea: Vacío cuando mode = "NEW_SCENE". Contiene lo nuevo que el usuario quiere que pase cuando mode = "ITERATE_SCENE".

Tu misión:
Si mode = "NEW_SCENE" → crear un prompt completo desde cero.
Si mode = "ITERATE_SCENE" → generar una nueva escena que:
Mantenga misma ubicación, mismos personajes, misma estética, mismo tipo de cámara, misma iluminación y mismo tono del previous_prompt.
Incorpore lo que el usuario pidió en next_scene_idea.
Siga exactamente la misma estructura y estilo del prompt original.

2. INTERPRETAR EL video_type

Usa siempre el campo video_type como guía estética principal:
Trailer cinematográfico → look épico, gran escala, cámara de cine, movimientos fluidos, dramatismo.
Comercial de producto → el producto es protagonista, macros, fondos limpios, luz de estudio, textura del objeto.
Video de celular sin cortes → sensación de plano secuencia, cámara en mano, look casual, imperfecciones realistas.
GoPro POV → FOV amplio, cámara en acción, montaje subjetivo, velocidad y energía.
Cámara de seguridad → ángulo fijo, ligera distorsión/ruido, estética de CCTV.
Tomas aéreas de drone → planos generales, travellings suaves, alturas, paisajes.
ASMR → macro de manos, texturas, sonido protagonista, movimientos lentos.
Vlog Selfie → cámara frontal, movimientos naturales de brazo, respiración, microgestos faciales.
Unboxing de producto → manos, mesa, producto, enfoque en apertura y detalles.
Story Vertical → ritmo ágil, 9:16, acciones claras, pensadas para redes.
Video Old VHS → textura de cinta, glitches, colores lavados, ruido analógico.
Siempre adapta la narrativa y la cámara al video_type, mezclándolo con la idea del usuario.

3. DURACIÓN Y MARCAS DE TIEMPO

Debes respetar SIEMPRE la duración especificada en duration_seconds. La sección de secuencia debe tener el siguiente formato exacto:
Encabezado: \`🕒 Secuencia por segundos (duración: [10/15]s)\`
Luego, los bloques de tiempo correspondientes:
- Si duration_seconds = 10 → usa 3 bloques: \`0–3s:\`, \`3–7s:\`, \`7–10s:\`
- Si duration_seconds = 15 → usa 3 bloques: \`0–4s:\`, \`4–10s:\`, \`10–15s:\`

En cada bloque de tiempo, describe lo que pasa siguiendo las reglas de estilo técnico. No uses encabezados como hook/build/climax.

4. ESTRUCTURA OBLIGATORIA DEL RESULTADO

Siempre responde en este orden y dentro de un único bloque de código \`\`\`:
1. Descripción de la escena -> Inicia SIEMPRE con el "video_type" exacto que recibiste, seguido de dos puntos y la descripción. Ejemplo: "Trailer cinematográfico: Un astronauta solitario...".
2. Look del video
3. Dirección de cámara
4. Luz
5. Ritmo
6. Secuencia por segundos (Con el formato exacto del punto 3)
7. Sonido y voz

5. MODO ESCENA NUEVA (mode = "NEW_SCENE")

Cuando mode = "NEW_SCENE":
Lee video_type, duration_seconds y user_idea. Interpreta la idea del usuario y decide: escenario, personajes o elementos, tono emocional, atmósfera, tipo de cámara y luz, todo coherente con el video_type. Construye un prompt completo siguiendo exactamente la estructura del punto 4.

6. MODO ITERAR (mode = "ITERATE_SCENE")

Cuando mode = "ITERATE_SCENE":
Lee el previous_prompt. Extrae mentalmente: ubicación, personajes, estética, cámara, luz, tono y ritmo. Lee next_scene_idea. Genera un nuevo prompt completo que mantenga la coherencia con el previous_prompt e incorpore lo pedido en next_scene_idea.

7. PERSONALIZACIÓN CUANDO APARECE @rocodelaportilla12

Cuando el usuario mencione explícitamente a @rocodelaportilla12: Tono mexicano natural, rostro claro, movimientos de cámara selfie realistas (si el video es tipo Vlog / Story / Celular), ropa negra elegante, chamarra puff negra o gorro según el contexto, gestos humanos naturales y presencia cinematográfica. REGLA DE AISLAMIENTO: La mención "@rocodelaportilla12" siempre debe estar aislada por espacios. Nunca debe tener ningún otro carácter pegado, ni antes ni después. Correcto: "( @rocodelaportilla12 ) sonríe". Incorrecto: "(@rocodelaportilla12) sonríe" o "@rocodelaportilla12, sonríe".

8. RESTRICCIONES FINALES

Nunca das variantes. Nunca explicas tu proceso. Nunca sales del rol cinematográfico. Siempre respondes con un solo bloque de código \`\`\` que contiene todo.
`;
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
export const generateScenePrompt = async (request) => {
    const userRequestPrompt = `
Basado en todas las instrucciones anteriores, procesa la siguiente solicitud y genera un prompt para SORA 2:

${JSON.stringify(request, null, 2)}
`;
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: `${SYSTEM_PROMPT}\n\n${userRequestPrompt}`,
        });
        let text = response.text;
        // Clean up the response, removing the backticks and any extra text
        if (text.startsWith("```") && text.endsWith("```")) {
            text = text.substring(3, text.length - 3).trim();
        }
        else {
            // Fallback for cases where it might add markdown specifier like "markdown"
            const startIndex = text.indexOf('\n');
            if (text.startsWith("```") && startIndex !== -1) {
                text = text.substring(startIndex + 1, text.length - 3).trim();
            }
        }
        return text;
    }
    catch (error) {
        console.error("Error generating scene prompt:", error);
        throw new Error("No se pudo generar el prompt. Por favor, inténtalo de nuevo.");
    }
};

```
