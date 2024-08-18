# This file installs the 'directus-hook-sqlite-spatialite' extension
# It is not needed for the build of the directus-hook-sqlite-perf extension but
# it shows how it works this way (and makes this warning go away: "WARN:
# Spatialite isn't installed. Geometry type support will be limited.")

FROM directus/directus:11.0.2
LABEL authors="Jogchum Koerts <jogchum@clevercactus.dev"

USER root

RUN <<EOF
  apk --no-cache add libspatialite
  ln -s mod_spatialite.so.8 /usr/lib/mod_spatialite
  corepack enable
EOF

USER node

RUN pnpm install \
    directus-hook-sqlite-spatialite@latest \
    directus-hook-sqlite-perf@latest
