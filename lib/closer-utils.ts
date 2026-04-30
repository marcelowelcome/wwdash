// Detecção de "reunião com Closer realizada".
//
// Coluna legada `reuniao_closer` não é populada pelo sync atual do AC
// (sem entrada em FIELD_MAP). Os campos vivos são:
//   - ww_como_foi_feita_reuni_o_closer (id 299)
//   - tipo_da_reuni_o_com_a_closer     (id 19)
//
// `mapRowToWonDeal` em supabase-api.ts:148 já consolida ambos no campo
// derivado `tipo_reuniao_closer = ww_como_foi_feita_reuni_o_closer
// || tipo_da_reuni_o_com_a_closer`. Esta utility usa esse derivado
// (com fallback ao legado para máxima compatibilidade) e exclui o
// rótulo "Não teve reunião".
//
// Fonte de verdade: lib/board/funnel-ww.ts (Board endpoint v1).

import type { WonDeal } from "./schemas";

const NOT_HELD = ["Não teve reunião"] as const;

export function realizouCloser(d: WonDeal): boolean {
    const raw =
        (d.tipo_reuniao_closer ?? "") ||
        (d.reuniao_closer ?? "");
    const v = raw.trim();
    if (v === "") return false;
    if ((NOT_HELD as readonly string[]).includes(v)) return false;
    return true;
}
