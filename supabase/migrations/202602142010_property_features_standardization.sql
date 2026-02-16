begin;

do $$
begin
  if to_regclass('public.property_features') is null then
    raise exception 'Tabela public.property_features nao encontrada.';
  end if;

  if to_regclass('public.property_feature_values') is null then
    raise exception 'Tabela public.property_feature_values nao encontrada.';
  end if;
end
$$;

create temporary table _property_feature_defs (
  key text primary key,
  label_pt text not null,
  group_name text not null,
  position integer not null
) on commit drop;

insert into _property_feature_defs (key, label_pt, group_name, position) values
  ('localizacao_privilegiada', 'Localizacao privilegiada', 'Localizacao e Entorno', 1),
  ('sol_da_manha', 'Sol da manha', 'Localizacao e Entorno', 2),
  ('vista_definitiva', 'Vista definitiva', 'Localizacao e Entorno', 3),
  ('proximo_ao_metro_transporte_publico', 'Proximo ao metro/transporte publico', 'Localizacao e Entorno', 4),
  ('rua_tranquila_silenciosa', 'Rua tranquila/silenciosa', 'Localizacao e Entorno', 5),
  ('proximidade_de_escolas_renomadas', 'Proximidade de escolas renomadas', 'Localizacao e Entorno', 6),
  ('proximo_a_supermercados_e_farmacias', 'Proximo a supermercados e farmacias', 'Localizacao e Entorno', 7),
  ('proximidade_de_parques_areas_verdes', 'Proximidade de parques/areas verdes', 'Localizacao e Entorno', 8),
  ('bairro_seguro_com_patrulhamento', 'Bairro seguro/com patrulhamento', 'Localizacao e Entorno', 9),
  ('acesso_facil_a_vias_rapidas', 'Acesso facil a vias rapidas', 'Localizacao e Entorno', 10),
  ('proximidade_de_centros_empresariais', 'Proximidade de centros empresariais', 'Localizacao e Entorno', 11),
  ('bairro_planejado', 'Bairro planejado', 'Localizacao e Entorno', 12),
  ('proximo_a_academias_e_centros_esportivos', 'Proximo a academias e centros esportivos', 'Localizacao e Entorno', 13),
  ('proximo_a_restaurantes_e_vida_noturna', 'Proximo a restaurantes e vida noturna', 'Localizacao e Entorno', 14),
  ('rua_arborizada', 'Rua arborizada', 'Localizacao e Entorno', 15),
  ('vista_para_mar_lago_montanha', 'Vista para o mar/lago/montanha', 'Localizacao e Entorno', 16),
  ('regiao_com_alta_demanda_de_locacao', 'Regiao com alta demanda de locacao', 'Localizacao e Entorno', 17),
  ('proximo_a_shoppings', 'Proximo a shoppings', 'Localizacao e Entorno', 18),

  ('planta_inteligente_bem_distribuida', 'Planta inteligente/bem distribuida', 'Estrutura e Layout', 19),
  ('comodos_amplos', 'Comodos amplos', 'Estrutura e Layout', 20),
  ('conceito_aberto_sala_cozinha_integradas', 'Conceito aberto (sala e cozinha integradas)', 'Estrutura e Layout', 21),
  ('pe_direito_alto', 'Pe-direito alto', 'Estrutura e Layout', 22),
  ('ventilacao_cruzada', 'Ventilacao cruzada', 'Estrutura e Layout', 23),
  ('alta_incidencia_de_luz_natural', 'Alta incidencia de luz natural', 'Estrutura e Layout', 24),
  ('isolamento_acustico', 'Isolamento acustico', 'Estrutura e Layout', 25),
  ('suite_master', 'Suite master', 'Estrutura e Layout', 26),
  ('closet_no_quarto_principal', 'Closet no quarto principal', 'Estrutura e Layout', 27),
  ('lavabo', 'Lavabo', 'Estrutura e Layout', 28),
  ('home_office_escritorio', 'Home office/escritorio', 'Estrutura e Layout', 29),
  ('varanda_gourmet', 'Varanda gourmet', 'Estrutura e Layout', 30),
  ('sacada_envidracada', 'Sacada envidracada', 'Estrutura e Layout', 31),
  ('despensa', 'Despensa', 'Estrutura e Layout', 32),
  ('area_de_servico_separada', 'Area de servico separada', 'Estrutura e Layout', 33),
  ('dependencia_de_empregada_quarto_banheiro', 'Dependencia de empregada (quarto/banheiro)', 'Estrutura e Layout', 34),
  ('lavanderia_espacosa', 'Lavanderia espacosa', 'Estrutura e Layout', 35),
  ('piso_de_madeira_nobre_taco', 'Piso de madeira nobre/taco', 'Estrutura e Layout', 36),
  ('piso_vinilico_laminado', 'Piso vinilico/laminado (facil manutencao)', 'Estrutura e Layout', 37),
  ('porcelanato_de_grandes_formatos', 'Porcelanato de grandes formatos', 'Estrutura e Layout', 38),
  ('rodapes_altos', 'Rodapes altos', 'Estrutura e Layout', 39),
  ('teto_rebaixado_em_gesso', 'Teto rebaixado em gesso', 'Estrutura e Layout', 40),
  ('iluminacao_embutida_spots', 'Iluminacao embutida/spots', 'Estrutura e Layout', 41),
  ('janelas_amplas_do_chao_ao_teto', 'Janelas amplas/do chao ao teto', 'Estrutura e Layout', 42),
  ('persianas_integradas_automatizadas', 'Persianas integradas/automatizadas', 'Estrutura e Layout', 43),
  ('portas_laqueadas_brancas', 'Portas laqueadas/brancas', 'Estrutura e Layout', 44),
  ('ar_condicionado_ou_infra_pronta', 'Ar-condicionado/infraestrutura pronta', 'Estrutura e Layout', 45),
  ('aquecimento_a_gas_ou_solar', 'Aquecimento a gas/solar', 'Estrutura e Layout', 46),
  ('marcenaria_planejada_de_alta_qualidade', 'Marcenaria planejada de alta qualidade', 'Estrutura e Layout', 47),

  ('bancada_em_granito_quartzo_marmore', 'Bancada em granito/quartzo/marmore', 'Cozinha e Banheiros', 48),
  ('torneira_gourmet_monocomando', 'Torneira gourmet/monocomando', 'Cozinha e Banheiros', 49),
  ('cooktop_e_forno_embutidos', 'Cooktop e forno embutidos', 'Cozinha e Banheiros', 50),
  ('cuba_gourmet_dupla', 'Cuba gourmet/dupla', 'Cozinha e Banheiros', 51),
  ('armarios_planejados', 'Armarios planejados', 'Cozinha e Banheiros', 52),
  ('revestimento_estilo_metro_ou_decorado', 'Revestimento estilo metro ou porcelanato decorado', 'Cozinha e Banheiros', 53),
  ('banheiro_com_nicho_na_parede', 'Banheiro com nicho na parede', 'Cozinha e Banheiros', 54),
  ('box_blindex_vidro_temperado', 'Box Blindex/vidro temperado', 'Cozinha e Banheiros', 55),
  ('chuveiro_com_aquecimento_central', 'Chuveiro com aquecimento central', 'Cozinha e Banheiros', 56),
  ('metais_de_alto_padrao', 'Metais de alto padrao', 'Cozinha e Banheiros', 57),
  ('espelhos_amplos_com_led', 'Espelhos amplos/com LED', 'Cozinha e Banheiros', 58),
  ('cuba_esculpida_em_pedra', 'Cuba esculpida em pedra', 'Cozinha e Banheiros', 59),
  ('ventilacao_natural_no_banheiro', 'Ventilacao natural no banheiro', 'Cozinha e Banheiros', 60),

  ('piscina', 'Piscina', 'Area Externa e Lazer Privativo', 61),
  ('area_de_churrasqueira_privativa', 'Area de churrasqueira privativa', 'Area Externa e Lazer Privativo', 62),
  ('jardim_paisagistico', 'Jardim paisagistico', 'Area Externa e Lazer Privativo', 63),
  ('quintal_espacoso', 'Quintal espacoso', 'Area Externa e Lazer Privativo', 64),
  ('deck_de_madeira', 'Deck de madeira', 'Area Externa e Lazer Privativo', 65),
  ('espaco_fogueira_fire_pit', 'Espaco fogueira (fire pit)', 'Area Externa e Lazer Privativo', 66),
  ('pomar_horta', 'Pomar/horta', 'Area Externa e Lazer Privativo', 67),
  ('espaco_gourmet_externo', 'Espaco gourmet externo', 'Area Externa e Lazer Privativo', 68),
  ('jacuzzi_hidromassagem_externa', 'Jacuzzi/hidromassagem externa', 'Area Externa e Lazer Privativo', 69),
  ('cerca_viva_privacidade', 'Cerca viva/privacidade', 'Area Externa e Lazer Privativo', 70),
  ('varanda_terrea', 'Varanda terrea', 'Area Externa e Lazer Privativo', 71),
  ('piso_antiderrapante_na_area_da_piscina', 'Piso antiderrapante na area da piscina', 'Area Externa e Lazer Privativo', 72),

  ('portaria_24h_monitoramento', 'Portaria 24h/monitoramento', 'Seguranca e Tecnologia', 73),
  ('fechadura_eletronica_biometria', 'Fechadura eletronica/biometria', 'Seguranca e Tecnologia', 74),
  ('cameras_de_seguranca_internas_externas', 'Cameras de seguranca internas/externas', 'Seguranca e Tecnologia', 75),
  ('sistema_de_alarme', 'Sistema de alarme', 'Seguranca e Tecnologia', 76),
  ('portao_eletronico', 'Portao eletronico', 'Seguranca e Tecnologia', 77),
  ('cerca_eletrica_concertina', 'Cerca eletrica/concertina', 'Seguranca e Tecnologia', 78),
  ('interfone_video_porteiro', 'Interfone/video porteiro', 'Seguranca e Tecnologia', 79),
  ('automacao_residencial_luzes_cortinas', 'Automacao residencial (luzes/cortinas)', 'Seguranca e Tecnologia', 80),
  ('internet_fibra_optica_disponivel', 'Internet fibra optica disponivel', 'Seguranca e Tecnologia', 81),
  ('tomadas_usb_nos_comodos', 'Tomadas USB nos comodos', 'Seguranca e Tecnologia', 82),
  ('gerador_de_energia', 'Gerador de energia (areas comuns/elevador)', 'Seguranca e Tecnologia', 83),
  ('sensor_de_presenca', 'Sensor de presenca', 'Seguranca e Tecnologia', 84),

  ('vagas_cobertas', 'Vagas cobertas', 'Garagem e Funcionalidades', 85),
  ('vagas_livres_independentes', 'Vagas livres/independentes (sem travar)', 'Garagem e Funcionalidades', 86),
  ('vaga_paralela', 'Vaga paralela', 'Garagem e Funcionalidades', 87),
  ('deposito_privativo_hobby_box', 'Deposito privativo na garagem (hobby box)', 'Garagem e Funcionalidades', 88),
  ('tomada_para_carro_eletrico', 'Tomada para carro eletrico', 'Garagem e Funcionalidades', 89),
  ('garagem_para_veiculos_grandes_suv', 'Garagem para veiculos grandes/SUV', 'Garagem e Funcionalidades', 90),

  ('condominio_clube', 'Condominio clube', 'Diferenciais de Condominio/Edificio', 91),
  ('academia_equipada', 'Academia equipada', 'Diferenciais de Condominio/Edificio', 92),
  ('salao_de_festas_decorado', 'Salao de festas decorado', 'Diferenciais de Condominio/Edificio', 93),
  ('piscina_aquecida_coberta', 'Piscina aquecida/coberta', 'Diferenciais de Condominio/Edificio', 94),
  ('quadra_poliesportiva_tenis', 'Quadra poliesportiva/tenis', 'Diferenciais de Condominio/Edificio', 95),
  ('playground_brinquedoteca', 'Playground/brinquedoteca', 'Diferenciais de Condominio/Edificio', 96),
  ('espaco_pet_pet_place', 'Espaco pet/pet place', 'Diferenciais de Condominio/Edificio', 97),
  ('elevador_privativo', 'Elevador privativo', 'Diferenciais de Condominio/Edificio', 98),
  ('espaco_coworking', 'Espaco coworking', 'Diferenciais de Condominio/Edificio', 99),
  ('fachada_moderna_revestida', 'Fachada moderna/revestida', 'Diferenciais de Condominio/Edificio', 100);

update public.property_features pf
set
  label_pt = d.label_pt,
  "group" = d.group_name,
  type = 'boolean',
  options = null,
  position = d.position,
  is_active = true
from _property_feature_defs d
where pf.key = d.key;

insert into public.property_features (key, label_pt, "group", type, options, position, is_active)
select
  d.key,
  d.label_pt,
  d.group_name,
  'boolean',
  null,
  d.position,
  true
from _property_feature_defs d
where not exists (
  select 1
  from public.property_features pf
  where pf.key = d.key
);

create temporary table _new_features as
select pf.id, pf.key, pf.label_pt, pf.position
from public.property_features pf
join _property_feature_defs d on d.key = pf.key;

create temporary table _old_features as
select pf.id, pf.key, pf.label_pt
from public.property_features pf
where pf.key not in (select key from _property_feature_defs);

create temporary table _explicit_feature_map (
  old_key text not null,
  new_key text not null
) on commit drop;

insert into _explicit_feature_map (old_key, new_key) values
  ('portaria_24h', 'portaria_24h_monitoramento'),
  ('seguranca_24h', 'portaria_24h_monitoramento'),
  ('fechadura_eletronica', 'fechadura_eletronica_biometria'),
  ('biometria', 'fechadura_eletronica_biometria'),
  ('camera_seguranca', 'cameras_de_seguranca_internas_externas'),
  ('cameras_seguranca', 'cameras_de_seguranca_internas_externas'),
  ('alarme', 'sistema_de_alarme'),
  ('portao_automatico', 'portao_eletronico'),
  ('interfone', 'interfone_video_porteiro'),
  ('video_porteiro', 'interfone_video_porteiro'),
  ('automacao', 'automacao_residencial_luzes_cortinas'),
  ('fibra_optica', 'internet_fibra_optica_disponivel'),
  ('tomada_usb', 'tomadas_usb_nos_comodos'),
  ('vaga_coberta', 'vagas_cobertas'),
  ('vaga_livre', 'vagas_livres_independentes'),
  ('vagas_livres', 'vagas_livres_independentes'),
  ('hobby_box', 'deposito_privativo_hobby_box'),
  ('carro_eletrico', 'tomada_para_carro_eletrico'),
  ('condominio_club', 'condominio_clube'),
  ('salao_festas', 'salao_de_festas_decorado'),
  ('piscina_aquecida', 'piscina_aquecida_coberta'),
  ('quadra', 'quadra_poliesportiva_tenis'),
  ('playground', 'playground_brinquedoteca'),
  ('brinquedoteca', 'playground_brinquedoteca'),
  ('pet_place', 'espaco_pet_pet_place'),
  ('coworking', 'espaco_coworking'),
  ('sol_manha', 'sol_da_manha'),
  ('vista_livre', 'vista_definitiva'),
  ('metro_proximo', 'proximo_ao_metro_transporte_publico'),
  ('rua_silenciosa', 'rua_tranquila_silenciosa'),
  ('proximo_parque', 'proximidade_de_parques_areas_verdes'),
  ('acesso_vias_rapidas', 'acesso_facil_a_vias_rapidas'),
  ('proximo_shopping', 'proximo_a_shoppings'),
  ('suite', 'suite_master'),
  ('escritorio', 'home_office_escritorio'),
  ('ar_condicionado', 'ar_condicionado_ou_infra_pronta'),
  ('aquecimento_gas', 'aquecimento_a_gas_ou_solar'),
  ('area_churrasqueira', 'area_de_churrasqueira_privativa'),
  ('jardim', 'jardim_paisagistico'),
  ('quintal', 'quintal_espacoso'),
  ('jacuzzi', 'jacuzzi_hidromassagem_externa'),
  ('piscina_privativa', 'piscina'),
  ('varanda_terreo', 'varanda_terrea'),
  ('garagem_suv', 'garagem_para_veiculos_grandes_suv'),
  ('fachada_moderna', 'fachada_moderna_revestida');

create or replace function pg_temp.feature_norm(input text)
returns text
language sql
immutable
as $fn$
  select regexp_replace(
    translate(lower(coalesce(input, '')),
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'
    ),
    '[^a-z0-9]+',
    '_',
    'g'
  );
$fn$;

create temporary table _old_to_new_map as
with old_norm as (
  select
    o.id,
    o.key,
    o.label_pt,
    pg_temp.feature_norm(o.key) as key_norm,
    pg_temp.feature_norm(o.label_pt) as label_norm
  from _old_features o
),
new_norm as (
  select
    n.id,
    n.key,
    n.label_pt,
    n.position,
    pg_temp.feature_norm(n.key) as key_norm,
    pg_temp.feature_norm(n.label_pt) as label_norm
  from _new_features n
),
explicit_matches as (
  select
    o.id as old_feature_id,
    n.id as new_feature_id,
    1000 as score,
    n.position as new_position
  from _explicit_feature_map em
  join old_norm o on o.key = em.old_key
  join new_norm n on n.key = em.new_key
),
auto_matches as (
  select
    o.id as old_feature_id,
    n.id as new_feature_id,
    case
      when o.key_norm = n.key_norm then 300
      when o.label_norm = n.label_norm then 280
      when o.key_norm = n.label_norm then 260
      when o.label_norm = n.key_norm then 240
      when o.key_norm like n.key_norm || '%' then 220
      when n.key_norm like o.key_norm || '%' then 210
      else 0
    end as score,
    n.position as new_position
  from old_norm o
  cross join new_norm n
),
candidates as (
  select old_feature_id, new_feature_id, score, new_position from explicit_matches
  union all
  select old_feature_id, new_feature_id, score, new_position
  from auto_matches
  where score >= 240
)
select distinct on (old_feature_id)
  old_feature_id,
  new_feature_id
from candidates
order by old_feature_id, score desc, new_position asc;

insert into public.property_feature_values (
  property_id,
  feature_id,
  value_boolean,
  value_number,
  value_text,
  value_json
)
select
  v.property_id,
  m.new_feature_id,
  v.value_boolean,
  v.value_number,
  v.value_text,
  v.value_json
from public.property_feature_values v
join _old_to_new_map m on m.old_feature_id = v.feature_id
where
  v.value_boolean is not null
  or v.value_number is not null
  or coalesce(btrim(v.value_text), '') <> ''
  or coalesce(v.value_json::text, '') not in ('', '[]', '{}')
on conflict (property_id, feature_id) do update
set
  value_boolean = excluded.value_boolean,
  value_number = excluded.value_number,
  value_text = excluded.value_text,
  value_json = excluded.value_json
where
  (
    public.property_feature_values.value_boolean is null
    and public.property_feature_values.value_number is null
    and coalesce(btrim(public.property_feature_values.value_text), '') = ''
    and coalesce(public.property_feature_values.value_json::text, '') in ('', '[]', '{}')
  )
  and (
    excluded.value_boolean is not null
    or excluded.value_number is not null
    or coalesce(btrim(excluded.value_text), '') <> ''
    or coalesce(excluded.value_json::text, '') not in ('', '[]', '{}')
  );

update public.property_features pf
set is_active = false
where pf.key not in (select key from _property_feature_defs);

commit;
