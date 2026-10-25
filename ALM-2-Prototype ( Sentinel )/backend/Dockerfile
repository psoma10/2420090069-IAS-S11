FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    SENTINEL_DB=/data/sentinel.db
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 48731
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:48731/api/health',timeout=2).status==200 else 1)"
# Single worker: detection state is process-local.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "48731"]
