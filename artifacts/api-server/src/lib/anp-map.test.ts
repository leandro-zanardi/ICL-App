import assert from "node:assert/strict";
import test from "node:test";
import { extrairPinosAnp } from "./anp-map.ts";

test("extrai pinos do payload GeoJSON do mapa oficial da ANP", () => {
  const pinos = extrairPinosAnp({
    map: {
      series: [
        {
          features: [
            {
              geometry: { type: "Point", coordinates: [-47.06373833, -22.91313667] },
              link: "#action$a-dialog-open?url=map-info",
              columns: {
                CNPJ: "59.692.921/0001-05",
                RAZAO_SOCIAL: "POSTO JOAO JORGE LTDA",
                DISTRIBUIDORA: "VIBRA ENERGIA S.A",
                ENDERECO: "AVENIDA JOAO JORGE,330 , VILA INDUSTRIAL",
                NOTA: "0",
              },
            },
          ],
        },
      ],
    },
  });

  assert.deepEqual(pinos, [
    {
      cnpj: "59692921000105",
      lat: -22.91313667,
      lng: -47.06373833,
      linkOficial: "#action$a-dialog-open?url=map-info",
      razaoSocial: "POSTO JOAO JORGE LTDA",
      bandeira: "VIBRA ENERGIA S.A",
      endereco: "AVENIDA JOAO JORGE,330 , VILA INDUSTRIAL",
      notaAnp: 0,
    },
  ]);
});