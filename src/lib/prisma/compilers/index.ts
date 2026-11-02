/** Un solo punto de entrada: spec + herramienta → prompt listo para pegar. */
import type { PromptSpec, Tool } from "../spec.ts";
import type { Catalogo, Limites } from "../catalogo.ts";
import type { Salida } from "./salida.ts";
import { compilarNanoBanana } from "./nanobanana.ts";
import { compilarChatGPT } from "./chatgpt.ts";
import { compilarVeo } from "./veo.ts";
import { compilarKling } from "./kling.ts";
import { compilarHiggsfield } from "./higgsfield.ts";
import { compilarSeedream } from "./seedream.ts";
import { compilarSeedance } from "./seedance.ts";
import { compilarOmni } from "./omni.ts";

export type { Salida } from "./salida.ts";

const COMPILERS: Record<Tool, (spec: PromptSpec, lim?: Limites) => Salida> = {
  nanobanana: compilarNanoBanana,
  chatgpt: compilarChatGPT,
  veo: compilarVeo,
  kling: compilarKling,
  higgsfield: compilarHiggsfield,
  seedream: compilarSeedream,
  seedance: compilarSeedance,
  gemini_omni: compilarOmni,
};

/** F6a: `cat` = el catálogo vigente (Hub › Herramientas). Sin él, los límites de las constantes.
 *  Quien compila con un catálogo VALIDA con el mismo (validar(…, cat)): si no, el compiler corta a
 *  un tope y el validador exige otro. */
export function compilar(spec: PromptSpec, tool: Tool = spec.tool, cat?: Catalogo): Salida {
  return COMPILERS[tool]({ ...spec, tool }, cat?.[tool].limites);
}
