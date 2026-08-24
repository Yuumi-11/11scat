FROM node:22-alpine

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

WORKDIR /app

COPY .next/standalone ./
COPY .next/static ./.next/static
COPY public ./public

# Windows builds materialize pnpm junctions as directories in the Docker
# context, so restore the top-level package links Next.js expects at runtime.
RUN for package in node_modules/.pnpm/node_modules/*; do \
      name="$(basename "$package")"; \
      if [ ! -e "node_modules/$name" ]; then \
        ln -s ".pnpm/node_modules/$name" "node_modules/$name"; \
      fi; \
    done

EXPOSE 3000

CMD ["node", "server.js"]
