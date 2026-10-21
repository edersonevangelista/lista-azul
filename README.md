# Lista Azul — PWA compartilhada

Versão adaptada para login e lista compartilhada entre dois usuários, usando Supabase Auth + PostgreSQL + Realtime.

## Antes de começar

Esta versão precisa de um projeto Supabase configurado. O código não contém credenciais reais: configure `config.js` com a Project URL e a chave pública/anon do seu projeto. **Nunca use a `service_role` key no navegador.**

## Configuração do Supabase

1. Crie um projeto em https://supabase.com/.
2. Em Project Settings / API (ou Connect), copie a Project URL e a chave pública `anon`/publishable.
3. Cole os dois valores em `config.js`.
4. Abra o SQL Editor do Supabase e execute `supabase-setup.sql`.
5. O SQL retorna o UUID da família/lista. Copie-o.
6. Crie sua conta e a conta da sua esposa na tela de login do app. Se a confirmação de e-mail estiver habilitada, confirmem os dois e-mails.
7. No painel Supabase, abra Authentication > Users e copie o UUID de cada usuário.
8. No SQL Editor, execute este comando substituindo os três UUIDs pelos valores reais:

```sql
insert into public.household_members (household_id, user_id) values
('UUID_DA_FAMILIA', 'UUID_DO_USUARIO_1'),
('UUID_DA_FAMILIA', 'UUID_DO_USUARIO_2');
```

9. No Supabase, habilite Realtime para a tabela `public.shared_lists` (Database > Replication / Publications, conforme a interface atual).
10. Saia e entre novamente nos dois celulares.

## Executar localmente

O Service Worker só funciona em `localhost` ou HTTPS. Na pasta do projeto, execute:

```bash
python -m http.server 8000
```

Abra `http://localhost:8000`.

## Publicar

Você pode publicar os arquivos estáticos em GitHub Pages ou outra hospedagem HTTPS. O arquivo `config.js` deve estar configurado antes da publicação.

## Comportamento e limitações

- Os dois usuários veem a mesma lista associada à família.
- As alterações são salvas no Supabase e podem chegar em tempo real aos outros dispositivos.
- Login exige conexão com internet. O cache offline cobre a interface, mas esta versão não permite fazer alterações offline e sincronizá-las depois.
- Para manter segurança, as tabelas usam Row Level Security (RLS) e as políticas limitam a leitura/alteração aos membros da lista.
- A associação dos usuários é feita manualmente no painel Supabase neste primeiro MVP.
- A lista é compartilhada por família; criar múltiplas famílias ou convites dentro do app fica para uma próxima etapa.

## Arquivos

- `index.html`: tela de login e interface das três abas.
- `styles.css`: layout responsivo.
- `app.js`: autenticação, regras da lista e atualização em tempo real.
- `config.js`: configuração pública do Supabase.
- `supabase-setup.sql`: tabelas, políticas RLS e instruções de associação.
- `manifest.webmanifest`, `service-worker.js`, `icons/`: suporte PWA.
