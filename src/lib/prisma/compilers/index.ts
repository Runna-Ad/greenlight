/** Un solo punto de entrada: spec + herramienta → prompt listo para pegar. */
import type { PromptSpec, Tool } from "../spec.ts";
import type { Salida } from "./salida.ts";
import { compilarNanoBanana } from "./nanobanana.ts";
import { compilarVeo } from "./veo.ts";
import { compilarKling } from "./kling.ts";
import { compilarSora } from "./sora.ts";
import { compilarHiggsfield } from "./higgsfield.ts";

export type { Salida } from "./salida.ts";

const COMPILERS: Record<Tool, (spec: PromptSpec) => Salida> = {
  nanobanana: compilarNanoBanana,
  veo: compilarVeo,
  kling: compilarKling,
  sora: compilarSora,
  higgsfield: compilarHiggsfield,
};

export function compilar(spec: PromptSpec, tool: Tool = spec.tool): Salida {
  return COMPILERS[tool]({ ...spec, tool });
}
