FROM node:22-bookworm-slim AS frontend-build
WORKDIR /src/Frontend
COPY Frontend/package*.json ./
RUN npm ci
COPY Frontend/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS backend-build
WORKDIR /src
COPY Backend/Jenny.Api.csproj Backend/
RUN dotnet restore Backend/Jenny.Api.csproj
COPY Backend/ Backend/
COPY --from=frontend-build /src/Frontend/dist Backend/wwwroot
RUN dotnet publish Backend/Jenny.Api.csproj -c Release -o /out --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* \
 && groupadd --system jenny && useradd --system --gid jenny --home /app --shell /usr/sbin/nologin jenny
WORKDIR /app
COPY --from=backend-build /out ./
RUN mkdir -p /app/data /app/uploads && chown -R jenny:jenny /app
USER jenny
ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production
ENV ConnectionStrings__Default="Data Source=/app/data/jenny.db"
ENV UPLOADS_DIR=/app/uploads
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/api/health || exit 1
ENTRYPOINT ["dotnet", "Jenny.Api.dll"]
