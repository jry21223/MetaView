FROM node:22-slim AS web_deps

WORKDIR /app

ARG NPM_REGISTRY=https://registry.npmmirror.com

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/agent/package.json ./apps/agent/package.json
RUN npm install --workspace=apps/web --no-audit --no-fund \
        --registry="${NPM_REGISTRY}" \
        --fetch-retries=5 \
        --fetch-retry-mintimeout=20000 \
        --fetch-retry-maxtimeout=120000
COPY apps/web ./apps/web

FROM python:3.11-slim AS base

WORKDIR /app

ARG APT_MIRROR=https://deb.debian.org/debian
ARG APT_SECURITY_MIRROR=https://deb.debian.org/debian-security
ARG APT_PIPELINE_DEPTH=0
ARG PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
ARG PIP_TRUSTED_HOST=pypi.tuna.tsinghua.edu.cn

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN sed -i "s|http://deb.debian.org/debian|${APT_MIRROR}|g; s|https://deb.debian.org/debian|${APT_MIRROR}|g; s|http://deb.debian.org/debian-security|${APT_SECURITY_MIRROR}|g; s|https://deb.debian.org/debian-security|${APT_SECURITY_MIRROR}|g" /etc/apt/sources.list.d/debian.sources \
    && apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 -o Acquire::http::Pipeline-Depth=${APT_PIPELINE_DEPTH} -o Acquire::https::Pipeline-Depth=${APT_PIPELINE_DEPTH} update \
    && apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 -o Acquire::http::Pipeline-Depth=${APT_PIPELINE_DEPTH} -o Acquire::https::Pipeline-Depth=${APT_PIPELINE_DEPTH} install -y --no-install-recommends \
        build-essential \
        pkg-config \
        libcairo2-dev \
        libpango1.0-dev \
        libffi-dev \
        ffmpeg \
        fontconfig \
        fonts-noto-cjk \
        libnss3 \
        texlive-latex-base \
        texlive-latex-extra \
        texlive-fonts-recommended \
        texlive-science \
        dvisvgm \
        ghostscript \
        cm-super \
    && rm -rf /var/lib/apt/lists/*

COPY apps/api/requirements.txt ./requirements.txt
COPY apps/api/requirements-subjects.txt ./requirements-subjects.txt
RUN pip install --no-cache-dir \
        --index-url "${PIP_INDEX_URL}" \
        --trusted-host "${PIP_TRUSTED_HOST}" \
        --retries 5 \
        --timeout 120 \
        -r requirements.txt \
        -r requirements-subjects.txt

COPY apps/api ./apps/api
COPY skills ./skills
COPY data ./data
COPY --from=web_deps /usr/local/bin/node /usr/local/bin/node
COPY --from=web_deps /usr/local/bin/npm /usr/local/bin/npm
COPY --from=web_deps /usr/local/bin/npx /usr/local/bin/npx
COPY --from=web_deps /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
COPY --from=web_deps /app/node_modules ./node_modules
COPY --from=web_deps /app/apps/web ./apps/web

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--app-dir", "apps/api", "--host", "0.0.0.0", "--port", "8000"]
