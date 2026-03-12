FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Install build deps and pip requirements
COPY requirements.txt /app/requirements.txt
RUN pip install --upgrade pip \
    && pip install --no-cache-dir -r /app/requirements.txt

# Copy application code
COPY . /app

# Create non-root user and data dir
RUN groupadd -r app && useradd -r -g app app || true
RUN mkdir -p /data/pipeline && chown -R app:app /data

USER app
VOLUME ["/data"]

ENTRYPOINT ["/app/scripts/entrypoint.sh"]
