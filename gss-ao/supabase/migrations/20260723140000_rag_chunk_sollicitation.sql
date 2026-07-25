-- ════════════════════════════════════════════════════════════════════════════════════════
-- RAG : autoriser la source 'SOLLICITATION' dans public.rag_chunk
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Les réponses d'équipe aux sollicitations (question_interne) sont indexées automatiquement
-- dans la base de connaissance RAG à leur réception (Edge Function inbound-email). Elles
-- portent source='SOLLICITATION'. On étend la contrainte CHECK en conséquence.

alter table public.rag_chunk drop constraint if exists rag_chunk_source_check;
alter table public.rag_chunk add constraint rag_chunk_source_check
  check (source in ('GSS','TEMPLATE','DCE','WEB','MANUEL','AUTRE','SOLLICITATION'));

comment on constraint rag_chunk_source_check on public.rag_chunk is
  'Sources autorisées. SOLLICITATION = réponse d''équipe indexée automatiquement (inbound-email).';
