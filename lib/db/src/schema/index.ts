import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const appSchema = pgSchema("app");
export const analyticsSchema = pgSchema("analytics");

// ---------------------------------------------------------------------------
// app.postos — cadastro de postos (espelho simplificado do registro ANP)
// ---------------------------------------------------------------------------
export const postos = appSchema.table(
  "postos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cnpj: text("cnpj").notNull(),
    razaoSocial: text("razao_social").notNull(),
    nomeFantasia: text("nome_fantasia").notNull(),
    bandeira: text("bandeira").notNull(),
    codigoInstalacaoAnp: text("codigo_instalacao_anp"),
    tipoPosto: text("tipo_posto"),
    distribuidora: text("distribuidora"),
    inicioDistribuidora: date("inicio_distribuidora", { mode: "string" }),
    situacao: text("situacao"),
    endereco: text("endereco").notNull(),
    complemento: text("complemento"),
    bairro: text("bairro"),
    cep: text("cep"),
    municipio: text("municipio").notNull(),
    uf: text("uf").notNull().default("SP"),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    tempoAutorizacaoAnos: integer("tempo_autorizacao_anos"),
    statusRecebimento: text("status_recebimento"),
    notaAnpColetada: integer("nota_anp"),
    notaAnpCalculada: integer("nota_calculada"),
    sincronizadoEm: timestamp("sincronizado_em", { withTimezone: true }),
    // Critérios brutos usados no cálculo do selo
    situacaoAnp: text("situacao_anp").notNull().default("Ativa"),
    dataAutorizacaoAnp: text("data_autorizacao_anp"),
    autuacoes24m: integer("autuacoes_24m").notNull().default(0),
    qualidadeConforme: boolean("qualidade_conforme").notNull().default(true),
    qualidadeVerificadaEm: text("qualidade_verificada_em"),
    bandeiraConsistente: boolean("bandeira_consistente").notNull().default(true),
    // Derivados (recalculados a cada importação/seed)
    tier: text("tier").notNull().default("sem_verificacao"),
    score: integer("score").notNull().default(0),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("postos_cnpj_idx").on(t.cnpj),
    uniqueIndex("postos_codigo_instalacao_idx").on(t.codigoInstalacaoAnp),
    index("postos_municipio_idx").on(t.municipio),
    index("postos_tier_idx").on(t.tier),
  ],
);

// ---------------------------------------------------------------------------
// Dados detalhados do registro ANP. Todos os históricos apontam para o
// identificador interno do posto; as chaves externas da ANP ficam no cadastro.
// ---------------------------------------------------------------------------
export const autorizacoes = appSchema.table(
  "autorizacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postoId: uuid("posto_id")
      .notNull()
      .references(() => postos.id, { onDelete: "cascade" }),
    numeroAutorizacao: text("numero_autorizacao"),
    portariaResolucao: text("portaria_resolucao"),
    numeroDespacho: text("numero_despacho"),
    numeroProcesso: text("numero_processo"),
    dataEnvioDou: date("data_envio_dou", { mode: "string" }),
    dataPublicacaoDou: date("data_publicacao_dou", { mode: "string" }),
  },
  (t) => [index("autorizacoes_posto_idx").on(t.postoId)],
);

export const produtosPosto = appSchema.table(
  "produtos_posto",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postoId: uuid("posto_id")
      .notNull()
      .references(() => postos.id, { onDelete: "cascade" }),
    produto: text("produto").notNull(),
    bicosAbastecimento: integer("bicos_abastecimento"),
    volumeTancagemM3: integer("volume_tancagem_m3"),
  },
  (t) => [index("produtos_posto_posto_idx").on(t.postoId)],
);

export const fiscalizacoes = appSchema.table(
  "fiscalizacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postoId: uuid("posto_id")
      .notNull()
      .references(() => postos.id, { onDelete: "cascade" }),
    numeroDf: text("numero_df"),
    dataFiscalizacao: date("data_fiscalizacao", { mode: "string" }).notNull(),
    tipoConvenio: text("tipo_convenio"),
    fiscalizacaoDeCampo: text("fiscalizacao_de_campo"),
  },
  (t) => [
    index("fiscalizacoes_posto_idx").on(t.postoId),
    index("fiscalizacoes_data_idx").on(t.dataFiscalizacao),
  ],
);

export const irregularidades = appSchema.table(
  "irregularidades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postoId: uuid("posto_id")
      .notNull()
      .references(() => postos.id, { onDelete: "cascade" }),
    numeroDf: text("numero_df"),
    dataFiscalizacao: date("data_fiscalizacao", { mode: "string" }).notNull(),
    classificacao: text("classificacao").notNull(),
    descricao: text("descricao"),
    componenteDf: text("componente_df"),
  },
  (t) => [
    index("irregularidades_posto_idx").on(t.postoId),
    index("irregularidades_data_idx").on(t.dataFiscalizacao),
  ],
);

export const amostrasPmqc = appSchema.table(
  "amostras_pmqc",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postoId: uuid("posto_id")
      .notNull()
      .references(() => postos.id, { onDelete: "cascade" }),
    dataColeta: date("data_coleta", { mode: "string" }).notNull(),
    produto: text("produto").notNull(),
    conforme: boolean("conforme").notNull(),
  },
  (t) => [
    index("amostras_pmqc_posto_idx").on(t.postoId),
    index("amostras_pmqc_data_idx").on(t.dataColeta),
  ],
);

export const ensaiosNaoConformes = appSchema.table(
  "ensaios_nao_conformes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postoId: uuid("posto_id")
      .notNull()
      .references(() => postos.id, { onDelete: "cascade" }),
    dataColeta: date("data_coleta", { mode: "string" }).notNull(),
    produto: text("produto").notNull(),
    nomeEnsaio: text("nome_ensaio").notNull(),
    resultado: text("resultado"),
  },
  (t) => [
    index("ensaios_nao_conformes_posto_idx").on(t.postoId),
    index("ensaios_nao_conformes_data_idx").on(t.dataColeta),
  ],
);

export const origemCombustivel = appSchema.table(
  "origem_combustivel",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postoId: uuid("posto_id")
      .notNull()
      .references(() => postos.id, { onDelete: "cascade" }),
    distribuidoraPosto: text("distribuidora_posto"),
    distribuidoraOrigem: text("distribuidora_origem").notNull(),
    volumePct: doublePrecision("volume_pct").notNull(),
  },
  (t) => [index("origem_combustivel_posto_idx").on(t.postoId)],
);

export const anpRawSnapshots = appSchema.table(
  "anp_raw_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postoId: uuid("posto_id").references(() => postos.id, { onDelete: "cascade" }),
    pagina: text("pagina").notNull(),
    urlSemSessao: text("url_sem_sessao"),
    conteudo: jsonb("conteudo").notNull(),
    coletadoEm: timestamp("coletado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("anp_raw_snapshots_posto_idx").on(t.postoId),
    index("anp_raw_snapshots_coletado_idx").on(t.coletadoEm),
  ],
);

// ---------------------------------------------------------------------------
// app.classificacoes — histórico/snapshot dos critérios de cada classificação
// ---------------------------------------------------------------------------
export const classificacoes = appSchema.table(
  "classificacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postoId: uuid("posto_id")
      .notNull()
      .references(() => postos.id, { onDelete: "cascade" }),
    tier: text("tier").notNull(),
    score: integer("score").notNull(),
    criterios: jsonb("criterios").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("classificacoes_posto_idx").on(t.postoId)],
);

// ---------------------------------------------------------------------------
// app.usuarios — conta leve criada via OTP simulado
// ---------------------------------------------------------------------------
export const usuarios = appSchema.table(
  "usuarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contato: text("contato").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("usuarios_contato_idx").on(t.contato)],
);

// ---------------------------------------------------------------------------
// app.carteiras — saldo de pontos por usuário
// ---------------------------------------------------------------------------
export const carteiras = appSchema.table("carteiras", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => usuarios.id, { onDelete: "cascade" }),
  saldoPontos: integer("saldo_pontos").notNull().default(0),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// app.transacoes_pontos — extrato (crédito/débito)
// ---------------------------------------------------------------------------
export const transacoesPontos = appSchema.table(
  "transacoes_pontos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(), // credito | debito
    pontos: integer("pontos").notNull(), // sempre positivo; direção via tipo
    descricao: text("descricao").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("transacoes_user_idx").on(t.userId, t.criadoEm)],
);

// ---------------------------------------------------------------------------
// app.checkins — check-ins de motoristas em postos com selo
// ---------------------------------------------------------------------------
export const checkins = appSchema.table(
  "checkins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    postoId: uuid("posto_id")
      .notNull()
      .references(() => postos.id, { onDelete: "cascade" }),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    distanciaM: integer("distancia_m").notNull().default(0),
    pontos: integer("pontos").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("checkins_user_posto_idx").on(t.userId, t.postoId, t.criadoEm)],
);

// ---------------------------------------------------------------------------
// app.recompensas — catálogo de benefícios
// ---------------------------------------------------------------------------
export const recompensas = appSchema.table("recompensas", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  descricao: text("descricao").notNull(),
  categoria: text("categoria").notNull(),
  custoPontos: integer("custo_pontos").notNull(),
  ativa: boolean("ativa").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// app.resgates — cupons resgatados (código exibido em QR)
// ---------------------------------------------------------------------------
export const resgates = appSchema.table(
  "resgates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    recompensaId: uuid("recompensa_id")
      .notNull()
      .references(() => recompensas.id, { onDelete: "cascade" }),
    codigo: text("codigo").notNull(),
    status: text("status").notNull().default("ativo"), // ativo | utilizado
    custoPontos: integer("custo_pontos").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("resgates_codigo_idx").on(t.codigo), index("resgates_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// app.denuncias — denúncias anônimas (foto apenas como nome de arquivo)
// ---------------------------------------------------------------------------
export const denuncias = appSchema.table(
  "denuncias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    protocolo: text("protocolo").notNull(),
    categoria: text("categoria").notNull(),
    postoId: uuid("posto_id").references(() => postos.id, { onDelete: "set null" }),
    municipio: text("municipio"),
    descricao: text("descricao").notNull(),
    fotoNome: text("foto_nome"),
    status: text("status").notNull().default("recebida"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("denuncias_protocolo_idx").on(t.protocolo)],
);

// ---------------------------------------------------------------------------
// app.rotas_cache — cache de rotas OSRM
// ---------------------------------------------------------------------------
export const rotasCache = appSchema.table(
  "rotas_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chave: text("chave").notNull(),
    polyline: jsonb("polyline").notNull(), // [[lat,lng], ...]
    distanciaKm: doublePrecision("distancia_km").notNull(),
    duracaoMin: doublePrecision("duracao_min").notNull(),
    fonte: text("fonte").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("rotas_cache_chave_idx").on(t.chave)],
);

// ---------------------------------------------------------------------------
// analytics.eventos — telemetria agregável SEM PII (geohash5 + hash de sessão)
// ---------------------------------------------------------------------------
export const eventos = analyticsSchema.table(
  "eventos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventType: text("event_type").notNull(),
    descricao: text("descricao").notNull(),
    postoId: uuid("posto_id"),
    municipio: text("municipio"),
    redeAssociada: boolean("rede_associada").notNull().default(false),
    geohash5: text("geohash5"),
    sessionHash: text("session_hash"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("eventos_criado_idx").on(t.criadoEm), index("eventos_tipo_idx").on(t.eventType)],
);

export type Posto = typeof postos.$inferSelect;
export type NovoPosto = typeof postos.$inferInsert;
export type Autorizacao = typeof autorizacoes.$inferSelect;
export type ProdutoPosto = typeof produtosPosto.$inferSelect;
export type Fiscalizacao = typeof fiscalizacoes.$inferSelect;
export type Irregularidade = typeof irregularidades.$inferSelect;
export type AmostraPmqc = typeof amostrasPmqc.$inferSelect;
export type EnsaioNaoConforme = typeof ensaiosNaoConformes.$inferSelect;
export type OrigemCombustivel = typeof origemCombustivel.$inferSelect;
export type AnpRawSnapshot = typeof anpRawSnapshots.$inferSelect;
export type Classificacao = typeof classificacoes.$inferSelect;
export type Usuario = typeof usuarios.$inferSelect;
export type Carteira = typeof carteiras.$inferSelect;
export type TransacaoPontos = typeof transacoesPontos.$inferSelect;
export type Checkin = typeof checkins.$inferSelect;
export type Recompensa = typeof recompensas.$inferSelect;
export type Resgate = typeof resgates.$inferSelect;
export type Denuncia = typeof denuncias.$inferSelect;
export type RotaCache = typeof rotasCache.$inferSelect;
export type Evento = typeof eventos.$inferSelect;
