# Custom Twitch Chat

*[Read in English](README.md)*

Gerador e runtime standalone de chat customizável da Twitch para o OBS Browser Source — feito para rodar direto no GitHub Pages ou como arquivo local (`chat.html` único ou `.zip`), sem depender de plataformas externas como StreamElements.

## Recursos

- **Conexão direta via Twitch IRCv3 WebSocket**: Conexão anônima (`justinfan`) com reconexão automática exponencial, sem bibliotecas pesadas.
- **Eventos completos da Twitch**: Mensagens, `/me`, respostas (reply), badge de primeira mensagem, mensagens destacadas, Shared Chat (`source-room-id`), subs/resubs/gifts/gift bombs, bits cheers, raids, anúncios e **Watch Streaks** (`viewermilestone`).
- **Emotes e Badges**: Emotes nativos da Twitch (alinhados por code points Unicode), 7TV, BetterTTV, FrankerFaceZ (canal com prioridade sobre global), Twemoji e resolução de badges/avatares via IVR.
- **Login OAuth dentro do OBS (Opcional)**: Usa **Device Code Grant Flow** da Twitch (client público, sem segredo) com QR code direto no overlay; os tokens ficam somente no `localStorage` do OBS para entregar Channel Points (com nome da recompensa) e Follows.
- **Duas formas de entrega**:
  1. **URL hospedada**: Hash compacto `#c=1.<base64url>` em `overlay.html`.
  2. **Arquivo local**: `chat.html` único auto-contido (com CSP SHA-256) ou pacote `.zip` (`chat.html`, `chat.css`, `chat.js`, `config.js`, `config.json`).
- **Migração do StreamElements**: Cole ou envie seu `chat.data.json` antigo na área de Importação.

## Configuração no OBS

1. Abra o configurador (`index.html` ou a URL do GitHub Pages) e informe o nome do seu canal.
2. Ajuste tipografia, cores, bordas, emotes, eventos ou escolha um preset (`Default`, `Peneku Chat`, `Minimal`).
3. Clique em **Copiar URL hospedada** (cole na URL da Fonte de Navegador do OBS) ou em **Baixar `chat.html` único** (marque *Arquivo local* no OBS).
4. Dimensões recomendadas: **Largura 500**, **Altura 800**, e mantenha *Atualizar navegador quando a cena ficar ativa* desmarcado.

### Login OAuth opcional dentro do OBS

1. Crie um app em `https://dev.twitch.tv/console/apps` com Client Type **Public** (Redirect URL: a URL do seu GitHub Pages).
2. Configure `TWITCH_CLIENT_ID` nas Variables do repositório (ou informe no campo **Client ID** dentro do configurador).
3. Ative **Ativar login da Twitch no OBS** e exporte o overlay.
4. No OBS, clique com o botão direito na Fonte de Navegador -> **Interagir**, escaneie o QR code ou acesse `twitch.tv/activate` e autorize. O token fica salvo apenas no navegador do OBS.

## Desenvolvimento

```bash
npm install
npm run dev          # Compila o runtime e inicia o servidor Vite
./scripts/check      # Checagem de conteúdo + Vitest (>= 90% cobertura) + build completo
npm run bench        # Benchmark de throughput de parsing IRC e emotes
```
