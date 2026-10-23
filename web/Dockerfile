FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY web/requirements.txt /app/web/requirements.txt
RUN pip install --no-cache-dir -r /app/web/requirements.txt
COPY config /app/config
COPY web /app/web
WORKDIR /app/web
RUN chmod +x /app/web/entrypoint.sh && DJANGO_SECRET_KEY=build-only-not-for-runtime python manage.py collectstatic --noinput
EXPOSE 8000
CMD ["/app/web/entrypoint.sh"]
