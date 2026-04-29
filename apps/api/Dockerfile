FROM python:3.11-slim AS base

WORKDIR /app

ARG APT_MIRROR=https://deb.debian.org/debian
ARG APT_SECURITY_MIRROR=https://deb.debian.org/debian-security
ARG APT_PIPELINE_DEPTH=0

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
COPY apps/api/requirements-manim.txt ./requirements-manim.txt
RUN pip install --no-cache-dir -r requirements.txt -r requirements-manim.txt

COPY apps/api ./apps/api
COPY skills ./skills
COPY data ./data

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--app-dir", "apps/api", "--host", "0.0.0.0", "--port", "8000"]
