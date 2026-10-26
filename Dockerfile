# syntax=docker/dockerfile:1.7
# Multi-stage build: React client -> .NET server (which serves the client from wwwroot) -> small non-root runtime image.
# Versions match global.json (SDK 10.0.402) and .node-version (24.22.1); the lock files are enforced.

FROM node:24.22.1-bookworm-slim AS client
WORKDIR /src
COPY package.json package-lock.json .npmrc ./
COPY client/package.json client/package.json
RUN npm ci --workspace @varai/client --ignore-scripts
COPY client client
COPY contracts contracts
COPY tests/contract-stubs tests/contract-stubs
# Only bundles: `npm run build` also type-checks the browser-test project, which is not part of the image.
# Type checking is `npm run typecheck`, run in development and CI.
RUN npm exec --workspace @varai/client -- vite build

FROM mcr.microsoft.com/dotnet/sdk:10.0.402 AS server
WORKDIR /src
COPY global.json Directory.Build.props NuGet.Config ./
COPY server server
RUN dotnet restore server/VarAI.Server.csproj --locked-mode
COPY --from=client /src/client/dist client/dist
RUN dotnet publish server/VarAI.Server.csproj --no-restore --configuration Release --output /app/publish -p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=server /app/publish .
ENV ASPNETCORE_HTTP_PORTS=8080 \
    DOTNET_EnableDiagnostics=0
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "VarAI.Server.dll"]
