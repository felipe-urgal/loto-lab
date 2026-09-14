# Loto Lab — 02 Designer

Overlay local do papel `02-designer`. As responsabilidades globais do papel continuam definidas pelo workflow externo.

Para o Loto Lab:

- leia `AGENTS.md`, `docs/WEB.md` e `docs/design/PROTOTYPE_1_DARK_MODERN.md` quando a mudança tocar interface;
- preserve a direção visual dark atual: fundos azul-preto/grafite, azul para ação/seleção/dado principal e verde para sucesso/positivo;
- texto funcional deve permanecer >=16px e desktop/mobile precisam continuar utilizáveis;
- considere foco, teclado, `prefers-reduced-motion`, loading, empty, error e success como comportamento real da interface;
- não invente gráfico, métrica, previsão ou evidência que os dados não suportam;
- não crie fallback funcional paralelo para manter código legado quando já existe owner canônico em TypeScript;
- dados externos devem ser apresentados de forma segura, sem transformar `innerHTML` em atalho.