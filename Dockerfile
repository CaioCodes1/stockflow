# ---------------------------------------------------------------------------
# Imagem da API.
#
# `alpine` produz uma imagem pequena (~50 MB contra ~350 MB da imagem cheia):
# menos bytes para transferir e menos software instalado significa tambem menos
# superficie de ataque.
# ---------------------------------------------------------------------------
FROM node:20-alpine

WORKDIR /app

# Copiamos SO os manifestos antes do resto do codigo de proposito.
# O Docker guarda cache por camada: enquanto package.json nao mudar, a camada do
# `npm ci` e reaproveitada e a instalacao nao roda de novo. Se copiassemos tudo
# de uma vez, qualquer alteracao em um arquivo .js invalidaria o cache e faria
# reinstalar todas as dependencias.
COPY package*.json ./

# `npm ci` (em vez de `npm install`) instala EXATAMENTE o que esta no
# package-lock.json. Build reproduzivel: a imagem de hoje tem as mesmas versoes
# da imagem de seis meses atras.
RUN npm ci

# O schema precisa existir antes do `prisma generate`.
COPY prisma ./prisma
# O Prisma Client e CODIGO GERADO a partir do schema.prisma. Sem este passo,
# `import { PrismaClient }` falharia dentro do container.
RUN npx prisma generate

COPY src ./src
COPY public ./public

ENV NODE_ENV=production
EXPOSE 3000

# Rodar como usuario sem privilegios: se alguem escapar da aplicacao, nao cai
# como root dentro do container. A imagem node ja traz o usuario `node`.
USER node

# `migrate deploy` (e nao `migrate dev`) e a forma correta em producao: aplica as
# migrations existentes e nunca tenta gerar novas nem apagar dados.
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
